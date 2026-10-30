import os
import cv2
import numpy as np
from ultralytics import YOLO
from sklearn.cluster import KMeans
import base64
import uuid
from datetime import date
import logging

logger = logging.getLogger(__name__)

# Lazy-loaded model singleton
_model = None
_using_fashion_model = False

# COCO classes that are clothing/accessory-related
# When using the COCO fallback, "person" is handled specially (crop as outfit)
_COCO_ACCESSORIES = {"backpack", "umbrella", "handbag", "tie", "suitcase"}

# For fashion-specific models: map class name keywords to categories
_TOPS       = ["top", "shirt", "blouse", "sweater", "hoodie", "vest", "sling", "dress", "t-shirt", "tee"]
_BOTTOMS    = ["shorts", "trouser", "pants", "skirt", "jeans"]
_OUTERWEAR  = ["outwear", "jacket", "coat", "blazer"]
_SHOES      = ["shoe", "boot", "sneaker", "sandal", "heel"]
_ACCESSORIES= ["backpack", "handbag", "tie", "bag", "hat", "scarf", "umbrella", "suitcase"]

COLOR_MAP = {
    "Red":    (255, 0, 0),
    "Green":  (0, 128, 0),
    "Blue":   (0, 0, 255),
    "Black":  (0, 0, 0),
    "White":  (255, 255, 255),
    "Yellow": (255, 255, 0),
    "Purple": (128, 0, 128),
    "Orange": (255, 165, 0),
    "Gray":   (128, 128, 128),
    "Brown":  (139, 69, 19),
    "Pink":   (255, 182, 193),
    "Beige":  (245, 245, 220),
    "Navy":   (0, 0, 128),
}

# How to split a person crop into top/bottom halves for COCO fallback
_TOP_RATIO    = 0.55   # top 55% of the person bbox → "Top"
_BOTTOM_RATIO = 0.45   # bottom 45% → "Bottom"


def _get_category(class_name: str) -> str:
    name = class_name.lower()
    for kw in _TOPS:
        if kw in name:
            return "Top"
    for kw in _BOTTOMS:
        if kw in name:
            return "Bottom"
    for kw in _OUTERWEAR:
        if kw in name:
            return "Outerwear"
    for kw in _SHOES:
        if kw in name:
            return "Shoes"
    for kw in _ACCESSORIES:
        if kw in name:
            return "Accessory"
    return "Top"


def load_model() -> YOLO:
    """Load and cache the detection model."""
    global _model, _using_fashion_model
    if _model is None:
        # Configuration for the ML model backing service
        repo_id = os.environ.get('ML_MODEL_REPO', "Bingsu/adetailer")
        filename = os.environ.get('ML_MODEL_FILENAME', "deepfashion2_yolov8s-seg.pt")
        fallback_model = os.environ.get('ML_MODEL_FALLBACK', "yolov8n.pt")

        try:
            # Try to load a fashion-specific model via HuggingFace hub
            from huggingface_hub import hf_hub_download
            logger.info("Attempting to download model from %s/%s...", repo_id, filename)
            path = hf_hub_download(
                repo_id=repo_id,
                filename=filename,
            )
            _model = YOLO(path)
            _using_fashion_model = True
            logger.info("Successfully attached model resource: %s", repo_id)
        except Exception as e:
            logger.warning("Fashion model resource unavailable (%s), attaching local fallback: %s", e, fallback_model)
            _model = YOLO(fallback_model)
            _using_fashion_model = False
    return _model


def get_dominant_color(image_crop: np.ndarray) -> str:
    """Return the name of the dominant color in an RGB image crop using K-Means."""
    if image_crop is None or image_crop.size == 0:
        return "Unknown"

    pixels = image_crop.reshape(-1, 3).astype(float)
    if len(pixels) < 3:
        return "Unknown"

    k = min(3, len(pixels))
    kmeans = KMeans(n_clusters=k, n_init=5, random_state=42)
    kmeans.fit(pixels)

    counts = np.bincount(kmeans.labels_)
    dominant = kmeans.cluster_centers_[np.argmax(counts)]

    min_dist = float("inf")
    color_name = "Unknown"
    for name, rgb in COLOR_MAP.items():
        dist = sum((a - b) ** 2 for a, b in zip(dominant, rgb))
        if dist < min_dist:
            min_dist = dist
            color_name = name

    return color_name


def _encode_crop(crop_rgb: np.ndarray) -> str:
    """Encode an RGB crop as a base64 JPEG data-URL."""
    if crop_rgb is None or crop_rgb.size == 0:
        return ""
    crop_bgr = cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2BGR)
    _, buf = cv2.imencode(".jpg", crop_bgr, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")


def _make_item(name: str, category: str, color: str, confidence: float,
               bbox: list, crop: np.ndarray, today: str) -> dict:
    return {
        "id":         f"det-{uuid.uuid4().hex[:8]}",
        "name":       name,
        "category":   category,
        "color":      color,
        "confidence": round(confidence, 3),
        "bbox":       bbox,
        "image":      _encode_crop(crop),
        "wearCount":  0,
        "lastWorn":   today,
        "addedDate":  today,
    }


def _coco_detections(image_rgb: np.ndarray, results, today: str) -> list:
    """
    Smart COCO fallback: split person bbox into top/bottom halves and also
    capture accessories (backpack, handbag, tie, etc.).
    """
    model = _model
    detections = []
    h, w = image_rgb.shape[:2]

    for result in results:
        for box in result.boxes:
            class_name = model.names[int(box.cls[0])]
            confidence = float(box.conf[0])
            x1, y1, x2, y2 = [max(0, int(v)) for v in box.xyxy[0]]
            x2 = min(w, x2)
            y2 = min(h, y2)

            if class_name == "person":
                box_h = y2 - y1
                # Top half (shirt/jacket region)
                top_y2 = y1 + int(box_h * _TOP_RATIO)
                top_crop = image_rgb[y1:top_y2, x1:x2]
                top_color = get_dominant_color(top_crop)
                detections.append(_make_item(
                    f"{top_color} Top", "Top", top_color, confidence,
                    [x1, y1, x2, top_y2], top_crop, today,
                ))

                # Bottom half (pants/skirt region)
                bot_y1 = y1 + int(box_h * _TOP_RATIO)
                bot_crop = image_rgb[bot_y1:y2, x1:x2]
                bot_color = get_dominant_color(bot_crop)
                detections.append(_make_item(
                    f"{bot_color} Bottom", "Bottom", bot_color, confidence,
                    [x1, bot_y1, x2, y2], bot_crop, today,
                ))

            elif class_name in _COCO_ACCESSORIES:
                crop = image_rgb[y1:y2, x1:x2]
                color = get_dominant_color(crop)
                label = class_name.replace("handbag", "Bag").title()
                detections.append(_make_item(
                    f"{color} {label}", "Accessory", color, confidence,
                    [x1, y1, x2, y2], crop, today,
                ))

    return detections


def detect_clothing(image_rgb: np.ndarray, conf_threshold: float = 0.25) -> list:
    """
    Detect clothing items in an RGB image.

    Returns a list of dicts matching the frontend ClothingItem interface:
        id, name, category, color, confidence, bbox, image (base64 JPEG crop)

    Uses a fashion-specific YOLO model when available; falls back to COCO
    yolov8n with person-splitting for top/bottom regions + accessory detection.
    """
    model = load_model()
    results = model(image_rgb, conf=conf_threshold, verbose=False)
    today = date.today().isoformat()

    if not _using_fashion_model:
        return _coco_detections(image_rgb, results, today)

    # Fashion model path — direct class→category mapping
    detections = []
    for result in results:
        for box in result.boxes:
            confidence = float(box.conf[0])
            if confidence < conf_threshold:
                continue

            class_id = int(box.cls[0])
            class_name = model.names[class_id]
            category = _get_category(class_name)

            x1, y1, x2, y2 = map(int, box.xyxy[0])
            x1 = max(0, x1);  y1 = max(0, y1)
            x2 = min(image_rgb.shape[1], x2);  y2 = min(image_rgb.shape[0], y2)

            crop = image_rgb[y1:y2, x1:x2]
            color = get_dominant_color(crop)

            detections.append(_make_item(
                f"{color} {class_name.title()}", category, color, confidence,
                [x1, y1, x2, y2], crop, today,
            ))

    return detections
