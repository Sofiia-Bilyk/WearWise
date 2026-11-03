"""Add durable outfit submission receipts without changing existing outfits."""
from alembic import op
import sqlalchemy as sa

revision = 'b72d105a9f32'
down_revision = 'a31c92e7d104'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('outfit_submission',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), nullable=False),
        sa.Column('submission_id', sa.String(36), nullable=False),
        sa.Column('fingerprint', sa.String(64), nullable=True),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('response', sa.JSON(), nullable=True),
        sa.UniqueConstraint('user_id', 'submission_id', name='uq_outfit_submission_user_key'),
    )
    op.create_index('ix_outfit_submission_user_id', 'outfit_submission', ['user_id'])


def downgrade():
    op.drop_table('outfit_submission')
