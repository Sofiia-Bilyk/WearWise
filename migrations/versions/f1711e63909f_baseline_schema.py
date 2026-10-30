"""baseline schema
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f1711e63909f'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # User table
    op.create_table(
        'user',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=120), nullable=False),
        sa.Column('username', sa.String(length=80), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email')
    )

    # Item table
    op.create_table(
        'item',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=True),
        sa.Column('color', sa.String(length=50), nullable=True),
        sa.Column('brand', sa.String(length=80), nullable=True),
        sa.Column('cost', sa.Float(), nullable=True),
        sa.Column('image_path', sa.String(length=255), nullable=True),
        sa.Column('ai_category', sa.String(length=80), nullable=True),
        sa.Column('ai_color_primary', sa.String(length=50), nullable=True),
        sa.Column('ai_confidence', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('archived_at', sa.DateTime(), nullable=True),
        sa.Column('postponed_until', sa.Date(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('item', schema=None) as batch_op:
        batch_op.create_index('ix_item_user_archived', ['user_id', 'archived_at'], unique=False)
        batch_op.create_index('ix_item_user_postponed', ['user_id', 'postponed_until'], unique=False)
        batch_op.create_index('ix_item_user_id', ['user_id'], unique=False)

    # ItemTag table
    op.create_table(
        'item_tag',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('tag', sa.String(length=80), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['item_id'], ['item.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('item_tag', schema=None) as batch_op:
        batch_op.create_index('ix_item_tag_item_id', ['item_id'], unique=False)
        batch_op.create_index('ix_item_tag_user_id', ['user_id'], unique=False)

    # Outfit table
    op.create_table(
        'outfit',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worn_date', sa.Date(), nullable=False),
        sa.Column('logged_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('image_path', sa.String(length=255), nullable=True),
        sa.Column('ai_status', sa.String(length=20), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('outfit', schema=None) as batch_op:
        batch_op.create_index('ix_outfit_user_worn_date', ['user_id', 'worn_date'], unique=False)
        batch_op.create_index('ix_outfit_user_id', ['user_id'], unique=False)

    # OutfitItem table
    op.create_table(
        'outfit_item',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('outfit_id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('bbox_x', sa.Float(), nullable=True),
        sa.Column('bbox_y', sa.Float(), nullable=True),
        sa.Column('bbox_w', sa.Float(), nullable=True),
        sa.Column('bbox_h', sa.Float(), nullable=True),
        sa.Column('user_action', sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(['item_id'], ['item.id'], ),
        sa.ForeignKeyConstraint(['outfit_id'], ['outfit.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('outfit_id', 'item_id', name='uq_outfit_item_pair')
    )
    with op.batch_alter_table('outfit_item', schema=None) as batch_op:
        batch_op.create_index('ix_outfit_item_item_id', ['item_id'], unique=False)
        batch_op.create_index('ix_outfit_item_item_outfit', ['item_id', 'outfit_id'], unique=False)
        batch_op.create_index('ix_outfit_item_outfit_id', ['outfit_id'], unique=False)
        batch_op.create_index('ix_outfit_item_outfit_item', ['outfit_id', 'item_id'], unique=False)

    # Reminder table
    op.create_table(
        'reminder',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('remind_at', sa.DateTime(), nullable=False),
        sa.Column('snoozed_until', sa.DateTime(), nullable=True),
        sa.Column('is_sent', sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(['item_id'], ['item.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('reminder', schema=None) as batch_op:
        batch_op.create_index('ix_reminder_item_id', ['item_id'], unique=False)
        batch_op.create_index('ix_reminder_user_id', ['user_id'], unique=False)
        batch_op.create_index('ix_reminder_user_sent_remind_at', ['user_id', 'is_sent', 'remind_at'], unique=False)


def downgrade():
    op.drop_table('reminder')
    op.drop_table('outfit_item')
    op.drop_table('outfit')
    op.drop_table('item_tag')
    op.drop_table('item')
    op.drop_table('user')
