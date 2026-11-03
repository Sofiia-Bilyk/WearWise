"""Store encrypted Google Calendar credentials independently of user sessions."""
from alembic import op
import sqlalchemy as sa

revision = 'c83e216b0a43'
down_revision = 'b72d105a9f32'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('google_calendar_connection',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id'), primary_key=True),
        sa.Column('encrypted_credentials', sa.Text(), nullable=False))


def downgrade():
    op.drop_table('google_calendar_connection')
