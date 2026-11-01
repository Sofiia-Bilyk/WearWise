"""Attach owner-scoped wardrobe suggestions to detector results."""
import logging
from flask import current_app
from PIL import Image

from ..models import Item, ItemEmbedding, db
from .embedding_store import decode_detection_crop, stored_embedding
from .image_embeddings import create_image_embedding
from .garment_matching import WardrobeCandidate, compare_embedding

logger = logging.getLogger(__name__)


def match_detections(detections, user_id):
    # Join on active items belonging to this user, never a shared vector index.
    records = db.session.execute(
        db.select(Item, ItemEmbedding).join(ItemEmbedding, Item.id == ItemEmbedding.item_id)
        .where(Item.user_id == user_id, Item.archived_at.is_(None),
               ItemEmbedding.status == 'ready', ItemEmbedding.vector.is_not(None),
               ItemEmbedding.source_image_path == Item.image_path)
    ).all()
    candidates = [WardrobeCandidate(item.id, item.user_id, item.category, stored_embedding(record))
                  for item, record in records]
    threshold = current_app.config['MATCH_MIN_SIMILARITY']
    margin = current_app.config['MATCH_MIN_MARGIN']
    unavailable = False
    results = []
    for detection in detections:
        result = dict(detection, matchedItemId=None, matches=[], matchingStatus='no_candidates')
        results.append(result)
        if not candidates:
            continue
        if unavailable:
            result['matchingStatus'] = 'unavailable'
            continue
        try:
            crop = decode_detection_crop(detection.get('image', ''))
        except (OSError, ValueError, Image.DecompressionBombError):
            result['matchingStatus'] = 'invalid_crop'
            continue
        try:
            query = create_image_embedding(crop)
            # Rank all similarities first: a near-tie just below the threshold
            # must still prevent an unsafe automatic assignment.
            ranked = compare_embedding(query, candidates, current_user_id=user_id,
                                       min_similarity=-1.0, limit=3)
        except Exception as exc:
            unavailable = True
            result['matchingStatus'] = 'unavailable'
            logger.warning('Detection matching unavailable (%s).', type(exc).__name__)
            continue
        finally:
            crop.close()
        qualified = [match for match in ranked if match.similarity >= threshold]
        result['matches'] = [{'itemId': str(match.item_id), 'similarity': match.similarity}
                             for match in qualified]
        result['matchingStatus'] = 'no_match'
        if not qualified:
            continue
        if len(ranked) > 1 and ranked[0].similarity - ranked[1].similarity < margin:
            result['matchingStatus'] = 'ambiguous'
            continue
        result['matchedItemId'] = str(qualified[0].item_id)
        result['matchingStatus'] = 'matched'
    return results
