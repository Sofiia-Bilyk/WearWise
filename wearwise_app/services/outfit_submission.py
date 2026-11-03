"""Atomic outfit saves with account-scoped, durable retry receipts."""
import base64
import hashlib
import json
import logging
import math
import os
from datetime import date
from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4

from flask import current_app
from PIL import Image, ImageOps, JpegImagePlugin, PngImagePlugin, WebPImagePlugin
from PIL import GifImagePlugin, BmpImagePlugin, TiffImagePlugin
from sqlalchemy.exc import IntegrityError

from ..models import db, Item, Outfit, OutfitItem, OutfitSubmission
from ..serializers import item_to_dict, outfit_to_dict
from .embedding_store import refresh_item_embedding
from .exceptions import ServiceError, ValidationError, PayloadTooLargeError

logger = logging.getLogger(__name__)
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000
CATEGORIES = {'Top', 'Bottom', 'Shoes', 'Outerwear', 'Accessory'}


class SubmissionConflict(ServiceError):
    code = 409


def submission_id(value):
    try:
        return str(UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError('A valid submissionId UUID is required.')


def find_submission(user_id, key):
    return db.session.scalar(db.select(OutfitSubmission).where(
        OutfitSubmission.user_id == user_id,
        OutfitSubmission.submission_id == key,
    ))


def replay(record, fingerprint):
    if record.status == 'cancelled':
        raise SubmissionConflict('This save attempt was cancelled. Confirm the draft again.')
    if record.fingerprint != fingerprint:
        raise SubmissionConflict('This submissionId was already used for a different outfit.')
    if record.status != 'saved' or record.response is None:
        raise SubmissionConflict('This save attempt has not completed. Retry shortly.')
    return record.response


def clean_image(raw):
    """Decode actual contents, bound dimensions, strip metadata, and save as JPEG."""
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ValidationError('Each image must be nonempty and no larger than 10 MB.')
    # Ultralytics replaces Image.open with a HEIF auto-installer. Select a
    # supported decoder directly so corrupt input cannot trigger installations.
    if raw.startswith(b'\xff\xd8\xff'):
        decoder = JpegImagePlugin.JpegImageFile
    elif raw.startswith(b'\x89PNG\r\n\x1a\n'):
        decoder = PngImagePlugin.PngImageFile
    elif raw.startswith(b'RIFF') and raw[8:12] == b'WEBP':
        decoder = WebPImagePlugin.WebPImageFile
    elif raw.startswith((b'GIF87a', b'GIF89a')):
        decoder = GifImagePlugin.GifImageFile
    elif raw.startswith(b'BM'):
        decoder = BmpImagePlugin.BmpImageFile
    elif raw.startswith((b'II*\x00', b'MM\x00*')):
        decoder = TiffImagePlugin.TiffImageFile
    else:
        raise ValidationError('Use a JPEG, PNG, WebP, GIF, BMP, or TIFF image.')
    try:
        with decoder(BytesIO(raw)) as image:
            if image.width * image.height > MAX_PIXELS:
                raise ValueError('Image dimensions are too large.')
            if getattr(image, 'is_animated', False):
                raise ValueError('Animated images are not supported.')
            image.load()
            output = BytesIO()
            oriented = ImageOps.exif_transpose(image)
            rgb = oriented.convert('RGB')
            try:
                rgb.save(output, format='JPEG', quality=90)
            finally:
                rgb.close()
                if oriented is not image:
                    oriented.close()
            result = output.getvalue()
            if len(result) > MAX_IMAGE_BYTES:
                raise ValueError('Converted image is too large.')
            return result
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError) as exc:
        raise ValidationError('An uploaded image could not be read safely.') from exc


def crop_bytes(value):
    if value is None or value == '':
        return None
    if not isinstance(value, str) or len(value) > 14_000_000:
        raise ValidationError('New item images must be base64 image data URLs.')
    try:
        header, encoded = value.split(',', 1)
        if not header.startswith('data:image/') or not header.endswith(';base64'):
            raise ValueError('Expected image data URL.')
        return clean_image(base64.b64decode(encoded, validate=True))
    except (ValueError, TypeError) as exc:
        raise ValidationError('New item images must be valid base64 image data URLs.') from exc


def text(data, key, limit, required=False):
    value = data.get(key, '')
    if not isinstance(value, str):
        raise ValidationError(f'{key} must be text.')
    value = value.strip()
    if len(value) > limit or (required and not value):
        raise ValidationError(f'{key} must contain 1–{limit} characters.' if required
                              else f'{key} must not exceed {limit} characters.')
    return value


def validate(payload, photo):
    if set(payload) - {'submissionId', 'date', 'entries'}:
        raise ValidationError('Unexpected outfit fields.')
    try:
        day = date.fromisoformat(payload['date'])
        if day.isoformat() != payload['date']:
            raise ValueError('Expected YYYY-MM-DD.')
    except (KeyError, TypeError, ValueError):
        raise ValidationError('Choose a valid outfit date (YYYY-MM-DD).')
    entries = payload.get('entries')
    if not isinstance(entries, list) or not 1 <= len(entries) <= 30:
        raise ValidationError('Choose between 1 and 30 outfit entries.')
    prepared = []
    new_ids = set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValidationError('Each outfit entry must be an object.')
        if entry.get('kind') == 'existing':
            value = entry.get('itemId')
            if (set(entry) != {'kind', 'itemId'} or not isinstance(value, str)
                    or not value.isascii() or not value.isdecimal() or len(value) > 18
                    or int(value) < 1):
                raise ValidationError('Existing entries need a valid itemId.')
            prepared.append(('existing', int(value), None))
        elif entry.get('kind') == 'new':
            if set(entry) != {'kind', 'draftId', 'item'}:
                raise ValidationError('Unexpected new item fields.')
            draft_id = text(entry, 'draftId', 100, required=True)
            if draft_id in new_ids:
                raise ValidationError('New item draft IDs must be unique.')
            new_ids.add(draft_id)
            data = entry.get('item')
            if not isinstance(data, dict) or set(data) - {'name', 'category', 'color', 'brand', 'cost', 'image'}:
                raise ValidationError('Unexpected item fields.')
            fields = {key: text(data, key, limit, required=key == 'name')
                      for key, limit in [('name', 120), ('category', 50), ('color', 50), ('brand', 80)]}
            if fields['category'] not in CATEGORIES:
                raise ValidationError('Choose a supported clothing category.')
            cost = data.get('cost')
            if cost is not None:
                try:
                    valid_cost = type(cost) in (int, float) and math.isfinite(cost) and cost >= 0
                except OverflowError:
                    valid_cost = False
                if not valid_cost:
                    raise ValidationError('Cost must be a finite, nonnegative number.')
            fields['cost'] = cost
            image = data.get('image', '')
            # The manual form uses this application-owned placeholder.
            if image == '/placeholder-garment.svg':
                image = ''
            prepared.append(('new', fields, crop_bytes(image)))
        else:
            raise ValidationError('Choose an existing or new item for every entry.')
    return day, prepared, clean_image(photo) if photo is not None else None


class StagedUploads:
    """Track only files owned by this attempt; never delete shared existing photos."""
    def __init__(self):
        self.root = Path(current_app.config['UPLOAD_FOLDER']).resolve()
        self.staging = self.root / '.staging'
        self.files = []

    def stage(self, raw):
        if raw is None:
            return None
        self.staging.mkdir(parents=True, exist_ok=True)
        name = f'outfit-{uuid4().hex}.jpg'
        temporary, final = self.staging / name, self.root / name
        self.files.append((temporary, final))
        with temporary.open('xb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        return f'/uploads/{name}'

    def publish(self):
        for temporary, final in self.files:
            os.replace(temporary, final)

    def cleanup(self):
        for pair in self.files:
            for path in pair:
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    logger.exception('Could not clean a failed outfit upload.')


def save_submission(user_id, payload, photo=None):
    if not isinstance(payload, dict):
        raise ValidationError('The submission must be an object.')
    key = submission_id(payload.get('submissionId'))
    try:
        canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'), allow_nan=False)
    except (TypeError, ValueError):
        raise ValidationError('The submission must contain valid JSON values.')
    fingerprint = hashlib.sha256((canonical + '\n' + (
        hashlib.sha256(photo).hexdigest() if photo is not None else 'no-photo'
    )).encode()).hexdigest()
    previous = find_submission(user_id, key)
    if previous:
        return replay(previous, fingerprint)
    day, prepared, image = validate(payload, photo)
    uploads = StagedUploads()
    committed = False
    try:
        record = OutfitSubmission(user_id=user_id, submission_id=key,
                                  fingerprint=fingerprint, status='pending')
        db.session.add(record)
        # Reserve before creating items. The database unique constraint also
        # serializes competing saves/cancellations for the same account/key.
        db.session.flush()
        existing_ids = {value for kind, value, _ in prepared if kind == 'existing'}
        owned = {item.id: item for item in db.session.scalars(db.select(Item).where(
            Item.id.in_(existing_ids), Item.user_id == user_id, Item.archived_at.is_(None)
        ))}
        if set(owned) != existing_ids:
            raise ValidationError('An item is unavailable or does not belong to your wardrobe.')
        items, new_items, seen = [], [], set()
        for kind, value, raw in prepared:
            if kind == 'existing':
                if value in seen:
                    continue
                seen.add(value)
                items.append(owned[value])
            else:
                item = Item(user_id=user_id, **value, image_path=uploads.stage(raw))
                db.session.add(item)
                new_items.append(item)
                items.append(item)
        outfit = Outfit(user_id=user_id, worn_date=day, image_path=uploads.stage(image))
        db.session.add(outfit)
        db.session.flush()
        for item in items:
            db.session.add(OutfitItem(outfit=outfit, item=item, user_action='user_added'))
        uploads.publish()
        for item in new_items:
            refresh_item_embedding(item)
        db.session.flush()
        response = {'submissionId': key, 'outfit': outfit_to_dict(outfit),
                    'items': [item_to_dict(item) for item in items]}
        record.response, record.status = response, 'saved'
        db.session.commit()
        committed = True
    except IntegrityError:
        db.session.rollback()
        uploads.cleanup()
        previous = find_submission(user_id, key)
        if previous:
            return replay(previous, fingerprint)
        raise
    except Exception:
        db.session.rollback()
        # A driver can lose acknowledgement after a successful commit. Check
        # the durable receipt before deleting any published photos.
        try:
            previous = find_submission(user_id, key)
        except Exception:
            # When the database is unavailable, keep files rather than risk
            # deleting photos referenced by a successfully committed outfit.
            logger.exception('Could not determine outfit commit outcome; preserving uploads.')
            raise
        if previous and previous.status == 'saved' and previous.fingerprint == fingerprint:
            return previous.response
        if not committed:
            uploads.cleanup()
        raise
    return response


def resolve_submission(user_id, key):
    """Recover success or durably cancel a missing attempt, including late requests."""
    key = submission_id(key)
    previous = find_submission(user_id, key)
    if previous:
        return {'status': previous.status, 'result': previous.response}
    try:
        db.session.add(OutfitSubmission(user_id=user_id, submission_id=key, status='cancelled'))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        previous = find_submission(user_id, key)
        if previous is None:
            raise
        return {'status': previous.status, 'result': previous.response}
    except Exception:
        db.session.rollback()
        raise
    return {'status': 'cancelled', 'result': None}
