"""Authentication endpoints: register, login, logout, current user."""

import logging

from flask import Blueprint, request, jsonify, session

from ..auth_guard import require_auth
from ..models import db, User

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)


def _user_payload(user: User) -> dict:
    """Standard public shape for a User in API responses."""
    return {"id": user.id, "email": user.email, "username": user.username}


@auth_bp.route("/auth/register", methods=["POST"])
def register():
    """Create a new account and start a session for it."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    email = data.get("email")
    password = data.get("password")
    # Display name falls back to 'name' (legacy field) and finally to email.
    username = data.get("username") or data.get("name") or email

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    try:
        if db.session.scalar(db.select(User).where(User.email == email)):
            return jsonify({"error": "An account with this email already exists"}), 409

        user = User(email=email, username=username)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        logger.error("Failed to register user %s: %s", email, exc)
        return jsonify({"error": "Could not create account, please try again"}), 500

    session["user_id"] = user.id
    return jsonify({"message": "User registered", "user": _user_payload(user)}), 201


@auth_bp.route("/auth/login", methods=["POST"])
def login():
    """Verify credentials and start a session."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    email = data.get("email")
    password = data.get("password")

    user = db.session.scalar(db.select(User).where(User.email == email))
    if not user or not user.check_password(password):
        # Same response for unknown email and wrong password — avoids leaking
        # which accounts exist.
        return jsonify({"error": "Invalid email or password"}), 401

    session["user_id"] = user.id
    return jsonify({"message": "Logged in", "user": _user_payload(user)})


@auth_bp.route("/auth/logout", methods=["POST"])
def logout():
    """Clear the session cookie."""
    session.pop("user_id", None)
    return jsonify({"message": "Logged out"})


@auth_bp.route("/auth/me", methods=["GET"])
def me():
    """Return the currently authenticated user, or 401 if not signed in."""
    user, err = require_auth()
    if err:
        return err
    return jsonify({"user": _user_payload(user)})
