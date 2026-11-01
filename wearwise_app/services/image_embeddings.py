"""Create image embeddings for wardrobe photos and detected garment crops."""

import os
from dataclasses import dataclass
from threading import Lock

import torch
from PIL import Image, ImageOps
from transformers import CLIPConfig, CLIPImageProcessor, CLIPVisionModelWithProjection


MODEL_ID = "openai/clip-vit-base-patch32"
MODEL_REVISION = os.environ.get("EMBEDDING_MODEL_REVISION", "main")
PIPELINE_VERSION = "clip-rgb-v1"
MAX_IMAGE_PIXELS = 20_000_000


@dataclass(frozen=True)
class ImageEmbedding:
    """Vector plus metadata needed to keep future comparisons compatible."""

    vector: list[float]
    model_id: str
    model_revision: str
    pipeline_version: str


# Each backend worker loads its own model once, when first needed.
# A lock prevents simultaneous requests from loading duplicate models.
_model = None
_processor = None
_load_lock = Lock()


def _load_model(*, allow_download: bool = False):
    """Reuse weights in each worker; web requests never initiate downloads.

    Run the embeddings backfill CLI with --download-model to populate the
    shared Hugging Face cache before serving real matching requests.
    """
    global _model, _processor

    with _load_lock:
        if _model is None:
            # The vision-only config can drop the parent checkpoint hash in
            # Transformers 4.x. Resolve it before extracting the vision model.
            config = CLIPConfig.from_pretrained(
                MODEL_ID, revision=MODEL_REVISION,
                local_files_only=not allow_download,
            )
            revision = getattr(config, '_commit_hash', None)
            if not revision:
                raise RuntimeError('Cannot resolve the embedding model revision.')
            model = CLIPVisionModelWithProjection.from_pretrained(
                MODEL_ID,
                revision=revision,
                local_files_only=not allow_download,
                # This checkpoint publishes PyTorch weights, not SafeTensors.
                use_safetensors=False,
                weights_only=True,
            )

            model.config._commit_hash = revision
            # Pin preprocessing to the same resolved checkpoint as the weights.
            processor = CLIPImageProcessor.from_pretrained(
                MODEL_ID,
                revision=getattr(model.config, '_commit_hash', None) or MODEL_REVISION,
                local_files_only=not allow_download,
            )

            # CPU inference works without a dedicated graphics card.
            # Evaluation mode disables training-specific behavior.
            model = model.to("cpu").eval()

            # Publish the cached objects only after loading succeeds.
            _processor = processor
            _model = model

    return _processor, _model


def create_image_embedding(image: Image.Image) -> ImageEmbedding:
    """Encode a decoded PIL image; this function does not save it.

    Pass an individual garment photo or a crop from the clothing detector.
    Invalid images and unavailable model downloads raise exceptions so the
    calling service can handle them without returning fabricated embeddings.
    """
    width, height = image.size
    if width < 1 or height < 1:
        raise ValueError("The image must have a non-zero width and height.")

    if width * height > MAX_IMAGE_PIXELS:
        raise ValueError("The image exceeds the 20-megapixel limit.")

    # Apply phone-camera orientation before standardizing the color mode.
    # CLIP's processor handles resizing and pixel normalization.
    rgb_image = ImageOps.exif_transpose(image).convert("RGB")

    processor, model = _load_model()
    inputs = processor(images=rgb_image, return_tensors="pt")

    # No gradients are needed: we use pretrained weights without training.
    with torch.inference_mode():
        features = model(**inputs).image_embeds[0].float()

        # Reject invalid outputs rather than storing unusable vectors.
        norm = torch.linalg.vector_norm(features)
        if not torch.isfinite(features).all() or not torch.isfinite(norm) or norm.item() <= 0:
            raise RuntimeError("The model returned an invalid embedding.")

        # Unit-length vectors make later cosine-similarity comparisons simple.
        vector = (features / norm).cpu().tolist()

    return ImageEmbedding(
        vector=vector,
        model_id=MODEL_ID,
        model_revision=getattr(model.config, "_commit_hash", None) or "unknown",
        pipeline_version=PIPELINE_VERSION,
    )
