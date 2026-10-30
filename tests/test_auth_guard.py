"""Unit tests for authentication guard."""
import pytest
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'wearwise_app'))

from wearwise_app.models import User, db
from wearwise_app.auth_guard import require_auth


class TestRequireAuth:
    """Tests for require_auth function."""

    def test_require_auth_no_session(self, app):
        """Test require_auth fails when not authenticated."""
        with app.test_request_context():
            user, error = require_auth()
            assert user is None
            assert error is not None
            assert error[1] == 401

    def test_require_auth_invalid_session(self, app):
        """Test require_auth fails with invalid user_id in session."""
        with app.test_request_context():
            from flask import session
            session['user_id'] = 99999  # Non-existent user
            
            user, error = require_auth()
            assert user is None
            assert error is not None
            assert error[1] == 401

    def test_require_auth_valid_user(self, app, user_data):
        """Test require_auth succeeds with valid user."""
        with app.app_context():
            # Create user
            user_obj = User(email=user_data['email'], password_hash='hash')
            db.session.add(user_obj)
            db.session.commit()
            
            with app.test_request_context():
                from flask import session
                session['user_id'] = user_obj.id
                
                user, error = require_auth()
                assert user is not None
                assert error is None
                assert user.email == user_data['email']

    def test_require_auth_clears_invalid_session(self, app):
        """Test require_auth clears user_id from session if user not found."""
        with app.app_context():
            with app.test_request_context():
                from flask import session
                session['user_id'] = 99999
                
                user, error = require_auth()
                
                # Session should be cleared
                assert session.get('user_id') is None
