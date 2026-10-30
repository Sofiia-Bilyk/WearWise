"""Unit tests for authentication routes."""
import pytest
import json
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'wearwise_app'))

from wearwise_app.models import User, db


class TestAuthRegister:
    """Tests for /auth/register route."""

    def test_register_success(self, client):
        """Test successful user registration."""
        response = client.post('/auth/register', json={
            'email': 'newuser@example.com',
            'password': 'password123',
            'username': 'newuser'
        })
        
        assert response.status_code == 201
        data = response.json
        assert 'user' in data
        assert data['user']['email'] == 'newuser@example.com'
        assert data['user']['username'] == 'newuser'

    def test_register_missing_email(self, client):
        """Test registration fails without email."""
        response = client.post('/auth/register', json={
            'password': 'password123'
        })
        
        assert response.status_code == 400
        assert 'error' in response.json

    def test_register_missing_password(self, client):
        """Test registration fails without password."""
        response = client.post('/auth/register', json={
            'email': 'test@example.com'
        })
        
        assert response.status_code == 400
        assert 'error' in response.json

    def test_register_duplicate_email(self, client, user_data, registered_user):
        """Test registration fails with duplicate email."""
        response = client.post('/auth/register', json={
            'email': user_data['email'],
            'password': 'differentpassword'
        })
        
        assert response.status_code == 409
        assert 'error' in response.json
        assert 'exists' in response.json['error'].lower()

    def test_register_invalid_json(self, client):
        """Test registration fails with invalid JSON."""
        response = client.post(
            '/auth/register',
            data='invalid json',
            content_type='application/json'
        )
        
        assert response.status_code == 400

    def test_register_session_created(self, client):
        """Test session is created after registration."""
        response = client.post('/auth/register', json={
            'email': 'test@example.com',
            'password': 'password123'
        })
        
        assert response.status_code == 201
        # Check user is authenticated by verifying session
        me_response = client.get('/auth/me')
        assert me_response.status_code == 200

    def test_register_username_defaults_to_email(self, client):
        """Test username defaults to email if not provided."""
        response = client.post('/auth/register', json={
            'email': 'test@example.com',
            'password': 'password123'
        })
        
        assert response.status_code == 201
        assert response.json['user']['username'] == 'test@example.com'


class TestAuthLogin:
    """Tests for /auth/login route."""

    def test_login_success(self, client, user_data, registered_user):
        """Test successful login."""
        response = client.post('/auth/login', json={
            'email': user_data['email'],
            'password': user_data['password']
        })
        
        assert response.status_code == 200
        data = response.json
        assert 'user' in data
        assert data['user']['email'] == user_data['email']

    def test_login_wrong_password(self, client, user_data, registered_user):
        """Test login fails with wrong password."""
        response = client.post('/auth/login', json={
            'email': user_data['email'],
            'password': 'wrongpassword'
        })
        
        assert response.status_code == 401
        assert 'error' in response.json

    def test_login_nonexistent_user(self, client):
        """Test login fails with non-existent email."""
        response = client.post('/auth/login', json={
            'email': 'nonexistent@example.com',
            'password': 'password'
        })
        
        assert response.status_code == 401
        assert 'error' in response.json

    def test_login_missing_fields(self, client):
        """Test login fails with missing fields."""
        response = client.post('/auth/login', json={
            'email': 'test@example.com'
        })
        
        assert response.status_code == 401

    def test_login_invalid_json(self, client):
        """Test login fails with invalid JSON."""
        response = client.post(
            '/auth/login',
            data='invalid json',
            content_type='application/json'
        )
        
        assert response.status_code == 400

    def test_login_session_created(self, client, user_data, registered_user):
        """Test session is created after login."""
        response = client.post('/auth/login', json={
            'email': user_data['email'],
            'password': user_data['password']
        })
        
        assert response.status_code == 200
        # Verify session by calling /auth/me
        me_response = client.get('/auth/me')
        assert me_response.status_code == 200


class TestAuthLogout:
    """Tests for /auth/logout route."""

    def test_logout_success(self, client, authenticated_client):
        """Test successful logout."""
        response = authenticated_client.post('/auth/logout')
        
        assert response.status_code == 200
        assert response.json['message'] == 'Logged out'

    def test_logout_clears_session(self, client, user_data, registered_user):
        """Test logout clears session."""
        # First verify authenticated
        response = client.get('/auth/me')
        assert response.status_code == 200
        
        # Logout
        response = client.post('/auth/logout')
        assert response.status_code == 200
        
        # Verify not authenticated anymore
        response = client.get('/auth/me')
        assert response.status_code == 401

    def test_logout_when_not_authenticated(self, client):
        """Test logout when not authenticated."""
        response = client.post('/auth/logout')
        
        # Should still return 200 (safe operation)
        assert response.status_code == 200


class TestAuthMe:
    """Tests for /auth/me route."""

    def test_me_authenticated(self, client, user_data, registered_user):
        """Test /auth/me returns current user when authenticated."""
        response = client.get('/auth/me')
        
        assert response.status_code == 200
        data = response.json
        assert 'user' in data
        assert data['user']['email'] == user_data['email']

    def test_me_not_authenticated(self, client):
        """Test /auth/me fails when not authenticated."""
        response = client.get('/auth/me')
        
        assert response.status_code == 401
        assert 'error' in response.json

    def test_me_returns_all_fields(self, client, user_data, registered_user):
        """Test /auth/me returns all required user fields."""
        response = client.get('/auth/me')
        
        assert response.status_code == 200
        user = response.json['user']
        assert 'id' in user
        assert 'email' in user
        assert 'username' in user
        assert user['email'] == user_data['email']
