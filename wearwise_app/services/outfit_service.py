import logging
from datetime import date
from flask import current_app
from .exceptions import ValidationError, UnsupportedMediaTypeError, PayloadTooLargeError
from .base_service import BaseService
from ..models import Outfit, OutfitItem, Item, db
from ..helpers import StorageHandler

logger = logging.getLogger(__name__)

class OutfitService(BaseService):
    @property
    def model(self):
        return Outfit

    def pre_process(self, data):
        processed = super().pre_process(data)
        worn_date_str = data.get("date")
        try:
            processed["worn_date"] = date.fromisoformat(worn_date_str) if worn_date_str else date.today()
        except (ValueError, TypeError):
            processed["worn_date"] = date.today()
        
        # Cleanup fields mapping to model
        if "notes" not in processed:
            processed["notes"] = data.get("notes", "")
            
        # Keep item_ids in the data for validation, even if they aren't on the model
        processed.pop("date", None)
        return processed

    def validate(self, data):
        """Domain validation for Outfits."""
        # Check that item_ids exists and is correctly formatted
        item_ids = data.get("item_ids")
        if item_ids is not None:
            if not isinstance(item_ids, list):
                raise ValidationError("item_ids must be a list")
            for iid in item_ids:
                try:
                    int(iid)
                except (ValueError, TypeError):
                    raise ValidationError(f"Invalid item ID: {iid}. Must be an integer.")

    def post_validate(self, data):
        """Remove fields that aren't on the model but were needed for validation."""
        data.pop("item_ids", None)

    def handle_files(self, data, files):
        if files and "image" in files:
            f = files["image"]
            if not f.content_type or not f.content_type.startswith("image/"):
                raise UnsupportedMediaTypeError("Only image files are allowed")
            
            f.stream.seek(0, 2)
            file_size = f.stream.tell()
            f.stream.seek(0)
            if file_size > 10 * 1024 * 1024:
                raise PayloadTooLargeError("Image too large (max 10 MB)")
                
            path = StorageHandler.save_file(
                f, current_app.config["UPLOAD_FOLDER"]
            )
            return {"image_path": path}
        return {}

    def post_create(self, resource, raw_data):
        """Handle many-to-many associations for OutfitItems."""
        # Use flush to get the ID if not already available
        db.session.flush()
        
        item_ids = raw_data.get("item_ids", [])
        for iid in item_ids:
            try:
                # Security: Ensure item belongs to the same user
                item = Item.query.filter_by(id=int(iid), user_id=resource.user_id).first()
                if item:
                    db.session.add(OutfitItem(
                        outfit_id=resource.id, 
                        item_id=item.id, 
                        user_action="user_added"
                    ))
            except (ValueError, TypeError):
                logger.warning("Invalid item ID provided in outfit creation: %s", iid)
                continue
