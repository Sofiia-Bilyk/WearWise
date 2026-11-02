"""Replace only seeded demo illustrations with real clothing photos."""

import hashlib
import json
import sys
from io import BytesIO
from pathlib import Path

import requests
from PIL import JpegImagePlugin

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.seed_demo_data import EMAIL, MARKER, ITEMS, backup_database
from wearwise_app.app import create_app
from wearwise_app.models import Item, ItemTag, User, db
from wearwise_app.services.embedding_store import refresh_item_embedding


# Matches the original seed order. Names/colors reflect the selected photos.
# Each ID identifies its source page at pexels.com/photo/<ID>/.
PHOTOS = [
    ("White everyday tee", "White", 37704841),
    ("Navy shirt", "Navy", 22441317),
    ("Beige knit sweater", "Beige", 14377376),
    ("Orange everyday tee", "Orange", 36392069),
    ("Black everyday tee", "Black", 8532638),
    ("White button-up shirt", "White", 28576622),
    ("Blue denim jeans", "Blue", 1082529),
    ("Dark denim jeans", "Black", 65676),
    ("Beige pants", "Beige", 5418929),
    ("Dark green skirt", "Green", 18505097),
    ("White sneakers", "White", 1461048),
    ("Brown boots", "Brown", 11633583),
    ("Gray jacket", "Gray", 13094233),
    ("Beige coat", "Beige", 5424909),
    ("Black leather bag", "Black", 26736143),
    ("Patterned silk scarf", "Multicolor", 25524048),
]

MAX_BYTES = 10 * 1024 * 1024
# Older Pexels images can retain descriptive filenames from the source page.
PHOTO_FILENAMES = {65676: 'nanjing-studio-jeans-65676.jpeg'}


def download_photo(photo_id):
    """Download a bounded image from the selected photo provider."""
    filename = PHOTO_FILENAMES.get(photo_id, f'pexels-photo-{photo_id}.jpeg')
    url = f'https://images.pexels.com/photos/{photo_id}/{filename}?auto=compress&cs=tinysrgb&w=900'
    with requests.get(url, timeout=(10, 30), stream=True) as response:
        response.raise_for_status()
        if not response.headers.get("Content-Type", "").startswith("image/"):
            raise ValueError(f"Photo {photo_id} did not return an image.")
        chunks = []
        size = 0
        for chunk in response.iter_content(chunk_size=65536):
            size += len(chunk)
            if size > MAX_BYTES:
                raise ValueError(f"Photo {photo_id} exceeds the size limit.")
            chunks.append(chunk)
    raw = b"".join(chunks)
    # Reject broken files or unexpectedly large decoded images.
    # Use the JPEG decoder directly: the detector overrides Image.open and
    # may try installing optional plugins when it encounters a corrupt file.
    try:
        with JpegImagePlugin.JpegImageFile(BytesIO(raw)) as image:
            if image.width * image.height > 20_000_000:
                raise ValueError(f"Photo {photo_id} exceeds the pixel limit.")
            image.load()
    except (OSError, SyntaxError) as exc:
        raise ValueError(f"Photo {photo_id} is not a valid JPEG.") from exc
    return raw


def replace_photos(app):
    # Resolve the account explicitly rather than assuming database IDs.
    user_id = db.session.scalar(
        db.select(User.id).where(db.func.lower(User.email) == EMAIL.lower())
    )
    if user_id is None:
        raise RuntimeError("The target account was not found.")
    demo_items = db.session.scalars(
        db.select(Item)
        .join(ItemTag, ItemTag.item_id == Item.id)
        .where(Item.user_id == user_id, ItemTag.tag == MARKER)
    ).all()
    # Resolve by original or replacement name, never by assumed database IDs.
    plan = []
    for original, replacement in zip(ITEMS, PHOTOS):
        name, color, photo_id = replacement
        allowed_names = {f"[Demo] {original[0]}", f"[Demo] {name}"}
        matches = [item for item in demo_items if item.name in allowed_names]
        if len(matches) != 1:
            raise RuntimeError(f"Cannot uniquely identify demo item: {name}")
        plan.append((matches[0].id, name, color, photo_id))
    db.session.rollback()

    # Validate every download before updating any account records.
    downloads = {}
    for _, _, _, photo_id in plan:
        downloads[photo_id] = download_photo(photo_id)
        print(f"Validated photo {photo_id}.", flush=True)

    backup = backup_database()
    upload_folder = Path(app.config["UPLOAD_FOLDER"])
    upload_folder.mkdir(parents=True, exist_ok=True)
    sources = []
    try:
        for item_id, name, color, photo_id in plan:
            raw = downloads[photo_id]
            fingerprint = hashlib.sha256(raw).hexdigest()[:16]
            filename = f"demo-pexels-{photo_id}-{fingerprint}.jpg"
            path = upload_folder / filename
            if not path.exists():
                path.write_bytes(raw)
            elif path.read_bytes() != raw:
                raise RuntimeError("An existing photo has unexpected content.")
            item = db.session.get(Item, item_id)
            if item is None or item.user_id != user_id:
                raise RuntimeError("A demo item is no longer available.")
            item.name = f"[Demo] {name}"
            item.color = color
            item.image_path = f"/uploads/{filename}"
            # Generate real embeddings using the cached CLIP model.
            # Model failure records an unavailable status but keeps the photo.
            status = refresh_item_embedding(item)
            print(f"Prepared {name}: embedding {status}.", flush=True)
            sources.append({
                "item": name,
                "photo_id": photo_id,
                "source": f"https://www.pexels.com/photo/{photo_id}/",
                "license": "https://www.pexels.com/license/",
                "local_file": filename,
            })
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    credits = Path(__file__).resolve().parents[1] / "docs"
    credits.mkdir(exist_ok=True)
    (credits / "demo-photo-sources.json").write_text(json.dumps(sources, indent=2), encoding="utf-8")
    print("Replaced 16 demo illustrations with real clothing photos.")
    print("Item IDs, outfit history, costs, and demo tags were preserved.")
    print(f"Database backup: {backup}")


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        replace_photos(app)
