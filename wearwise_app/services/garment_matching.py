"""Rank existing wardrobe items by similarity to a detected garment."""

from dataclasses import dataclass
from typing import Iterable

import numpy as np
from PIL import Image

from .image_embeddings import ImageEmbedding, create_image_embedding


EMBEDDING_DIMENSION = 512
# Starting value only; tune using labeled garment photos.
# Similarity is not a probability that two garments are identical.
DEFAULT_MIN_SIMILARITY = 0.80


@dataclass(frozen=True)
class WardrobeCandidate:
    """An existing item and its previously generated image embedding."""

    item_id: int
    user_id: int
    category: str | None
    embedding: ImageEmbedding


@dataclass(frozen=True)
class GarmentMatch:
    """A suggested existing item; similarity is not a probability."""

    item_id: int
    similarity: float


def _unit_vector(embedding: ImageEmbedding) -> np.ndarray:
    """Validate and normalize a vector before comparing it."""
    vector = np.asarray(embedding.vector, dtype=np.float64)

    if vector.shape != (EMBEDDING_DIMENSION,):
        raise ValueError("Expected a 512-dimensional image embedding.")

    if not np.isfinite(vector).all():
        raise ValueError("Embedding contains non-finite values.")

    norm = np.linalg.norm(vector)
    if not np.isfinite(norm) or norm <= 0:
        raise ValueError("Embedding must have a finite, non-zero length.")

    return vector / norm


def _compatible(first: ImageEmbedding, second: ImageEmbedding) -> bool:
    """Only compare vectors produced by the same model and preprocessing."""
    return (
        first.model_id == second.model_id
        and first.model_revision == second.model_revision
        and first.pipeline_version == second.pipeline_version
        and first.model_revision != "unknown"
    )


def compare_embedding(
    detected_embedding: ImageEmbedding,
    candidates: Iterable[WardrobeCandidate],
    *,
    current_user_id: int,
    category: str | None = None,
    limit: int = 3,
    min_similarity: float = DEFAULT_MIN_SIMILARITY,
) -> list[GarmentMatch]:
    """Return the closest compatible wardrobe items, best match first.

    Candidates must come from an owner-filtered database query that excludes
    archived items. The ownership check here provides an additional safeguard.

    Supply category only when the detected category is sufficiently reliable;
    otherwise leave it unset so a classification mistake cannot hide a match.
    """
    # Keep suggestions small enough for a user to review.
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 3:
        raise ValueError("The result limit must be an integer between 1 and 3.")

    if not np.isfinite(min_similarity) or not -1.0 <= min_similarity <= 1.0:
        raise ValueError("Minimum similarity must be a finite value from -1 to 1.")

    if detected_embedding.model_revision == "unknown":
        raise ValueError("The detected embedding has no known model revision.")

    query_vector = _unit_vector(detected_embedding)
    matches = []

    for candidate in candidates:
        # Never suggest another user's wardrobe items.
        if candidate.user_id != current_user_id:
            continue

        if category is not None and candidate.category != category:
            continue

        if not _compatible(detected_embedding, candidate.embedding):
            continue

        try:
            candidate_vector = _unit_vector(candidate.embedding)
        except (ValueError, TypeError):
            # A malformed stored vector must not break every suggestion.
            # The storage layer can flag it for regeneration separately.
            continue

        # For unit vectors, the dot product equals cosine similarity.
        similarity = float(np.dot(query_vector, candidate_vector))
        similarity = float(np.clip(similarity, -1.0, 1.0))

        # Filter weak matches before selecting the best three.
        # Preserve full precision for filtering and sorting.
        if similarity < min_similarity:
            continue

        matches.append(
            GarmentMatch(
                item_id=candidate.item_id,
                similarity=similarity,
            )
        )

    # Use item ID to make equally scored results deterministic.
    matches.sort(key=lambda match: (-match.similarity, match.item_id))
    # Empty means no eligible candidate met the threshold.
    return matches[:limit]


def match_detected_garment(
    crop: Image.Image,
    candidates: Iterable[WardrobeCandidate],
    *,
    current_user_id: int,
    category: str | None = None,
    limit: int = 3,
    min_similarity: float = DEFAULT_MIN_SIMILARITY,
) -> list[GarmentMatch]:
    """Embed one detected garment crop and rank existing wardrobe items."""
    detected_embedding = create_image_embedding(crop)

    return compare_embedding(
        detected_embedding,
        candidates,
        current_user_id=current_user_id,
        category=category,
        limit=limit,
        min_similarity=min_similarity,
    )
