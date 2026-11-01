"""Generate and persist photo vectors without blocking manual wardrobe use."""
import base64
import hashlib
import logging
from datetime import datetime
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit, unquote

from flask import current_app
from PIL import Image, UnidentifiedImageError

from ..models import ItemEmbedding, db
from .image_embeddings import (
    ImageEmbedding, MODEL_ID, MODEL_REVISION, PIPELINE_VERSION,
    MAX_IMAGE_PIXELS, create_image_embedding,
)

logger = logging.getLogger(__name__)
MAX_IMAGE_BYTES = 10 * 1024 * 1024


def decode_image(raw: bytes) -> Image.Image:
    """Bound byte count and decoded dimensions before loading pixel data."""
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ValueError('Image is empty or larger than 10 MB.')
    with Image.open(BytesIO(raw)) as image:
        width, height = image.size
        if width < 1 or height < 1 or width * height > MAX_IMAGE_PIXELS:
            raise ValueError('Image exceeds the supported dimensions.')
        image.load()
        # Preserve EXIF until the embedding pipeline applies orientation.
        return image.copy()


def decode_detection_crop(data_url: str) -> Image.Image:
    if not isinstance(data_url, str) or not data_url.startswith('data:image/'):
        raise ValueError('A detected garment needs an image crop.')
    if len(data_url) > 14_000_000:
        raise ValueError('Crop is too large.')
    header, payload = data_url.split(',', 1)
    if not header.endswith(';base64'):
        raise ValueError('Expected a base64 image crop.')
    return decode_image(base64.b64decode(payload, validate=True))


def _read_local_photo(image_path: str) -> bytes:
    """Read only app uploads. Never fetch a URL or follow a path outside uploads."""
    parsed = urlsplit(image_path)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
        raise ValueError('Only local uploaded photos can be embedded.')
    if not parsed.path.startswith('/uploads/'):
        raise ValueError('Only local uploaded photos can be embedded.')
    filename = unquote(parsed.path[len('/uploads/'):])
    if not filename or '/' in filename or '\\' in filename or filename in {'.', '..'}:
        raise ValueError('Invalid uploaded photo path.')
    folder = Path(current_app.config['UPLOAD_FOLDER']).resolve()
    path = (folder / filename).resolve()
    if not path.is_relative_to(folder):
        raise ValueError('Photo path leaves the upload folder.')
    with path.open('rb') as photo:
        raw = photo.read(MAX_IMAGE_BYTES + 1)
    return raw


def refresh_item_embedding(item, *, force=False):
    """Update within the caller's DB transaction, including failure status.

    Old vectors are invalidated before inference, so failed photo updates
    cannot continue matching against a garment's previous photo.
    """
    record = item.embedding
    if record is None:
        record = ItemEmbedding(item=item)
        db.session.add(record)
    path = item.image_path or ''
    try:
        raw = _read_local_photo(path) if path else None
        digest = hashlib.sha256(raw).hexdigest() if raw is not None else None
    except (OSError, ValueError):
        raw, digest = None, None

    if (not force and record.status == 'ready' and record.vector
            and record.source_image_path == path and digest is not None
            and record.image_sha256 == digest and record.model_id == MODEL_ID
            and record.pipeline_version == PIPELINE_VERSION
            and record.model_revision not in (None, 'unknown')
            and (MODEL_REVISION == 'main' or record.model_revision == MODEL_REVISION)):
        return 'skipped'

    record.vector = None
    record.model_id = record.model_revision = record.pipeline_version = None
    record.source_image_path = path
    record.image_sha256 = digest
    record.updated_at = datetime.utcnow()
    record.status = 'no_image' if not path else 'invalid_image'
    if raw is None:
        return record.status
    try:
        image = decode_image(raw)
    except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError):
        return record.status
    try:
        value = create_image_embedding(image)
        # Validate before persisting even if a future model implementation changes.
        from .garment_matching import _unit_vector
        _unit_vector(value)
        if not value.model_revision or value.model_revision == 'unknown':
            raise ValueError('Embedding checkpoint revision is unknown.')
    except Exception as exc:
        record.status = 'unavailable'
        logger.warning('Embedding unavailable for item %s (%s).', item.id, type(exc).__name__)
        return record.status
    finally:
        image.close()

    record.vector = value.vector
    record.model_id = value.model_id
    record.model_revision = value.model_revision
    record.pipeline_version = value.pipeline_version
    record.status = 'ready'
    return record.status


def stored_embedding(record):
    return ImageEmbedding(
        vector=record.vector, model_id=record.model_id,
        model_revision=record.model_revision, pipeline_version=record.pipeline_version,
    )
