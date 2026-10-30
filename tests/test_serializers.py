"""Unit tests for serializers."""
import pytest
import sys
import os
from datetime import date, datetime, timedelta
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'wearwise_app'))

from wearwise_app.models import User, Item, Outfit, OutfitItem, db
from wearwise_app.serializers import item_to_dict, outfit_to_dict


class TestItemToDict:
    """Tests for item_to_dict serializer."""

    def test_item_basic_serialization(self, app):
        """Test basic item serialization."""
        with app.app_context():
            user = User(email='serializer_test@example.com', password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            item = Item(
                name='Test Shirt',
                category='Top',
                color='Blue',
                brand='Nike',
                cost=50.00,
                user_id=user.id
            )
            db.session.add(item)
            db.session.commit()
            
            # Reload with joinedload for outfit_items
            from sqlalchemy.orm import joinedload
            item = db.session.execute(
                db.select(Item)
                .where(Item.id == item.id)
                .options(joinedload(Item.outfit_items).joinedload(OutfitItem.outfit))
            ).unique().scalars().first()
            
            result = item_to_dict(item)
            
            assert result['id'] == str(item.id)
            assert result['name'] == 'Test Shirt'
            assert result['category'] == 'Top'
            assert result['color'] == 'Blue'
            assert result['brand'] == 'Nike'
            assert result['cost'] == 50.00

    def test_item_wear_count(self, app):
        """Test wear count calculation."""
        with app.app_context():
            user = User(email='serializer_wear_test@example.com', password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            item = Item(name='Shirt', user_id=user.id)
            db.session.add(item)
            db.session.commit()
            
            # Create 3 outfits with this item
            for i in range(3):
                outfit = Outfit(user_id=user.id, worn_date=date.today() - timedelta(days=i))
                db.session.add(outfit)
                db.session.commit()
                oi = OutfitItem(outfit_id=outfit.id, item_id=item.id)
                db.session.add(oi)
            db.session.commit()
            
            from sqlalchemy.orm import joinedload
            item = db.session.execute(
                db.select(Item)
                .where(Item.id == item.id)
                .options(joinedload(Item.outfit_items).joinedload(OutfitItem.outfit))
            ).unique().scalars().first()
            
            result = item_to_dict(item)
            assert result['wearCount'] == 3

    def test_item_no_wear_count(self, app):
        """Test item with no wears."""
        with app.app_context():
            user = User(email='serializer_nowear@example.com', password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            item = Item(name='New Shirt', user_id=user.id)
            db.session.add(item)
            db.session.commit()
            
            from sqlalchemy.orm import joinedload
            item = db.session.execute(
                db.select(Item)
                .where(Item.id == item.id)
                .options(joinedload(Item.outfit_items).joinedload(OutfitItem.outfit))
            ).unique().scalars().first()
            
            result = item_to_dict(item)
            assert result['wearCount'] == 0

    def test_item_postponed_date(self, app):
        """Test postponed date serialization."""
        with app.app_context():
            user = User(email='serializer_postpone@example.com', password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            postpone_date = date(2025, 12, 31)
            item = Item(
                name='Postponed Shirt',
                postponed_until=postpone_date,
                user_id=user.id
            )
            db.session.add(item)
            db.session.commit()
            
            from sqlalchemy.orm import joinedload
            item = db.session.execute(
                db.select(Item)
                .where(Item.id == item.id)
                .options(joinedload(Item.outfit_items).joinedload(OutfitItem.outfit))
            ).unique().scalars().first()
            
            result = item_to_dict(item)
            assert result['postponedUntil'] == '2025-12-31'

    def test_item_no_postpone(self, app):
        """Test item with no postponement."""
        with app.app_context():
            user = User(email='serializer_nopostpone@example.com', password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            item = Item(name='Available Shirt', user_id=user.id)
            db.session.add(item)
            db.session.commit()
            
            from sqlalchemy.orm import joinedload
            item = db.session.execute(
                db.select(Item)
                .where(Item.id == item.id)
                .options(joinedload(Item.outfit_items).joinedload(OutfitItem.outfit))
            ).unique().scalars().first()
            
            result = item_to_dict(item)
            assert result['postponedUntil'] is None

    def test_item_missing_fields_defaults(self, app):
        """Test serialization handles missing optional fields."""
        with app.app_context():
            user = User(email='serializer_minimal@example.com', password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            item = Item(name='Minimal Shirt', user_id=user.id)  # No color, brand, etc.
            db.session.add(item)
            db.session.commit()
            
            from sqlalchemy.orm import joinedload
            item = db.session.execute(
                db.select(Item)
                .where(Item.id == item.id)
                .options(joinedload(Item.outfit_items).joinedload(OutfitItem.outfit))
            ).unique().scalars().first()
            
            result = item_to_dict(item)
            assert result['category'] == 'Top'  # Default
            assert result['color'] == ''
            assert result['brand'] == ''
            assert result['image'] == ''


class TestOutfitToDict:
    """Tests for outfit_to_dict serializer."""

    def test_outfit_basic_serialization(self, app):
        """Test basic outfit serialization."""
        with app.app_context():
            user = User(email='outfit_serial_test@example.com', password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            outfit = Outfit(
                user_id=user.id,
                worn_date=date(2025, 1, 15),
                image_path='/uploads/outfit.jpg'
            )
            db.session.add(outfit)
            db.session.commit()
            
            result = outfit_to_dict(outfit)
            
            assert result['id'] == str(outfit.id)
            assert result['date'] == '2025-01-15'
            assert result['imagePath'] == '/uploads/outfit.jpg'

    def test_outfit_with_items(self, app):
        """Test outfit serialization includes items."""
        with app.app_context():
            user = User(email='outfit_items_test@example.com', password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            item1 = Item(name='Shirt', user_id=user.id)
            item2 = Item(name='Jeans', user_id=user.id)
            db.session.add(item1)
            db.session.add(item2)
            db.session.commit()
            
            outfit = Outfit(user_id=user.id)
            db.session.add(outfit)
            db.session.commit()
            
            oi1 = OutfitItem(outfit_id=outfit.id, item_id=item1.id)
            oi2 = OutfitItem(outfit_id=outfit.id, item_id=item2.id)
            db.session.add(oi1)
            db.session.add(oi2)
            db.session.commit()
            
            result = outfit_to_dict(outfit)
            
            assert len(result['items']) == 2
            assert str(item1.id) in result['items']
            assert str(item2.id) in result['items']

    def test_outfit_no_items(self, app):
        """Test outfit with no items."""
        with app.app_context():
            user = User(email='outfit_noitems@example.com', password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            outfit = Outfit(user_id=user.id)
            db.session.add(outfit)
            db.session.commit()
            
            result = outfit_to_dict(outfit)
            
            assert result['items'] == []

    def test_outfit_no_image_path(self, app):
        """Test outfit without image path."""
        with app.app_context():
            user = User(email='outfit_noimage@example.com', password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            outfit = Outfit(user_id=user.id)  # No image_path
            db.session.add(outfit)
            db.session.commit()
            
            result = outfit_to_dict(outfit)
            
            assert result['imagePath'] is None
