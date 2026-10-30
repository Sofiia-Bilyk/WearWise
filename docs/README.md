# Architecture

## Request flow

The React interface calls typed API modules through a shared fetch client. API adapters translate backend responses into frontend types. Flask blueprints authenticate requests and delegate creation workflows to services. SQLAlchemy persists users, wardrobe items, outfits, and their relationships.

Photo detection follows a separate request flow: the browser submits a base64 image, the backend decodes it, YOLO proposes bounding boxes, and K-Means estimates the dominant color of each crop. Users review the proposals before saving items and an outfit.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/pages/` | Camera, wardrobe, insights, and authentication screens |
| `src/components/` | Forms, item cards, detection controls, and charts |
| `src/hooks/` | Camera capture, uploads, detection state, and derived insights |
| `src/contexts/` | Authentication and wardrobe state |
| `src/api/` | Fetch client, endpoint modules, and response adapters |
| `wearwise_app/routes/` | Authentication, item, outfit, detection, and upload endpoints |
| `wearwise_app/services/` | Validation, creation workflows, and storage abstractions |
| `wearwise_app/models.py` | SQLAlchemy entities, constraints, and indexes |
| `wearwise_app/detector.py` | Model loading, garment suggestions, and color extraction |
| `migrations/` | Database schema migrations |
| `tests/` | Backend tests and fixtures |

The original database diagram is retained in [schema.png](schema.png); the current models and migrations are authoritative.

## Data model

Users own wardrobe items and outfits. OutfitItem links items to outfits through a many-to-many relationship. Items include optional cost, image, AI prediction, archival, and postponement fields. Wear statistics are derived from outfit history.

## Model behavior and limitations

The detector attempts to load pretrained fashion weights from Hugging Face. If loading fails, it falls back to a general COCO YOLO model. In fallback mode, a person's bounding box is split into approximate top and bottom regions; the confidence is the person detection confidence, not a calibrated garment classification score.

Color extraction uses image crops and can include background or skin pixels. Results require user review. This repository does not establish a reproducible accuracy benchmark or provide a model training pipeline.

Detection does not automatically match a suggested garment to an existing wardrobe entry. Users can select existing items manually. S3 storage is a stub; local filesystem storage is implemented.

## Deployment and improvement areas

Docker Compose runs Nginx and a Gunicorn-backed Flask application. SQLite and uploaded images use persistent volumes. The Compose configuration is intended for local development.

Before a public deployment, address private photo access, production secrets and session configuration, request validation and limits, and reliable retry behavior for outfit logging. The current frontend creates new items before saving the outfit through separate requests, so partial failures can leave saved items without an outfit.
