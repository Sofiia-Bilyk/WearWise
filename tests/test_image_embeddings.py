"""Model-loading and normalization regressions; no weight downloads required."""
from types import SimpleNamespace
from unittest.mock import Mock
import math

import pytest
import torch
from PIL import Image
from wearwise_app.services import image_embeddings as module


def test_loader_preserves_parent_checkpoint_revision_and_uses_cached_files(monkeypatch):
    revision = 'a' * 40
    config_load = Mock(return_value=SimpleNamespace(_commit_hash=revision))
    model = Mock()
    model.config = SimpleNamespace(_commit_hash=None)
    model.to.return_value = model
    model.eval.return_value = model
    model_load = Mock(return_value=model)
    processor = Mock()
    processor_load = Mock(return_value=processor)
    monkeypatch.setattr(module, '_model', None)
    monkeypatch.setattr(module, '_processor', None)
    monkeypatch.setattr(module.CLIPConfig, 'from_pretrained', config_load)
    monkeypatch.setattr(module.CLIPVisionModelWithProjection, 'from_pretrained', model_load)
    monkeypatch.setattr(module.CLIPImageProcessor, 'from_pretrained', processor_load)
    assert module._load_model() == (processor, model)
    assert model.config._commit_hash == revision
    assert config_load.call_args.kwargs['local_files_only'] is True
    assert model_load.call_args.kwargs['revision'] == revision
    assert model_load.call_args.kwargs['local_files_only'] is True
    assert model_load.call_args.kwargs['weights_only'] is True
    assert processor_load.call_args.kwargs['revision'] == revision
    module._load_model()
    model_load.assert_called_once()


def test_loader_does_not_publish_a_partially_loaded_model(monkeypatch):
    monkeypatch.setattr(module, '_model', None)
    monkeypatch.setattr(module, '_processor', None)
    monkeypatch.setattr(module.CLIPConfig, 'from_pretrained', Mock(return_value=SimpleNamespace(_commit_hash=None)))
    with pytest.raises(RuntimeError, match='revision'):
        module._load_model()
    assert module._model is None and module._processor is None


def test_embedding_converts_rgb_normalizes_and_preserves_metadata(monkeypatch):
    processor = Mock(return_value={'pixel_values': torch.zeros(1, 3, 224, 224)})
    model = Mock(return_value=SimpleNamespace(image_embeds=torch.tensor([[3.0, 4.0] + [0.0]*510])))
    model.config = SimpleNamespace(_commit_hash='known-revision')
    monkeypatch.setattr(module, '_load_model', lambda: (processor, model))
    result = module.create_image_embedding(Image.new('RGBA', (16, 16)))
    assert len(result.vector) == 512
    assert math.isclose(sum(v*v for v in result.vector), 1.0, abs_tol=1e-6)
    assert result.model_revision == 'known-revision'
    assert processor.call_args.kwargs['images'].mode == 'RGB'


@pytest.mark.parametrize('values', [[0.0]*512, [float('nan')]*512, [float('inf')]*512])
def test_embedding_rejects_bad_model_vectors(monkeypatch, values):
    processor = Mock(return_value={})
    model = Mock(return_value=SimpleNamespace(image_embeds=torch.tensor([values])))
    monkeypatch.setattr(module, '_load_model', lambda: (processor, model))
    with pytest.raises(RuntimeError, match='invalid embedding'):
        module.create_image_embedding(Image.new('RGB', (16, 16)))


@pytest.mark.parametrize('size', [(0, 1), (5000, 5000)])
def test_image_validation_runs_before_model_loading(monkeypatch, size):
    load = Mock()
    monkeypatch.setattr(module, '_load_model', load)
    with pytest.raises(ValueError):
        module.create_image_embedding(SimpleNamespace(size=size))
    load.assert_not_called()
