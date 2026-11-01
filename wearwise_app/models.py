"""SQLAlchemy ORM models for WearWise's wardrobe domain."""

from datetime import date, datetime

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()


class BaseModel(db.Model):
    """Abstract parent providing an integer primary key."""
    __abstract__ = True
    id = db.Column(db.Integer, primary_key=True)


class TimestampModel(BaseModel):
    """Adds an immutable ``created_at`` timestamp set at insert time."""
    __abstract__ = True
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class UserOwnedModel(TimestampModel):
    """Adds a required ``user_id`` foreign key for per-user resources."""
    __abstract__ = True

    @db.declared_attr
    def user_id(cls):
        return db.Column(
            db.Integer, db.ForeignKey('user.id'), nullable=False, index=True
        )


class User(TimestampModel):
    """Application user. Owns wardrobe items and outfit logs."""

    email = db.Column(db.String(120), unique=True, nullable=False)
    username = db.Column(db.String(80), nullable=True)  # optional display name
    password_hash = db.Column(db.String(255), nullable=False)

    outfits = db.relationship(
        'Outfit', backref='user', lazy=True, cascade="all, delete-orphan"
    )
    items = db.relationship(
        'Item', backref='user', lazy=True, cascade="all, delete-orphan"
    )

    def set_password(self, password: str) -> None:
        """Hash and store the user's password (PBKDF2-SHA256)."""
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')

    def check_password(self, password: str) -> bool:
        """Return True if ``password`` matches the stored hash."""
        return check_password_hash(self.password_hash, password)


class Item(UserOwnedModel):
    """A single garment in a user's wardrobe.

    ``ai_*`` columns hold the YOLO detector's best guess; the user-facing
    ``category``/``color``/``brand`` columns are what the user has confirmed.
    Soft-deleted items have a non-null ``archived_at``.
    """

    __table_args__ = (
        db.Index('ix_item_user_archived', 'user_id', 'archived_at'),
        db.Index('ix_item_user_postponed', 'user_id', 'postponed_until'),
        db.CheckConstraint('cost >= 0', name='check_item_cost_positive'),
    )

    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(50))
    color = db.Column(db.String(50))
    brand = db.Column(db.String(80))
    cost = db.Column(db.Float, nullable=True)
    image_path = db.Column(db.String(255), nullable=True)  # URL or uploaded path

    # AI-detected fields, populated by the YOLO pipeline.
    ai_category = db.Column(db.String(80))
    ai_color_primary = db.Column(db.String(50))
    ai_confidence = db.Column(db.Float)

    archived_at = db.Column(db.DateTime, nullable=True)  # soft-delete marker
    postponed_until = db.Column(db.Date, nullable=True)  # snooze "forgotten" reminders

    embedding = db.relationship(
        'ItemEmbedding', back_populates='item', uselist=False,
        cascade='all, delete-orphan',
    )

    tags = db.relationship(
        'ItemTag', backref='item', lazy=True, cascade="all, delete-orphan"
    )
    outfit_items = db.relationship(
        'OutfitItem', backref='item', lazy=True, cascade="all, delete-orphan"
    )


class ItemEmbedding(db.Model):
    """Server-generated vector for one item photo; never accepted from clients."""
    item_id = db.Column(db.Integer, db.ForeignKey('item.id'), primary_key=True)
    vector = db.Column(db.JSON, nullable=True)
    model_id = db.Column(db.String(120), nullable=True)
    model_revision = db.Column(db.String(80), nullable=True)
    pipeline_version = db.Column(db.String(50), nullable=True)
    image_sha256 = db.Column(db.String(64), nullable=True)
    source_image_path = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(24), nullable=False, default='pending')
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    item = db.relationship('Item', back_populates='embedding')


class ItemTag(UserOwnedModel):
    """User-defined free-form label attached to an :class:`Item`."""

    item_id = db.Column(
        db.Integer, db.ForeignKey('item.id'), nullable=False, index=True
    )
    tag = db.Column(db.String(80), nullable=False)


class Outfit(UserOwnedModel):
    """A logged outfit — a set of items the user wore on a given day."""

    __table_args__ = (
        db.Index('ix_outfit_user_worn_date', 'user_id', 'worn_date'),
    )

    worn_date = db.Column(db.Date, nullable=False, default=date.today)
    logged_at = db.Column(db.DateTime, default=datetime.utcnow)
    image_path = db.Column(db.String(255), nullable=True)
    ai_status = db.Column(db.String(20), default='pending')
    notes = db.Column(db.Text, nullable=True)

    outfit_items = db.relationship(
        'OutfitItem', backref='outfit', lazy=True, cascade="all, delete-orphan"
    )


class OutfitItem(BaseModel):
    """Junction row linking an :class:`Outfit` to one of its :class:`Item` s.

    Optional ``bbox_*`` columns store where the item appeared in the outfit
    photo (in image-relative coordinates) for items added by the AI detector.
    ``user_action`` records how the link was created — e.g. ``'ai_accepted'``
    or ``'user_added'`` — for analytics on detector accuracy.
    """

    __table_args__ = (
        db.UniqueConstraint('outfit_id', 'item_id', name='uq_outfit_item_pair'),
        db.Index('ix_outfit_item_outfit_item', 'outfit_id', 'item_id'),
        db.Index('ix_outfit_item_item_outfit', 'item_id', 'outfit_id'),
    )

    outfit_id = db.Column(
        db.Integer, db.ForeignKey('outfit.id'), nullable=False, index=True
    )
    item_id = db.Column(
        db.Integer, db.ForeignKey('item.id'), nullable=False, index=True
    )

    bbox_x = db.Column(db.Float)
    bbox_y = db.Column(db.Float)
    bbox_w = db.Column(db.Float)
    bbox_h = db.Column(db.Float)
    user_action = db.Column(db.String(20), default='ai_accepted')


class Reminder(BaseModel):
    """Scheduled nudge to wear an item that hasn't been used in 30+ days."""

    __table_args__ = (
        db.Index('ix_reminder_user_sent_remind_at', 'user_id', 'is_sent', 'remind_at'),
    )

    user_id = db.Column(
        db.Integer, db.ForeignKey('user.id'), nullable=False, index=True
    )
    item_id = db.Column(
        db.Integer, db.ForeignKey('item.id'), nullable=False, index=True
    )
    remind_at = db.Column(db.DateTime, nullable=False)
    snoozed_until = db.Column(db.DateTime, nullable=True)
    is_sent = db.Column(db.Boolean, default=False)
