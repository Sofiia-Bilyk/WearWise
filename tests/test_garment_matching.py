"""Comparison tests use synthetic vectors; no model download is required."""

from dataclasses import replace
from unittest.mock import patch

from PIL import Image
import pytest

from wearwise_app.services.image_embeddings import ImageEmbedding
from wearwise_app.services.garment_matching import (
    WardrobeCandidate,
    compare_embedding,
    match_detected_garment,
)


def embedding(x=1.0, y=0.0, **metadata):
    return ImageEmbedding(
        vector=[x, y] + [0.0] * 510,
        model_id=metadata.get('model_id', 'test-model'),
        model_revision=metadata.get('model_revision', 'test-revision'),
        pipeline_version=metadata.get('pipeline_version', 'test-v1'),
    )


def candidate(item_id, value=None, user_id=1, category='Top'):
    return WardrobeCandidate(item_id, user_id, category, value or embedding())


def test_ranks_by_cosine_similarity_and_limits_results():
    candidates = [
        candidate(3, embedding(-1)),
        candidate(2, embedding(0, 1)),
        candidate(1, embedding(8)),
    ]
    matches = compare_embedding(embedding(), candidates, current_user_id=1, limit=2, min_similarity=-1.0)
    assert [match.item_id for match in matches] == [1, 2]
    assert matches[0].similarity == pytest.approx(1.0)
    assert matches[1].similarity == pytest.approx(0.0)


def test_never_returns_another_users_items():
    matches = compare_embedding(
        embedding(), [candidate(1, user_id=2)], current_user_id=1
    )
    assert matches == []


def test_category_filter_is_optional():
    candidates = [candidate(1, category='Bottom'), candidate(2, category='Top')]
    assert len(compare_embedding(embedding(), candidates, current_user_id=1)) == 2
    matches = compare_embedding(
        embedding(), candidates, current_user_id=1, category='Top'
    )
    assert [match.item_id for match in matches] == [2]


@pytest.mark.parametrize('field', ['model_id', 'model_revision', 'pipeline_version'])
def test_skips_incompatible_embedding_metadata(field):
    incompatible = replace(embedding(), **{field: 'different'})
    assert compare_embedding(
        embedding(), [candidate(1, incompatible)], current_user_id=1
    ) == []


@pytest.mark.parametrize('vector', [
    [1.0], [0.0] * 512, [float('nan')] * 512,
    [float('inf')] * 512, ['invalid'] * 512,
])
def test_skips_bad_candidate_vectors_without_losing_valid_matches(vector):
    invalid = replace(embedding(), vector=vector)
    matches = compare_embedding(
        embedding(), [candidate(1, invalid), candidate(2)], current_user_id=1
    )
    assert [match.item_id for match in matches] == [2]


def test_rejects_unknown_query_revision():
    with pytest.raises(ValueError, match='revision'):
        compare_embedding(
            embedding(model_revision='unknown'), [], current_user_id=1
        )


def test_rejects_invalid_query_vector():
    with pytest.raises(ValueError, match='non-zero'):
        compare_embedding(embedding(0, 0), [], current_user_id=1)


@pytest.mark.parametrize('limit', [0, -1, 4, True, 1.5])
def test_rejects_invalid_limit(limit):
    with pytest.raises(ValueError, match='integer between 1 and 3'):
        compare_embedding(embedding(), [], current_user_id=1, limit=limit)


def test_empty_wardrobe_returns_no_matches():
    assert compare_embedding(embedding(), [], current_user_id=1) == []


def test_tied_scores_have_stable_item_id_order():
    matches = compare_embedding(
        embedding(), [candidate(8), candidate(2)], current_user_id=1
    )
    assert [match.item_id for match in matches] == [2, 8]


def test_crop_is_embedded_once_and_returns_existing_item_id():
    crop = Image.new('RGB', (32, 32))
    with patch(
        'wearwise_app.services.garment_matching.create_image_embedding',
        return_value=embedding(),
    ) as encode:
        matches = match_detected_garment(
            crop, [candidate(42)], current_user_id=1, category='Top'
        )
    encode.assert_called_once_with(crop)
    assert matches[0].item_id == 42


@pytest.mark.parametrize('score, included', [(0.799, False), (0.8, True), (0.801, True)])
def test_threshold_boundary(score, included):
    # Construct unit vectors whose cosine similarity is the requested score.
    value = embedding(score, (1 - score ** 2) ** 0.5)
    matches = compare_embedding(embedding(), [candidate(1, value)], current_user_id=1)
    assert bool(matches) is included


def test_returns_no_matches_when_all_scores_are_too_low():
    matches = compare_embedding(
        embedding(), [candidate(1, embedding(0, 1)), candidate(2, embedding(-1))],
        current_user_id=1,
    )
    assert matches == []


def test_returns_three_best_qualifying_candidates():
    candidates = [
        candidate(index, embedding(score, (1 - score ** 2) ** 0.5))
        for index, score in [(1, 0.65), (2, 0.81), (3, 0.86), (4, 0.93), (5, 0.82)]
    ]
    matches = compare_embedding(embedding(), candidates, current_user_id=1)
    assert [match.item_id for match in matches] == [4, 3, 5]


@pytest.mark.parametrize('threshold', [float('nan'), float('inf'), -1.01, 1.01])
def test_rejects_invalid_similarity_threshold(threshold):
    with pytest.raises(ValueError, match='finite value'):
        compare_embedding(embedding(), [], current_user_id=1, min_similarity=threshold)


def test_crop_matching_passes_through_custom_threshold():
    crop = Image.new('RGB', (32, 32))
    with patch(
        'wearwise_app.services.garment_matching.create_image_embedding',
        return_value=embedding(),
    ):
        matches = match_detected_garment(
            crop, [candidate(1, embedding(0.6, 0.8))],
            current_user_id=1, min_similarity=0.5,
        )
    assert [match.item_id for match in matches] == [1]


@pytest.mark.parametrize('threshold', [-1.0, 1.0])
def test_similarity_threshold_endpoints_are_inclusive(threshold):
    matches = compare_embedding(
        embedding(), [candidate(1, embedding(threshold))],
        current_user_id=1, min_similarity=threshold,
    )
    assert [match.item_id for match in matches] == [1]
