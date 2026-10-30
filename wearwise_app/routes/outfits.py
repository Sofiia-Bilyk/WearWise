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
