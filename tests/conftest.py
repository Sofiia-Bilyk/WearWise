"""Pytest configuration and shared fixtures."""
import os
import sys
import tempfile
from pathlib import Path

import pytest

# Add project root to path rather than wearwise_app directly
project_root = os.path.join(os.path.dirname(__file__), '..')
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Import create_app and db using the fully qualified package name
from wearwise_app.app import db, create_app


@pytest.fixture
def app():
    """Create application for testing."""
    # Spin up a fresh app instance specifically for testing
    # Passing a test_config dictionary is standard practice
    app = create_app({
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'TESTING': True,
        'WTF_CSRF_ENABLED': False,
        'SECRET_KEY': 'test-secret'
    })

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    """Test client for making requests."""
    return app.test_client()


@pytest.fixture
def runner(app):
    """CLI runner for testing CLI commands."""
    return app.test_cli_runner()


@pytest.fixture
def db_session(app):
    """Database session for tests."""
    with app.app_context():
        yield db.session


@pytest.fixture
def user_data():
    """Sample user data for testing."""
    return {
        'email': 'test@example.com',
        'password': 'testpassword123',
        'username': 'testuser'
    }


@pytest.fixture
def registered_user(client, user_data):
    """Create and register a test user."""
    response = client.post('/auth/register', json=user_data)
    assert response.status_code == 201
    return response.json['user']


@pytest.fixture
def authenticated_client(client, user_data, registered_user):
    """Create a client with authenticated user session."""
    # Login the user
    response = client.post('/auth/login', json={
        'email': user_data['email'],
        'password': user_data['password']
    })
    assert response.status_code == 200
    return client
