"""Storage and authenticated detection tests use deterministic model doubles."""
import base64
import hashlib
from datetime import datetime
from io import BytesIO
from unittest.mock import Mock

import pytest
from PIL import Image

from wearwise_app.models import Item, ItemEmbedding, User, db
from wearwise_app.services.image_embeddings import ImageEmbedding, MODEL_ID, PIPELINE_VERSION
from wearwise_app.services.embedding_store import refresh_item_embedding, _read_local_photo


def vector(x=1.0, y=0.0, revision='test-revision'):
    return ImageEmbedding([x, y] + [0.0] * 510, MODEL_ID, revision, PIPELINE_VERSION)


def png(color='blue'):
    output = BytesIO()
    Image.new('RGB', (16, 16), color).save(output, format='PNG')
    return output.getvalue()


def photo(color='blue'):
    return 'data:image/png;base64,' + base64.b64encode(png(color)).decode()


@pytest.fixture
def uploads(app, tmp_path):
    app.config['UPLOAD_FOLDER'] = str(tmp_path)
    return tmp_path


@pytest.fixture
def encoder(monkeypatch):
    encode = Mock(return_value=vector())
    monkeypatch.setattr('wearwise_app.services.embedding_store.create_image_embedding', encode)
    monkeypatch.setattr('wearwise_app.services.detection_matching.create_image_embedding', encode)
    return encode


def stored_item(owner, name='Shirt', value=None, archived=False, source='/uploads/shirt.png'):
    item = Item(user_id=owner, name=name, category='Top', image_path=source,
                archived_at=datetime.utcnow() if archived else None)
    value = value or vector()
    item.embedding = ItemEmbedding(vector=value.vector, model_id=value.model_id,
        model_revision=value.model_revision, pipeline_version=value.pipeline_version,
        source_image_path=source, image_sha256='test-hash', status='ready')
    db.session.add(item)
    db.session.commit()
    return item


def fake_detection(monkeypatch, image=None):
    detection = {'id': 'det-1', 'name': 'Detected shirt', 'category': 'Top',
                 'image': image if image is not None else photo(), 'confidence': 0.9}
    monkeypatch.setattr('wearwise_app.routes.detection.detect_clothing', lambda _: [detection])


def test_item_creation_persists_vector_but_api_keeps_it_private(authenticated_client, uploads, encoder):
    response = authenticated_client.post('/items', json={'name': 'Shirt', 'image': photo()})
    assert response.status_code == 201
    assert response.json['embeddingStatus'] == 'ready'
    assert 'vector' not in response.json
    item = db.session.get(Item, int(response.json['id']))
    assert item.embedding.vector == vector().vector
    assert item.embedding.image_sha256 == hashlib.sha256(png()).hexdigest()
    assert item.embedding.source_image_path == item.image_path
    encoder.assert_called_once()


def test_photo_replacement_regenerates_and_metadata_only_edit_does_not(authenticated_client, uploads, encoder):
    response = authenticated_client.post('/items', json={'name': 'Shirt', 'image': photo()})
    item_id = response.json['id']
    old_hash = db.session.get(ItemEmbedding, int(item_id)).image_sha256
    response = authenticated_client.put(f'/items/{item_id}', json={'name': 'Renamed'})
    assert response.status_code == 200
    assert encoder.call_count == 1
    response = authenticated_client.put(f'/items/{item_id}', json={'image': photo('red')})
    assert response.status_code == 200
    assert encoder.call_count == 2
    assert db.session.get(ItemEmbedding, int(item_id)).image_sha256 != old_hash


def test_model_failure_clears_old_vector_without_losing_new_photo(authenticated_client, uploads, encoder):
    created = authenticated_client.post('/items', json={'name': 'Shirt', 'image': photo()}).json
    encoder.side_effect = OSError('weights not cached')
    updated = authenticated_client.put('/items/' + created['id'], json={'image': photo('red')})
    assert updated.status_code == 200
    assert updated.json['embeddingStatus'] == 'unavailable'
    record = db.session.get(ItemEmbedding, int(created['id']))
    assert record.vector is None
    assert record.model_revision is None
    assert record.image_sha256 == hashlib.sha256(png('red')).hexdigest()


def test_removing_photo_invalidates_embedding(authenticated_client, uploads, encoder):
    created = authenticated_client.post('/items', json={'name': 'Shirt', 'image': photo()}).json
    updated = authenticated_client.put('/items/' + created['id'], json={'image': ''})
    assert updated.status_code == 200
    assert updated.json['embeddingStatus'] == 'no_image'
    assert db.session.get(ItemEmbedding, int(created['id'])).vector is None


@pytest.mark.parametrize('image_path', ['https://example.com/a.jpg', '/uploads/../secret.png', '/uploads/%2e%2e%2fsecret.png', '/etc/passwd', '/uploads/..%5csecret.png'])
def test_photo_loader_rejects_external_and_traversal_paths(app, image_path):
    with pytest.raises(ValueError):
        _read_local_photo(image_path)


def test_backfill_is_owner_scoped_idempotent_and_forceable(authenticated_client, registered_user, uploads, encoder):
    (uploads / 'old.png').write_bytes(png())
    owner = registered_user['id']
    other = User(email='backfill-other@example.invalid', password_hash='hash')
    db.session.add(other)
    db.session.flush()
    old = Item(user_id=owner, name='Old photo', image_path='/uploads/old.png')
    archived = Item(user_id=owner, name='Archived', image_path='/uploads/old.png', archived_at=datetime.utcnow())
    foreign = Item(user_id=other.id, name='Foreign', image_path='/uploads/old.png')
    db.session.add_all([old, archived, foreign]); db.session.commit()
    args = ['embeddings', 'backfill', '--user-id', str(owner)]
    from flask import current_app
    runner = current_app.test_cli_runner()
    result = runner.invoke(args=args)
    assert result.exit_code == 0, result.output
    assert 'ready=1' in result.output
    assert old.embedding.status == 'ready'
    assert archived.embedding is None and foreign.embedding is None
    result = runner.invoke(args=args)
    assert result.exit_code == 0 and 'skipped=1' in result.output
    assert encoder.call_count == 1
    result = runner.invoke(args=args + ['--force'])
    assert result.exit_code == 0
    assert encoder.call_count == 2
    (uploads / 'old.png').write_bytes(png('red'))
    result = runner.invoke(args=args)
    assert result.exit_code == 0
    assert encoder.call_count == 3


def test_backfill_reports_unavailable_and_can_resume(authenticated_client, registered_user, uploads, encoder):
    (uploads / 'old.png').write_bytes(png())
    item = Item(user_id=registered_user['id'], name='Old', image_path='/uploads/old.png')
    db.session.add(item); db.session.commit()
    from flask import current_app
    runner = current_app.test_cli_runner()
    encoder.side_effect = OSError('offline')
    result = runner.invoke(args=['embeddings', 'backfill'])
    assert result.exit_code != 0 and 'unavailable=1' in result.output
    assert item.embedding.status == 'unavailable'
    encoder.side_effect = None
    result = runner.invoke(args=['embeddings', 'backfill'])
    assert result.exit_code == 0 and item.embedding.status == 'ready'


def test_detect_filters_other_users_and_archived_items(authenticated_client, registered_user, encoder, monkeypatch):
    owner = registered_user['id']
    other = User(email='match-other@example.invalid', password_hash='hash')
    db.session.add(other); db.session.commit()
    stored_item(other.id, 'Foreign exact match')
    stored_item(owner, 'Archived exact match', archived=True)
    mine = stored_item(owner, 'Own match', vector(0.88, (1 - 0.88**2)**0.5))
    fake_detection(monkeypatch)
    response = authenticated_client.post('/detect', json={'image': photo()})
    assert response.status_code == 200
    detection = response.json['detections'][0]
    assert detection['matchedItemId'] == str(mine.id)
    assert detection['matchingStatus'] == 'matched'
    assert [m['itemId'] for m in detection['matches']] == [str(mine.id)]


@pytest.mark.parametrize('first, second, expected', [(0.6, None, 'no_match'), (0.9, 0.89, 'ambiguous'), (0.82, 0.79, 'ambiguous'), (0.96, 0.83, 'matched')])
def test_detect_threshold_and_ambiguity_rules(authenticated_client, registered_user, encoder, monkeypatch, first, second, expected):
    owner = registered_user['id']
    top = stored_item(owner, value=vector(first, (1-first**2)**0.5))
    if second is not None:
        stored_item(owner, value=vector(second, (1-second**2)**0.5))
    fake_detection(monkeypatch)
    result = authenticated_client.post('/detect', json={'image': photo()}).json['detections'][0]
    assert result['matchingStatus'] == expected
    assert result['matchedItemId'] == (str(top.id) if expected == 'matched' else None)


def test_detect_model_failure_keeps_manual_detection_working(authenticated_client, registered_user, encoder, monkeypatch):
    stored_item(registered_user['id'])
    encoder.side_effect = OSError('not cached')
    fake_detection(monkeypatch)
    response = authenticated_client.post('/detect', json={'image': photo()})
    assert response.status_code == 200
    detection = response.json['detections'][0]
    assert detection['matchingStatus'] == 'unavailable'
    assert detection['matchedItemId'] is None
    assert detection['name'] == 'Detected shirt'


def test_detect_ignores_stale_photo_embeddings(authenticated_client, registered_user, encoder, monkeypatch):
    item = stored_item(registered_user['id'])
    item.image_path = '/uploads/replaced.png'; db.session.commit()
    fake_detection(monkeypatch)
    result = authenticated_client.post('/detect', json={'image': photo()}).json['detections'][0]
    assert result['matchingStatus'] == 'no_candidates'
    encoder.assert_not_called()


def test_detect_skips_invalid_crops_and_incompatible_revisions(authenticated_client, registered_user, encoder, monkeypatch):
    item = stored_item(registered_user['id'], value=vector(revision='old-revision'))
    fake_detection(monkeypatch, image='not-an-image')
    result = authenticated_client.post('/detect', json={'image': photo()}).json['detections'][0]
    assert result['matchingStatus'] == 'invalid_crop'
    fake_detection(monkeypatch)
    result = authenticated_client.post('/detect', json={'image': photo()}).json['detections'][0]
    assert result['matchedItemId'] is None and result['matches'] == []


def test_detect_returns_only_three_qualified_candidates(authenticated_client, registered_user, encoder, monkeypatch):
    for _ in range(5): stored_item(registered_user['id'])
    fake_detection(monkeypatch)
    result = authenticated_client.post('/detect', json={'image': photo()}).json['detections'][0]
    assert len(result['matches']) == 3
    assert result['matchedItemId'] is None  # All five are tied.


@pytest.mark.parametrize('value', [None, 3, [], {}])
def test_detect_rejects_nonstring_images(authenticated_client, value):
    assert authenticated_client.post('/detect', json={'image': value}).status_code == 400


def test_detect_requires_authentication(client):
    assert client.post('/detect', json={'image': photo()}).status_code == 401


@pytest.mark.parametrize('image', ['', '/placeholder-garment.svg', 'https://example.com/photo.jpg'])
def test_missing_or_unsupported_photos_save_without_inference(authenticated_client, uploads, encoder, image):
    response = authenticated_client.post('/items', json={'name': 'Manual item', 'image': image})
    assert response.status_code == 201
    assert response.json['embeddingStatus'] in {'no_image', 'invalid_image'}
    encoder.assert_not_called()


def test_backfill_download_is_explicit_and_failure_is_reported(app, monkeypatch):
    load = Mock(side_effect=OSError('network unavailable'))
    monkeypatch.setattr('wearwise_app.embedding_commands._load_model', load)
    runner = app.test_cli_runner()
    result = runner.invoke(args=['embeddings', 'backfill'])
    assert result.exit_code == 0
    load.assert_not_called()
    result = runner.invoke(args=['embeddings', 'backfill', '--download-model'])
    assert result.exit_code != 0 and 'No photos processed' in result.output
    load.assert_called_once_with(allow_download=True)
