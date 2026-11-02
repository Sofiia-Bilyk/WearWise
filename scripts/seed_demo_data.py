"""Add clearly labeled demo data to one local WearWise account."""

import sqlite3
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from wearwise_app.app import create_app
from wearwise_app.models import Item, ItemTag, Outfit, OutfitItem, User, db


ROOT = Path(__file__).resolve().parents[1]
EMAIL = "soffia.bilyk@gmail.com"
MARKER = "wearwise-demo-october-2026-v1"

# Name, category, color, cost, thumbnail color.
ITEMS = [
    ("White everyday tee", "Top", "White", 18, "#e7e5e4"),
    ("Navy striped shirt", "Top", "Navy", 45, "#334155"),
    ("Sage knit sweater", "Top", "Green", 65, "#8b9d83"),
    ("Terracotta blouse", "Top", "Orange", 42, "#c97759"),
    ("Black long-sleeve top", "Top", "Black", 28, "#292524"),
    ("Lavender summer top", "Top", "Purple", 32, "#b5a0c9"),
    ("Blue straight jeans", "Bottom", "Blue", 70, "#6485a3"),
    ("Black tailored trousers", "Bottom", "Black", 80, "#3f3f46"),
    ("Beige wide-leg pants", "Bottom", "Beige", 55, "#c8b99d"),
    ("Olive midi skirt", "Bottom", "Green", 48, "#82876a"),
    ("White sneakers", "Shoes", "White", 95, "#d6d3d1"),
    ("Brown ankle boots", "Shoes", "Brown", 120, "#84624c"),
    ("Blue raincoat", "Outerwear", "Blue", 110, "#829cad"),
    ("Camel wool coat", "Outerwear", "Brown", 180, "#b29373"),
    ("Black crossbody bag", "Accessory", "Black", 60, "#44403c"),
    ("Beige scarf", "Accessory", "Beige", 25, "#d2c3a7"),
]

# Simple garment illustrations keep the test data local and self-contained.
SHAPES = {
    "Top": "M55 45L80 30Q100 50 120 30L145 45L175 90L145 110L130 90V205H70V90L55 110L25 90Z",
    "Bottom": "M60 35H140L150 210H110L100 100L90 210H50Z",
    "Shoes": "M45 95H100L120 145L165 160V190H35V150Z",
    "Outerwear": "M70 30L100 50L130 30L170 90L145 115L135 95V215H65V95L55 115L30 90Z",
    "Accessory": "M50 85H150L165 200H35ZM75 85V60Q100 30 125 60V85",
}


def create_thumbnail(index, category, color):
    """Create a reusable illustration; never overwrite an unrelated file."""
    folder = ROOT / "public" / "demo"
    folder.mkdir(parents=True, exist_ok=True)
    filename = f"{MARKER}-{index:02d}.svg"
    path = folder / filename
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        'width="200" height="240" viewBox="0 0 200 240">'
        '<rect width="200" height="240" rx="16" fill="#f5f5f4"/>'
        f'<path d="{SHAPES[category]}" fill="{color}" '
        'stroke="#78716c" stroke-width="2"/>'
        "</svg>"
    )
    if path.exists() and path.read_text(encoding="utf-8") != svg:
        raise RuntimeError(f"Thumbnail already exists with different content: {path}")
    if not path.exists():
        path.write_text(svg, encoding="utf-8")
    return f"/demo/{filename}"


def backup_database():
    """Back up the actual local database before inserting records."""
    expected = ROOT / "wearwise_app" / "instance" / "database.db"
    if db.engine.url.get_backend_name() != "sqlite":
        raise RuntimeError("This script is restricted to the local SQLite database.")
    actual = Path(db.engine.url.database).resolve()
    if actual != expected.resolve():
        raise RuntimeError("Unexpected database location; no data was added.")
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup = actual.with_name(f"database.before-demo-{timestamp}.db")
    source = sqlite3.connect(actual)
    destination = sqlite3.connect(backup)
    try:
        source.backup(destination)
    finally:
        destination.close()
        source.close()
    return backup


def seed():
    user = db.session.scalar(
        db.select(User).where(db.func.lower(User.email) == EMAIL.lower())
    )
    if user is None:
        raise RuntimeError("The target account does not exist.")
    # Prevent duplicate datasets, even if demo items have been renamed.
    existing_tag = db.session.scalar(
        db.select(ItemTag.id).where(ItemTag.user_id == user.id, ItemTag.tag == MARKER)
    )
    existing_log = db.session.scalar(
        db.select(Outfit.id).where(Outfit.user_id == user.id, Outfit.notes == MARKER)
    )
    if existing_tag is not None or existing_log is not None:
        print("This demo dataset already exists. Nothing was added.")
        return
    # End the read transaction before creating a consistent backup.
    user_id = user.id
    db.session.rollback()
    backup = backup_database()
    try:
        wardrobe = []
        for index, (name, category, color, cost, hex_color) in enumerate(ITEMS):
            item = Item(
                user_id=user_id, name=f"[Demo] {name}", category=category,
                color=color, brand="Demo Collection", cost=cost,
                image_path=create_thumbnail(index, category, hex_color),
                created_at=datetime(2026, 8, 20, 12),
            )
            db.session.add(item)
            db.session.flush()
            db.session.add(ItemTag(user_id=user_id, item_id=item.id, tag=MARKER))
            wardrobe.append(item)
        # Demonstrate postponing a seasonal item's reminder.
        wardrobe[15].postponed_until = date(2026, 12, 1)
        # These seven gaps leave 24 days with outfit logs.
        excluded_days = {4, 8, 12, 16, 20, 24, 28}
        top_rotation = [0, 0, 1, 0, 2, 3, 0, 4]
        for index, day in enumerate(day for day in range(1, 32) if day not in excluded_days):
            worn_date = date(2026, 10, day)
            logged_at = datetime(2026, 10, day, 9)
            outfit = Outfit(
                user_id=user_id, worn_date=worn_date, logged_at=logged_at,
                created_at=logged_at, notes=MARKER, ai_status="manual",
            )
            db.session.add(outfit)
            db.session.flush()
            selected = [top_rotation[index % len(top_rotation)], 6 + index % 4, 10 if index % 3 else 11]
            if day >= 15:
                selected.append(13)
            if index % 2 == 0:
                selected.append(14)
            for item_index in selected:
                db.session.add(OutfitItem(outfit_id=outfit.id, item_id=wardrobe[item_index].id, user_action="user_added"))
        # Save the entire dataset together.
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    print("Added 16 demo wardrobe items and 24 October outfit logs.")
    print(f"Database backup: {backup}")


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        seed()
