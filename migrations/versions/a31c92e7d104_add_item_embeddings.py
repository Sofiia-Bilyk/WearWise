"""Store image embeddings independently of client-editable item attributes."""
from alembic import op
import sqlalchemy as sa

revision = 'a31c92e7d104'
down_revision = '00e84c8ea077'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'item_embedding',
        sa.Column('item_id', sa.Integer(), sa.ForeignKey('item.id'), primary_key=True),
        sa.Column('vector', sa.JSON(), nullable=True),
        sa.Column('model_id', sa.String(120), nullable=True),
        sa.Column('model_revision', sa.String(80), nullable=True),
        sa.Column('pipeline_version', sa.String(50), nullable=True),
        sa.Column('image_sha256', sa.String(64), nullable=True),
        sa.Column('source_image_path', sa.String(255), nullable=True),
        sa.Column('status', sa.String(24), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

def downgrade():
    op.drop_table('item_embedding')
