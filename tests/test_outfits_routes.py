"""Unit tests for outfits routes."""
import pytest
import sys
import os
from datetime import date
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'wearwise_app'))

from wearwise_app.models import Item, Outfit, db


class TestGetOutfits:
    """Tests for GET /outfits route."""

    def test_get_outfits_unauthenticated(self, client):
        """Test get_outfits fails when not authenticated."""
        response = client.get('/outfits')
        assert response.status_code == 401

    def test_get_outfits_empty(self, client, authenticated_client):
        """Test get_outfits returns empty list for new user."""
        response = authenticated_client.get('/outfits')
        assert response.status_code == 200
        assert response.json == []

    def test_get_outfits_with_outfits(self, client, authenticated_client, app, user_data):
        """Test get_outfits returns user's outfits."""
        with app.app_context():
            from wearwise_app.models import User
            user = db.session.scalar(db.select(User).where(User.email == user_data['email']))
            
            outfit1 = Outfit(user_id=user.id, worn_date=date(2025, 1, 1))
            outfit2 = Outfit(user_id=user.id, worn_date=date(2025, 1, 2))
            db.session.add(outfit1)
            db.session.add(outfit2)
            db.session.commit()
        
        response = authenticated_client.get('/outfits')
        assert response.status_code == 200
        assert len(response.json) == 2

    def test_get_outfits_sorted_by_date(self, client, authenticated_client, app, user_data):
        """Test get_outfits sorts by worn_date descending."""
        with app.app_context():
            from wearwise_app.models import User
            user = db.session.scalar(db.select(User).where(User.email == user_data['email']))
            
            outfit1 = Outfit(user_id=user.id, worn_date=date(2025, 1, 1))
            outfit2 = Outfit(user_id=user.id, worn_date=date(2025, 1, 2))
            db.session.add(outfit1)
            db.session.add(outfit2)
            db.session.commit()
        
        response = authenticated_client.get('/outfits')
        assert response.status_code == 200
        # Should be sorted newest first
        assert response.json[0]['date'] > response.json[1]['date']


class TestCreateOutfit:
    """Tests for POST /outfits route."""

    def test_create_outfit_unauthenticated(self, client):
        """Test create_outfit fails when not authenticated."""
        response = client.post('/outfits', json={'date': '2025-01-01'})
        assert response.status_code == 401

    def test_create_outfit_success(self, client, authenticated_client, app, user_data):
        """Test successful outfit creation."""
        with app.app_context():
            from wearwise_app.models import User
            user = db.session.scalar(db.select(User).where(User.email == user_data['email']))
            item = Item(name='Shirt', user_id=user.id)
            db.session.add(item)
            db.session.commit()
            item_id = item.id
        
        response = authenticated_client.post('/outfits', json={
            'date': '2025-01-15',
            'item_ids': [item_id],
            'notes': 'Great outfit'
        })
        
        assert response.status_code == 201
        data = response.json
        assert data['date'] == '2025-01-15'

    def test_create_outfit_defaults_to_today(self, client, authenticated_client):
        """Test outfit defaults to today if no date provided."""
        response = authenticated_client.post('/outfits', json={})
        
        assert response.status_code == 201
        # Should have created with today's date
        assert 'date' in response.json

    def test_create_outfit_invalid_date(self, client, authenticated_client):
        """Test outfit creation with invalid date uses default."""
        response = authenticated_client.post('/outfits', json={
            'date': 'invalid-date'
        })
        
        # Should still succeed with default date
        assert response.status_code == 201

    def test_create_outfit_with_items(self, client, authenticated_client, app, user_data):
        """Test outfit creation includes items."""
        with app.app_context():
            from wearwise_app.models import User
            user = db.session.scalar(db.select(User).where(User.email == user_data['email']))
            item1 = Item(name='Shirt', user_id=user.id)
            item2 = Item(name='Jeans', user_id=user.id)
            db.session.add(item1)
            db.session.add(item2)
            db.session.commit()
            item1_id = item1.id
            item2_id = item2.id
        
        response = authenticated_client.post('/outfits', json={
            'item_ids': [item1_id, item2_id]
        })
        
        assert response.status_code == 201
        assert len(response.json['items']) == 2

    def test_create_outfit_with_nonexistent_item(self, client, authenticated_client, app, user_data):
        """Test outfit creation ignores non-existent items."""
        with app.app_context():
            from wearwise_app.models import User
            user = db.session.scalar(db.select(User).where(User.email == user_data['email']))
            item = Item(name='Shirt', user_id=user.id)
            db.session.add(item)
            db.session.commit()
            item_id = item.id
        
        response = authenticated_client.post('/outfits', json={
            'item_ids': [item_id, 99999]  # 99999 doesn't exist
        })
        
        assert response.status_code == 201
        # Only the valid item should be included
        assert len(response.json['items']) == 1

    def test_create_outfit_with_other_users_items(self, client, authenticated_client, app):
        """Test outfit creation ignores other user's items."""
        with app.app_context():
            from wearwise_app.models import User
            other_user = User(email='other@example.com', password_hash='hash')
            db.session.add(other_user)
            db.session.commit()
            
            item = Item(name='Shirt', user_id=other_user.id)
            db.session.add(item)
            db.session.commit()
            item_id = item.id
        
        response = authenticated_client.post('/outfits', json={
            'item_ids': [item_id]
        })
        
        assert response.status_code == 201
        # Other user's item should not be included
        assert len(response.json['items']) == 0
