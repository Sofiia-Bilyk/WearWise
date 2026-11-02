"""Service layer for creating wardrobe items (handles image uploads + validation)."""

import base64
import logging

from flask import current_app

from ..helpers import StorageHandler
from ..models import Item
from .base_service import BaseService
from .exceptions import ValidationError

logger = logging.getLogger(__name__)

# Common image MIME sub-types → on-disk extensions.
_MIME_TO_EXT = {
    "png": ".png",
    "jpg": ".jpg",
    "jpeg": ".jpg",
    "webp": ".webp",
    "gif": ".gif",
    "bmp": ".bmp",
    "tiff": ".tiff",
}


def _ext_from_mime(mime_part: str) -> str:
    """``'data:image/png;base64'`` → ``'.png'``; defaults to ``'.jpg'``."""
    try:
        subtype = mime_part.split("/")[1].split(";")[0].lower()
    except IndexError:
        return ".jpg"
    return _MIME_TO_EXT.get(subtype, ".jpg")


class ItemService(BaseService):
    """Create-flow for :class:`Item`: normalize input, validate, save image."""

    @property
    def model(self):
        return Item

    def pre_process(self, data):
        """Coerce ``cost`` to float and default ``category`` to ``'Top'``."""
        processed = super().pre_process(data)

        if "cost" in data and data["cost"] is not None:
            try:
                processed["cost"] = float(data["cost"])
            except (ValueError, TypeError):
                # Validation runs next and will reject the bad value.
                pass

        processed.setdefault("category", "Top")
        return processed

    def validate(self, data):
        """Require a name and reject negative or non-numeric costs."""
        if not data.get("name"):
            raise ValidationError("Item name is required")
        if "cost" in data and data["cost"] is not None:
            if not isinstance(data["cost"], (int, float)):
                raise ValidationError("Invalid cost value")
            if data["cost"] < 0:
                raise ValidationError("Cost cannot be negative")

    def handle_files(self, data, files):
        """Decode any base64 image from the JSON payload and persist it."""
        image_val = data.pop("image", "")
        if not image_val:
            return {}
        if not isinstance(image_val, str):
            raise ValidationError("Image must be a data URL or image path")
        if not image_val.startswith("data:image/"):
            # The UI can send a placeholder or an existing path instead of bytes.
            return {"image_path": image_val}

        try:
            mime_part, b64_part = image_val.split(",", 1)
            image_bytes = base64.b64decode(b64_part)
            path = StorageHandler.save_file(
                image_bytes,
                current_app.config["UPLOAD_FOLDER"],
                is_base64=True,
                ext=_ext_from_mime(mime_part),
            )
            return {"image_path": path}
        except Exception as exc:
            logger.error("Failed to process item image: %s", exc)
            # ValidationError → 400 so the client gets a helpful message
            # instead of a generic 500.
            raise ValidationError("Could not read uploaded image")


    def post_create(self, resource, raw_data):
        # Persist vector/status in the same transaction as the new wardrobe item.
        # If the model is not cached, manual item creation still succeeds.
        from .embedding_store import refresh_item_embedding
        refresh_item_embedding(resource)
