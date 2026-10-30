from flask import Blueprint, current_app, send_from_directory

uploads_bp = Blueprint("uploads", __name__)


@uploads_bp.route("/uploads/<string:filename>")
def uploaded_file(filename):
    return send_from_directory(current_app.config["UPLOAD_FOLDER"], filename)
