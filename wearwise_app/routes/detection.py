import base64
import logging

from flask import Blueprint, request, jsonify
import cv2
import numpy as np

from ..auth_guard import require_auth
from ..detector import detect_clothing

logger = logging.getLogger(__name__)

detection_bp = Blueprint("detection", __name__)


@detection_bp.route("/detect", methods=["POST"])
def detect():
    user, err = require_auth()
    if err:
        return err

    data = request.get_json()
    if not data or "image" not in data:
        return jsonify({"error": "No image provided"}), 400

    if len(data["image"]) > 13_000_000:
        return jsonify({"error": "Image too large (max 10 MB)"}), 413

    try:
        image_b64 = data["image"]
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        image_bytes = base64.b64decode(image_b64)
        nparr = np.frombuffer(image_bytes, np.uint8)
        image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image_bgr is None:
            return jsonify({"error": "Could not decode image"}), 400
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        detections = detect_clothing(image_rgb)
        return jsonify({"detections": detections})
    except Exception as e:
        logger.exception("Detection failed: %s", e)
        return jsonify({"error": "Detection failed"}), 500
