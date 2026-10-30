from sqlalchemy.orm import joinedload
from ..models import db, Item, OutfitItem

class Wardrobe:
    """
    The Wardrobe class manages the collection of a user's clothing items.
    It implements the Iterator pattern to provide clean, filtered access 
    to the active inventory without exposing SQL details.
    """
    def __init__(self, user_id):
        self.user_id = user_id

    def _base_query(self):
        """Centralized base query for items with necessary relations loaded."""
        return (
            db.select(Item)
            .where(Item.user_id == self.user_id, Item.archived_at.is_(None))
            .options(joinedload(Item.outfit_items).joinedload(OutfitItem.outfit))
        )

    def __iter__(self):
        """Allows iterating directly over the Wardrobe object to get all active items."""
        items = db.session.execute(self._base_query()).unique().scalars().all()
        for item in items:
            yield item

    def get_items(self):
        """Returns the full list of active items (useful for JSON serialization)."""
        return list(self)

    def get_by_category(self, category):
        """Generator that filters items by category."""
        query = self._base_query().where(Item.category == category)
        items = db.session.execute(query).unique().scalars().all()
        for item in items:
            yield item
