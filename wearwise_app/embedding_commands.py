"""Explicit, retryable backfill of existing wardrobe photos."""
from collections import Counter
import click
from flask.cli import AppGroup
from sqlalchemy.orm import joinedload

from .models import Item, db
from .services.embedding_store import refresh_item_embedding
from .services.image_embeddings import _load_model

embeddings_cli = AppGroup('embeddings')


@embeddings_cli.command('backfill')
@click.option('--user-id', type=click.IntRange(min=1), help='Process only this user; omitted means all users.')
@click.option('--force', is_flag=True, help='Regenerate even unchanged ready vectors.')
@click.option('--download-model', is_flag=True, help='Explicitly allow downloading pretrained model files.')
def backfill(user_id, force, download_model):
    """Create missing vectors and refresh changed photos; safe to rerun.

    Only local uploaded photos are read. Nothing is sent to a model API.
    This is an administrator CLI command, not a public HTTP endpoint.
    """
    if download_model:
        click.echo('Preparing the CLIP model cache...')
        try:
            _load_model(allow_download=True)
        except Exception as exc:
            raise click.ClickException(f'Cannot prepare CLIP ({type(exc).__name__}). No photos processed.') from exc
    statement = db.select(Item.id).where(Item.archived_at.is_(None))
    if user_id is not None:
        statement = statement.where(Item.user_id == user_id)
    ids = db.session.scalars(statement.order_by(Item.id)).all()
    counts = Counter()
    for item_id in ids:
        item = db.session.execute(db.select(Item).where(Item.id == item_id)
                                  .options(joinedload(Item.embedding))).scalar_one()
        try:
            counts[refresh_item_embedding(item, force=force)] += 1
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise click.ClickException(f'Could not save embedding state for item {item_id}. Rerun to resume.')
    click.echo(f'Processed {len(ids)} active items: ' + ', '.join(f'{key}={value}' for key, value in sorted(counts.items())))
    if counts['unavailable']:
        raise click.ClickException('Some embeddings are unavailable. Prepare the model and rerun this command.')
