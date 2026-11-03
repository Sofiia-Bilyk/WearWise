"""Outfit endpoints — list past outfits and log a new one."""

import logging

from flask import Blueprint, jsonify, request

from ..auth_guard import require_auth
from ..models import Outfit
from ..serializers import outfit_to_dict
from ..services.exceptions import ServiceError
from ..services.outfit_service import OutfitService

logger = logging.getLogger(__name__)

outfits_bp = Blueprint("outfits", __name__)


@outfits_bp.route("/outfits", methods=["GET"])
def get_outfits():
    """Return the caller's outfits, most recent first."""
    user, err = require_auth()
    if err:
        return err
    outfits = (
        Outfit.query
        .filter_by(user_id=user.id)
        .order_by(Outfit.worn_date.desc())
        .all()
    )
    return jsonify([outfit_to_dict(o) for o in outfits])


@outfits_bp.route("/outfits", methods=["POST"])
def create_outfit():
    """Log a new outfit. Accepts JSON or multipart (when an image is attached)."""
    user, err = require_auth()
    if err:
        return err

    # Multipart requests carry the photo file; pure JSON does not.
    if request.content_type and "multipart" in request.content_type:
        data = request.form.to_dict()
        data["item_ids"] = request.form.getlist("item_ids")
        files = request.files
    else:
        data = request.get_json() or {}
        files = None

    try:
        outfit = OutfitService().create(user_id=user.id, data=data, files=files)
        return jsonify(outfit_to_dict(outfit)), 201
    except ServiceError as exc:
        return jsonify({"error": str(exc)}), exc.code
    except Exception as exc:
        logger.error("Failed to create outfit: %s", exc)
        return jsonify({"error": "Could not log outfit, please try again"}), 500



@outfits_bp.route('/outfit-submissions', methods=['POST'])
def submit_outfit():
    """Save existing/new items, photos, and the daily log in one transaction."""
    import json
    from werkzeug.exceptions import BadRequest, RequestEntityTooLarge
    from ..models import db
    from ..services.outfit_submission import save_submission, MAX_IMAGE_BYTES

    user, err = require_auth()
    if err:
        return err
    # Enforce the total limit before parsing multipart or JSON, including
    # requests without Content-Length. Individual images are also bounded.
    request.max_content_length = 32 * 1024 * 1024
    try:
        photo = None
        if request.mimetype == 'multipart/form-data':
            if set(request.files) - {'image'} or set(request.form) != {'payload'}:
                raise BadRequest('Expected payload and an optional image.')
            payload = json.loads(request.form['payload'])
            if 'image' in request.files:
                photo = request.files['image'].stream.read(MAX_IMAGE_BYTES + 1)
        else:
            if not request.is_json:
                raise BadRequest('Expected JSON or multipart form data.')
            payload = request.get_json()
        result = save_submission(user.id, payload, photo)
        return jsonify(result), 200
    except RequestEntityTooLarge:
        return jsonify(error='Outfit submission exceeds 32 MB.'), 413
    except (BadRequest, json.JSONDecodeError):
        return jsonify(error='Invalid outfit submission JSON.'), 400
    except ServiceError as exc:
        db.session.rollback()
        return jsonify(error=str(exc)), exc.code
    except Exception:
        db.session.rollback()
        db.session.remove()
        logger.exception('Could not complete outfit submission.')
        return jsonify(error='Save outcome could not be confirmed. Retry the same submission.'), 503


@outfits_bp.route('/outfit-submissions/<key>/resolve', methods=['POST'])
def resolve_outfit_submission(key):
    from ..models import db
    from ..services.outfit_submission import resolve_submission

    user, err = require_auth()
    if err:
        return err
    try:
        return jsonify(resolve_submission(user.id, key))
    except ServiceError as exc:
        db.session.rollback()
        return jsonify(error=str(exc)), exc.code
    except Exception:
        db.session.rollback()
        logger.exception('Could not resolve outfit submission.')
        return jsonify(error='Could not check the save outcome. Please retry.'), 503
