"""Verify demo photo replacement without downloading or altering real records."""
from io import BytesIO
from unittest.mock import Mock

import pytest
from PIL import Image

from scripts import replace_demo_photos as photos
from scripts.seed_demo_data import ITEMS, MARKER
from wearwise_app.models import db, Item, ItemTag, Outfit, OutfitItem


def jpeg():
    buffer = BytesIO()
    Image.new('RGB', (16, 16), 'blue').save(buffer, format='JPEG')
    return buffer.getvalue()


@pytest.fixture
def dataset(app, authenticated_client, registered_user, user_data, tmp_path, monkeypatch):
    monkeypatch.setattr(photos, 'EMAIL', user_data['email'])
    monkeypatch.setattr(photos, '__file__', str(tmp_path / 'scripts' / 'replace_demo_photos.py'))
    monkeypatch.setattr(photos, 'backup_database', Mock(return_value=tmp_path / 'backup.db'))
    monkeypatch.setattr(photos, 'download_photo', Mock(return_value=jpeg()))
    monkeypatch.setattr(photos, 'refresh_item_embedding', Mock(return_value='ready'))
    app.config['UPLOAD_FOLDER'] = str(tmp_path / 'uploads')
    uid = registered_user['id']
    original = Item(user_id=uid, name='Original real item', image_path='/uploads/original.jpg')
    db.session.add(original)
    demo = []
    for name, category, color, cost, _ in ITEMS:
        item = Item(user_id=uid, name=f'[Demo] {name}', category=category, color=color, cost=cost, image_path='/demo/old.svg')
        db.session.add(item); db.session.flush()
        db.session.add(ItemTag(user_id=uid, item_id=item.id, tag=MARKER))
        demo.append(item)
    outfit = Outfit(user_id=uid, notes='Existing history')
    db.session.add(outfit); db.session.flush()
    for item in demo:
        db.session.add(OutfitItem(outfit_id=outfit.id, item_id=item.id))
    db.session.commit()
    return app, original.id, [item.id for item in demo], outfit.id, tmp_path


def test_replacement_preserves_ids_history_costs_and_original_item(dataset):
    app, original_id, ids, outfit_id, folder = dataset
    costs = {item_id: db.session.get(Item, item_id).cost for item_id in ids}
    photos.replace_photos(app)
    assert db.session.get(Item, original_id).image_path == '/uploads/original.jpg'
    assert db.session.get(Item, original_id).name == 'Original real item'
    for item_id, (name, color, _) in zip(ids, photos.PHOTOS):
        item = db.session.get(Item, item_id)
        assert item.name == f'[Demo] {name}' and item.color == color
        assert item.cost == costs[item_id]
        assert item.image_path.startswith('/uploads/demo-pexels-')
    assert {link.item_id for link in db.session.get(Outfit, outfit_id).outfit_items} == set(ids)
    assert db.session.query(ItemTag).filter_by(tag=MARKER).count() == 16
    assert len(list((folder/'uploads').glob('*.jpg'))) == 16
    assert (folder/'docs/demo-photo-sources.json').exists()
    assert photos.refresh_item_embedding.call_count == 16
    photos.backup_database.assert_called_once()
    photos.replace_photos(app)
    assert db.session.query(Item).count() == 17
    assert len(list((folder/'uploads').glob('*.jpg'))) == 16


def test_failed_download_does_not_change_any_records_or_create_backup(dataset):
    app, _, ids, _, _ = dataset
    photos.download_photo.side_effect = RuntimeError('Download failed')
    with pytest.raises(RuntimeError, match='Download failed'):
        photos.replace_photos(app)
    assert all(db.session.get(Item, item_id).image_path == '/demo/old.svg' for item_id in ids)
    photos.backup_database.assert_not_called()


def test_mid_update_failure_rolls_back_all_demo_changes(dataset):
    app, _, ids, _, _ = dataset
    photos.refresh_item_embedding.side_effect = ['ready', RuntimeError('Unexpected inference failure')]
    with pytest.raises(RuntimeError, match='Unexpected inference failure'):
        photos.replace_photos(app)
    assert all(db.session.get(Item, item_id).image_path == '/demo/old.svg' for item_id in ids)


def test_missing_demo_item_aborts_before_download(dataset):
    app, _, ids, _, _ = dataset
    db.session.get(Item, ids[0]).name = 'Changed manually'
    db.session.commit()
    with pytest.raises(RuntimeError, match='uniquely identify'):
        photos.replace_photos(app)
    photos.download_photo.assert_not_called()


@pytest.mark.parametrize('kind', ['valid', 'non_image', 'corrupt', 'oversized'])
def test_downloader_validates_responses(monkeypatch, kind):
    response = Mock()
    response.headers = {'Content-Type': 'text/html' if kind == 'non_image' else 'image/jpeg'}
    body = b'invalid' if kind == 'corrupt' else jpeg()
    response.iter_content.return_value = [body]
    context = Mock()
    context.__enter__ = Mock(return_value=response)
    context.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(photos.requests, 'get', Mock(return_value=context))
    if kind == 'oversized':
        monkeypatch.setattr(photos, 'MAX_BYTES', 1)
    if kind == 'valid':
        assert photos.download_photo(123) == body
    else:
        with pytest.raises((ValueError, OSError)):
            photos.download_photo(123)
