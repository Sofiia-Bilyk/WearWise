"""Wardrobe item endpoints — list, create, update, soft-delete."""

import base64
import logging
from datetime import date, datetime

from flask import Blueprint, current_app, jsonify, request

from ..auth_guard import require_auth
from ..helpers import StorageHandler
from ..models import Item, db
from ..serializers import item_to_dict
from ..services.exceptions import ServiceError
from ..services.item_service import ItemService
from ..services.wardrobe_manager import Wardrobe

logger = logging.getLogger(__name__)

# Common image MIME sub-types → on-disk extensions for data-URL uploads.
_MIME_TO_EXT: dict[str, str] = {
    "jpeg": ".jpg",
    "jpg":  ".jpg",
    "png":  ".png",
    "webp": ".webp",
    "gif":  ".gif",
    "bmp":  ".bmp",
    "tiff": ".tiff",
}


def _ext_from_mime(mime_part: str) -> str:
    """Extract a file extension from a data-URL MIME header.

    e.g. ``'data:image/png;base64'`` → ``'.png'``. Falls back to ``'.jpg'``.
    """
    try:
        subtype = mime_part.split("/")[1].split(";")[0].lower()
    except IndexError:
        return ".jpg"
    return _MIME_TO_EXT.get(subtype, ".jpg")


items_bp = Blueprint("items", __name__)


@items_bp.route("/items", methods=["GET"])
def get_items():
    """Return every active (non-archived) item in the user's wardrobe."""
    user, err = require_auth()
    if err:
        return err

    wardrobe = Wardrobe(user.id)
    return jsonify([item_to_dict(item) for item in wardrobe])


@items_bp.route("/items", methods=["POST"])
def create_item():
    """Add a new item to the wardrobe."""
    user, err = require_auth()
    if err:
        return err

    try:
        item = ItemService().create(user_id=user.id, data=request.get_json())
        return jsonify(item_to_dict(item)), 201
    except ServiceError as exc:
        return jsonify({"error": str(exc)}), exc.code
    except Exception as exc:
        logger.error("Failed to create item: %s", exc)
        return jsonify({"error": "Could not save item, please try again"}), 500


@items_bp.route("/items/<int:item_id>", methods=["PUT"])
def update_item(item_id):
    """Update mutable fields on an item the caller owns."""
    user, err = require_auth()
    if err:
        return err

    item = db.session.get(Item, item_id)
    if not item or item.archived_at is not None:
        return jsonify({"error": "Item not found or already archived"}), 404
    if item.user_id != user.id:
        return jsonify({"error": "You do not have permission to edit this item"}), 403

    data = request.get_json() or {}

    # Cost is the only field that needs server-side range validation.
    if "cost" in data and data["cost"] is not None:
        try:
            if float(data["cost"]) < 0:
                return jsonify({"error": "Cost cannot be negative"}), 400
        except (TypeError, ValueError):
            return jsonify({"error": "Invalid cost value"}), 400

    for field in ("name", "category", "color", "brand", "cost", "image_path"):
        if field in data:
            setattr(item, field, data[field])

    if "postponedUntil" in data:
        raw_postpone = data["postponedUntil"]
        if raw_postpone:
            try:
                item.postponed_until = date.fromisoformat(raw_postpone)
            except (TypeError, ValueError):
                return jsonify(
                    {"error": "postponedUntil must be a valid ISO date (YYYY-MM-DD)"}
                ), 400
        else:
            item.postponed_until = None

    if "image" in data:
        image_val = data["image"]
        if image_val and image_val.startswith("data:image/"):
            try:
                mime_part, b64_part = image_val.split(",", 1)
                image_bytes = base64.b64decode(b64_part)
                image_val = StorageHandler.save_file(
                    image_bytes,
                    current_app.config["UPLOAD_FOLDER"],
                    is_base64=True,
                    ext=_ext_from_mime(mime_part),
                )
            except Exception as exc:
                # Keep the existing image_path on failure; log and move on.
                logger.error("Failed to process item image: %s", exc)
                image_val = item.image_path
        item.image_path = image_val

    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error("Failed to update item %s: %s", item_id, exc)
        return jsonify({"error": "Could not save changes, please try again"}), 500
    return jsonify(item_to_dict(item))


@items_bp.route("/items/<int:item_id>", methods=["DELETE"])
def delete_item(item_id):
    """Soft-delete an item by setting ``archived_at``."""
    user, err = require_auth()
    if err:
        return err

    item = db.session.get(Item, item_id)
    if not item or item.archived_at is not None:
        return jsonify({"error": "Item not found or already archived"}), 404
    if item.user_id != user.id:
        return jsonify({"error": "You do not have permission to delete this item"}), 403

    item.archived_at = datetime.utcnow()
    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error("Failed to delete item %s: %s", item_id, exc)
        return jsonify({"error": "Could not delete item, please try again"}), 500
    return jsonify({"message": "Archived"})
