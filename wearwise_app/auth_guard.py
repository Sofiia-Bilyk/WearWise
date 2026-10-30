from flask import jsonify, session
from .models import db, User


def require_auth():
    """Return (user, None) or (None, error_response)."""
    user_id = session.get("user_id")
    if not user_id:
        return None, (jsonify({"error": "Not authenticated"}), 401)
    user = db.session.get(User, user_id)
    if not user:
        session.pop("user_id", None)
        return None, (jsonify({"error": "Not authenticated"}), 401)
    return user, None
