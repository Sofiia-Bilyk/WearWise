"""Real database/file tests for atomic saves and durable retries (no CLIP download)."""
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from io import BytesIO
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest
from PIL import Image
from sqlalchemy.exc import IntegrityError

from wearwise_app.models import db, User, Item, Outfit, OutfitItem, OutfitSubmission
from wearwise_app.services import outfit_submission as service


def image_bytes():
    output = BytesIO()
    Image.new('RGB', (20, 30), 'blue').save(output, format='PNG')
    return output.getvalue()


def payload(**overrides):
    data = {'submissionId': str(uuid4()), 'date': '2026-11-01', 'entries': [
        {'kind': 'new', 'draftId': 'crop-1', 'item': {
            'name': 'Blue shirt', 'category': 'Top', 'color': 'Blue', 'cost': 25,
            'image': 'data:image/png;base64,' + base64.b64encode(image_bytes()).decode(),
        }},
    ]}
    data.update(overrides)
    return data


@pytest.fixture
def uploads(app, tmp_path, monkeypatch):
    app.config['UPLOAD_FOLDER'] = str(tmp_path / 'uploads')
    Path(app.config['UPLOAD_FOLDER']).mkdir()
    # Exercise all persistence, but avoid model loading in route tests.
    monkeypatch.setattr(service, 'refresh_item_embedding', lambda item: None)
    return Path(app.config['UPLOAD_FOLDER'])


def post(client, data, photo=None):
    if photo is None:
        return client.post('/outfit-submissions', json=data)
    import json
    return client.post('/outfit-submissions', data={
        'payload': json.dumps(data), 'image': (BytesIO(photo), 'outfit.png'),
    })


def counts():
    return tuple(db.session.query(model).count() for model in (Item, Outfit, OutfitItem, OutfitSubmission))


def test_authentication_and_input_shape(client, authenticated_client, uploads):
    # Use an independent anonymous client because authenticated_client shares client.
    anonymous = client.application.test_client()
    assert post(anonymous, payload()).status_code == 401
    for data in ([], None, {}, {'submissionId': 'bad'}):
        assert post(authenticated_client, data).status_code == 400
    assert counts() == (0, 0, 0, 0)


def test_atomic_mixed_save_replay_and_photo_ownership(authenticated_client, registered_user, uploads):
    item = Item(user_id=registered_user['id'], name='Existing jeans', category='Bottom')
    db.session.add(item)
    db.session.commit()
    data = payload()
    data['entries'] += [{'kind': 'existing', 'itemId': str(item.id)}] * 2
    first = post(authenticated_client, data, image_bytes())
    assert first.status_code == 200, first.json
    assert counts() == (2, 1, 2, 1)
    assert len(first.json['items']) == 2
    assert all(item['wearCount'] == 1 for item in first.json['items'])
    assert first.json['outfit']['date'] == '2026-11-01'
    files = sorted(path.name for path in uploads.glob('*.jpg'))
    assert len(files) == 2
    assert not list((uploads / '.staging').iterdir())
    second = post(authenticated_client, data, image_bytes())
    assert second.status_code == 200
    assert first.json == second.json
    assert counts() == (2, 1, 2, 1)
    assert sorted(path.name for path in uploads.glob('*.jpg')) == files


@pytest.mark.parametrize('change', ['name', 'date', 'photo'])
def test_same_key_different_content_conflicts(authenticated_client, uploads, change):
    data = payload()
    assert post(authenticated_client, data, image_bytes()).status_code == 200
    if change == 'name':
        data['entries'][0]['item']['name'] = 'Replacement'
    elif change == 'date':
        data['date'] = '2026-11-02'
    response = post(authenticated_client, data, image_bytes() if change != 'photo' else None)
    assert response.status_code == 409
    assert counts() == (1, 1, 1, 1)


@pytest.mark.parametrize('changes', [
    {'date': '2026-02-30'}, {'date': '20261101'}, {'entries': []}, {'entries': [None]},
    {'entries': [{'kind': 'existing', 'itemId': True}]},
    {'entries': [{'kind': 'existing', 'itemId': '1.0'}]},
    {'entries': [{'kind': 'existing', 'itemId': '9' * 40}]},
])
def test_invalid_payload_creates_nothing(authenticated_client, uploads, changes):
    response = post(authenticated_client, payload(**changes))
    assert response.status_code == 400
    assert counts() == (0, 0, 0, 0)
    assert not list(uploads.rglob('*.jpg'))


@pytest.mark.parametrize(('field', 'value'), [
    ('name', '   '), ('category', 'unsupported'), ('cost', -2), ('cost', True),
    ('cost', '25'), ('cost', float('inf')), ('image', '/uploads/someone-elses-photo.jpg'),
    ('image', 'data:image/png;base64,not-base64'), ('image', False), ('cost', 10 ** 400), ('user_id', 123),
])
def test_invalid_new_item_creates_nothing(authenticated_client, uploads, field, value):
    data = payload()
    data['entries'][0]['item'][field] = value
    response = post(authenticated_client, data)
    assert response.status_code == 400, response.json
    assert counts() == (0, 0, 0, 0)


@pytest.mark.parametrize('kind', ['foreign', 'missing', 'archived'])
def test_unavailable_existing_item_rejects_whole_save(authenticated_client, registered_user, uploads, kind):
    from datetime import datetime
    owner = User(email='other-owner@example.com', password_hash='unused')
    db.session.add(owner)
    db.session.flush()
    item = Item(user_id=owner.id if kind == 'foreign' else registered_user['id'], name='Private')
    if kind == 'archived':
        item.archived_at = datetime.utcnow()
    db.session.add(item)
    db.session.commit()
    data = payload()
    data['entries'].append({'kind': 'existing', 'itemId': str(999999 if kind == 'missing' else item.id)})
    response = post(authenticated_client, data)
    assert response.status_code == 400
    assert counts() == (1, 0, 0, 0)
    assert not list(uploads.rglob('*.jpg'))


@pytest.mark.parametrize('failure', ['publish', 'embedding', 'commit'])
def test_failures_roll_back_records_and_attempt_owned_files(authenticated_client, uploads, monkeypatch, failure):
    untouched = uploads / 'existing.jpg'
    untouched.write_bytes(b'existing-photo')
    data = payload()
    with monkeypatch.context() as patch:
        def fail(*args, **kwargs):
            raise RuntimeError('simulated failure')
        if failure == 'publish':
            original = service.StagedUploads.publish
            def partial_publish(self):
                original(self)
                fail()
            patch.setattr(service.StagedUploads, 'publish', partial_publish)
        elif failure == 'embedding':
            patch.setattr(service, 'refresh_item_embedding', fail)
        else:
            patch.setattr(db.session, 'commit', fail)
        response = post(authenticated_client, data, image_bytes())
        assert response.status_code == 503
    assert counts() == (0, 0, 0, 0)
    assert untouched.read_bytes() == b'existing-photo'
    assert list(uploads.glob('*.jpg')) == [untouched]
    assert not list((uploads / '.staging').iterdir())
    assert post(authenticated_client, data, image_bytes()).status_code == 200
    assert counts() == (1, 1, 1, 1)


def test_lost_commit_acknowledgement_preserves_committed_photos(authenticated_client, uploads, monkeypatch):
    original = db.session.commit
    def commit_then_disconnect():
        original()
        raise RuntimeError('connection lost after commit')
    monkeypatch.setattr(db.session, 'commit', commit_then_disconnect)
    response = post(authenticated_client, payload(), image_bytes())
    assert response.status_code == 200
    assert counts() == (1, 1, 1, 1)
    assert len(list(uploads.glob('*.jpg'))) == 2


def test_saved_receipt_recovers_lost_response(authenticated_client, uploads):
    data = payload()
    first = post(authenticated_client, data)
    recovered = authenticated_client.post(f"/outfit-submissions/{data['submissionId']}/resolve")
    assert recovered.status_code == 200
    assert recovered.json == {'status': 'saved', 'result': first.json}
    assert counts() == (1, 1, 1, 1)


def test_cancellation_prevents_late_save(authenticated_client, uploads):
    data = payload()
    url = f"/outfit-submissions/{data['submissionId']}/resolve"
    assert authenticated_client.post(url).json == {'status': 'cancelled', 'result': None}
    assert authenticated_client.post(url).json == {'status': 'cancelled', 'result': None}
    assert post(authenticated_client, data).status_code == 409
    assert counts() == (0, 0, 0, 1)


def test_receipts_are_account_scoped(authenticated_client, client, uploads):
    data = payload()
    original = post(authenticated_client, data)
    other = client.application.test_client()
    assert other.post('/auth/register', json={
        'email': 'second@example.com', 'username': 'Second', 'password': 'testpassword123',
    }).status_code == 201
    other.post('/auth/login', json={'email': 'second@example.com', 'password': 'testpassword123'})
    result = post(other, data)
    assert result.status_code == 200
    assert result.json['outfit']['id'] != original.json['outfit']['id']
    assert counts() == (2, 2, 2, 2)


def test_duplicate_new_ids_and_corrupt_photo_are_rejected(authenticated_client, uploads):
    data = payload()
    data['entries'] *= 2
    assert post(authenticated_client, data).status_code == 400
    assert post(authenticated_client, payload(), b'not an image').status_code == 400
    assert counts() == (0, 0, 0, 0)


def test_request_size_limit(authenticated_client, uploads):
    response = authenticated_client.post('/outfit-submissions', data=b'x' * (32 * 1024 * 1024 + 1),
                                         content_type='application/json')
    assert response.status_code == 413
    assert counts() == (0, 0, 0, 0)


def test_missing_model_does_not_prevent_save(authenticated_client, uploads, monkeypatch):
    from wearwise_app.models import ItemEmbedding
    def unavailable(item):
        item.embedding = ItemEmbedding(status='unavailable')
    monkeypatch.setattr(service, 'refresh_item_embedding', unavailable)
    response = post(authenticated_client, payload())
    assert response.status_code == 200
    assert response.json['items'][0]['embeddingStatus'] == 'unavailable'


def test_database_unique_constraint_resolves_racing_save(authenticated_client, uploads, monkeypatch):
    data = payload()
    saved = post(authenticated_client, data).json
    original = service.find_submission
    calls = 0
    def miss_initial_check(user_id, key):
        nonlocal calls
        calls += 1
        return None if calls == 1 else original(user_id, key)
    # Simulate a competitor committing between the initial read and reserve.
    # The real DB unique constraint, rollback, and receipt replay are exercised.
    monkeypatch.setattr(service, 'find_submission', miss_initial_check)
    response = post(authenticated_client, data)
    assert response.status_code == 200
    assert response.json == saved
    assert counts() == (1, 1, 1, 1)


def test_parallel_requests_use_one_file_database(tmp_path, monkeypatch):
    from wearwise_app.app import create_app
    monkeypatch.setenv('UPLOAD_FOLDER', str(tmp_path / 'photos'))
    app = create_app({'TESTING': True, 'SECRET_KEY': 'parallel-test',
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///' + (tmp_path / 'parallel.db').as_posix(),
        'SQLALCHEMY_ENGINE_OPTIONS': {'connect_args': {'timeout': 15}}})
    with app.app_context():
        db.create_all()
        user = User(email='parallel@example.com', password_hash='unused')
        db.session.add(user)
        db.session.commit()
        user_id = user.id
    monkeypatch.setattr(service, 'refresh_item_embedding', lambda item: None)
    data = payload()
    barrier = Barrier(2)
    def save():
        with app.test_client() as client:
            with client.session_transaction() as session:
                session['user_id'] = user_id
            barrier.wait(timeout=10)
            return post(client, data)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: save(), range(2)))
    # A transient SQLite lock may ask one client to retry the exact submission.
    assert all(result.status_code in (200, 503) for result in results)
    assert any(result.status_code == 200 for result in results)
    with app.test_client() as client:
        with client.session_transaction() as session:
            session['user_id'] = user_id
        final = post(client, data)
        assert final.status_code == 200
        for result in results:
            if result.status_code == 200:
                assert result.json == final.json
    with app.app_context():
        assert counts() == (1, 1, 1, 1)
        assert len(list(Path(app.config['UPLOAD_FOLDER']).glob('*.jpg'))) == 1
        db.session.remove()
        db.engine.dispose()
