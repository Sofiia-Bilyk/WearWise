"""Unit tests for database models."""
import pytest
import sys
import os
from datetime import datetime, date
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'wearwise_app'))

from wearwise_app.models import User, Item, ItemTag, Outfit, OutfitItem, Reminder, db


class TestUserModel:
    """Tests for User model."""

    def test_user_creation(self, app):
        """Test creating a user."""
        with app.app_context():
            user = User(email='test@example.com', username='testuser')
            user.set_password('password123')
            db.session.add(user)
            db.session.commit()
            
            fetched_user = db.session.scalar(db.select(User).where(User.email == 'test@example.com'))
            assert fetched_user is not None
            assert fetched_user.email == 'test@example.com'
            assert fetched_user.username == 'testuser'

    def test_user_password_hashing(self, app):
        """Test password is properly hashed."""
        with app.app_context():
            user = User(email='test@example.com')
            user.set_password('mypassword')
            
            # Password should be hashed, not stored as plain text
            assert user.password_hash != 'mypassword'
            assert len(user.password_hash) > 20

    def test_user_check_password(self, app):
        """Test password verification."""
        with app.app_context():
            user = User(email='test@example.com')
            user.set_password('correctpassword')
            
            assert user.check_password('correctpassword')
            assert not user.check_password('wrongpassword')

    def test_user_email_unique(self, app):
        """Test email uniqueness constraint."""
        with app.app_context():
            user1 = User(email='duplicate@example.com', password_hash='hash1')
            user2 = User(email='duplicate@example.com', password_hash='hash2')
            
            db.session.add(user1)
            db.session.commit()
            
            db.session.add(user2)
            with pytest.raises(Exception):  # SQLAlchemy IntegrityError
                db.session.commit()
            db.session.rollback()

    def test_user_timestamps(self, app):
        """Test user timestamps are set."""
        with app.app_context():
            user = User(email='test@example.com', password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            assert user.created_at is not None
            assert isinstance(user.created_at, datetime)


class TestItemModel:
    """Tests for Item model."""

    def test_item_creation(self, app, user_data):
        """Test creating an item."""
        with app.app_context():
            user = User(email=user_data['email'], password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            item = Item(
                name='Blue Jeans',
                category='Pants',
                color='Blue',
                user_id=user.id
            )
            db.session.add(item)
            db.session.commit()
            
            fetched_item = db.session.get(Item, item.id)
            assert fetched_item.name == 'Blue Jeans'
            assert fetched_item.user_id == user.id

    def test_item_cost_constraint(self, app, user_data):
        """Test cost must be non-negative."""
        with app.app_context():
            user = User(email=user_data['email'], password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            # Negative cost should fail
            item = Item(name='Shirt', cost=-10.00, user_id=user.id)
            db.session.add(item)
            
            with pytest.raises(Exception):  # SQLAlchemy CheckConstraint violation
                db.session.commit()
            db.session.rollback()

    def test_item_soft_delete(self, app, user_data):
        """Test item archival (soft delete)."""
        with app.app_context():
            user = User(email=user_data['email'], password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            item = Item(name='Old Shirt', user_id=user.id)
            db.session.add(item)
            db.session.commit()
            
            # Archive the item
            item.archived_at = datetime.utcnow()
            db.session.commit()
            
            fetched_item = db.session.get(Item, item.id)
            assert fetched_item.archived_at is not None

    def test_item_postpone(self, app, user_data):
        """Test item postponement."""
        with app.app_context():
            user = User(email=user_data['email'], password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            item = Item(name='Shirt', user_id=user.id)
            db.session.add(item)
            db.session.commit()
            
            future_date = date(2025, 12, 31)
            item.postponed_until = future_date
            db.session.commit()
            
            fetched_item = db.session.get(Item, item.id)
            assert fetched_item.postponed_until == future_date


class TestItemTagModel:
    """Tests for ItemTag model."""

    def test_tag_creation(self, app, user_data):
        """Test creating an item tag."""
        with app.app_context():
            user = User(email=user_data['email'], password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            item = Item(name='Shirt', user_id=user.id)
            db.session.add(item)
            db.session.commit()
            
            tag = ItemTag(item_id=item.id, user_id=user.id, tag='casual')
            db.session.add(tag)
            db.session.commit()
            
            fetched_tag = db.session.get(ItemTag, tag.id)
            assert fetched_tag.tag == 'casual'
            assert fetched_tag.user_id == user.id

    def test_tag_cascade_delete(self, app, user_data):
        """Test tags are deleted when item is deleted."""
        with app.app_context():
            user = User(email=user_data['email'], password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            item = Item(name='Shirt', user_id=user.id)
            db.session.add(item)
            db.session.commit()
            
            tag = ItemTag(item_id=item.id, user_id=user.id, tag='casual')
            db.session.add(tag)
            db.session.commit()
            
            tag_id = tag.id
            
            # Delete item
            db.session.delete(item)
            db.session.commit()
            
            # Tag should also be deleted
            fetched_tag = db.session.get(ItemTag, tag_id)
            assert fetched_tag is None


class TestOutfitModel:
    """Tests for Outfit model."""

    def test_outfit_creation(self, app, user_data):
        """Test creating an outfit."""
        with app.app_context():
            user = User(email=user_data['email'], password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            outfit = Outfit(user_id=user.id, worn_date=date.today())
            db.session.add(outfit)
            db.session.commit()
            
            fetched_outfit = db.session.get(Outfit, outfit.id)
            assert fetched_outfit.user_id == user.id
            assert fetched_outfit.ai_status == 'pending'

    def test_outfit_default_status(self, app, user_data):
        """Test outfit has default ai_status."""
        with app.app_context():
            user = User(email=user_data['email'], password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            outfit = Outfit(user_id=user.id)
            db.session.add(outfit)
            db.session.commit()
            
            assert outfit.ai_status == 'pending'


class TestOutfitItemModel:
    """Tests for OutfitItem (many-to-many) model."""

    def test_outfit_item_creation(self, app, user_data):
        """Test creating outfit-item association."""
        with app.app_context():
            user = User(email=user_data['email'], password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            item = Item(name='Shirt', user_id=user.id)
            outfit = Outfit(user_id=user.id)
            db.session.add(item)
            db.session.add(outfit)
            db.session.commit()
            
            outfit_item = OutfitItem(
                outfit_id=outfit.id,
                item_id=item.id,
                bbox_x=0.1,
                bbox_y=0.2,
                bbox_w=0.3,
                bbox_h=0.4
            )
            db.session.add(outfit_item)
            db.session.commit()
            
            fetched = db.session.get(OutfitItem, outfit_item.id)
            assert fetched.bbox_x == 0.1

    def test_outfit_item_unique_constraint(self, app, user_data):
        """Test outfit cannot have same item twice."""
        with app.app_context():
            user = User(email=user_data['email'], password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            item = Item(name='Shirt', user_id=user.id)
            outfit = Outfit(user_id=user.id)
            db.session.add(item)
            db.session.add(outfit)
            db.session.commit()
            
            outfit_item1 = OutfitItem(outfit_id=outfit.id, item_id=item.id)
            outfit_item2 = OutfitItem(outfit_id=outfit.id, item_id=item.id)
            
            db.session.add(outfit_item1)
            db.session.commit()
            
            db.session.add(outfit_item2)
            with pytest.raises(Exception):  # SQLAlchemy UniqueConstraint violation
                db.session.commit()
            db.session.rollback()


class TestReminderModel:
    """Tests for Reminder model."""

    def test_reminder_creation(self, app, user_data):
        """Test creating a reminder."""
        with app.app_context():
            user = User(email=user_data['email'], password_hash='hash')
            db.session.add(user)
            db.session.commit()
            
            item = Item(name='Shirt', user_id=user.id)
            db.session.add(item)
            db.session.commit()
            
            reminder = Reminder(
                user_id=user.id,
                item_id=item.id,
                remind_at=datetime.utcnow()
            )
            db.session.add(reminder)
            db.session.commit()
            
            fetched = db.session.get(Reminder, reminder.id)
            assert fetched.is_sent is False
