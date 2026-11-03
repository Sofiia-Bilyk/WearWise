# How WearWise works

## From photo to confirmed outfit

The signed-in user uploads a photo through the React interface. Flask authenticates the detection request, decodes the image, and uses YOLO to propose garment regions. Color extraction estimates the dominant color of each crop.

Each crop is compared with ready image embeddings belonging to the current user's active wardrobe items. A sufficiently strong, distinct match becomes an editable selection. Uncertain crops enter a sequential identification flow: the user chooses an existing wardrobe item or describes a new one. The complete draft is reviewed before saving.

## Image embeddings

`wearwise_app/services/image_embeddings.py` uses `openai/clip-vit-base-patch32` to produce normalized, 512-dimensional image vectors. Images undergo orientation correction and RGB conversion. Embedding metadata identifies the model revision and preprocessing pipeline so incompatible vectors are not compared.

The `ItemEmbedding` record stores the vector, model identity and revision, pipeline version, image fingerprint, source image path, processing status, and update time. Saving a new or changed photo refreshes its embedding when model weights are cached. Old vectors are cleared before processing a replacement photo. Invalid images or unavailable weights produce a status rather than preventing the item from saving. Item API responses expose status, not vectors.

Embedding input is restricted to validated local uploads. Remote image URLs are not fetched, and photos are not sent to a hosted inference API.

## Candidate ranking

Matching compares compatible vectors using cosine similarity. Only the signed-in user's active items with ready embeddings and a current source image path are considered. The response includes up to three candidates meeting `MATCH_MIN_SIMILARITY` (default `0.80`).

Automatic selection also requires the best candidate to lead the next compatible candidate by `MATCH_MIN_MARGIN` (default `0.05`). A near tie blocks automatic selection even if the second candidate falls just below the similarity threshold. These defaults are provisional; scores are not probabilities or measured recognition accuracy. YOLO confidence is not used as garment identity confidence.

## Preparing and refreshing embeddings

Apply migrations and explicitly prepare the local model cache:

```powershell
python -m flask --app wearwise_app.app db upgrade
python -m flask --app wearwise_app.app embeddings backfill --download-model
```

Ordinary web requests use cached model files only. Backfill commits each item's state separately, so it can resume after interruption. Unchanged ready vectors are skipped. To scope or regenerate a backfill:

```powershell
python -m flask --app wearwise_app.app embeddings backfill --user-id 1 --force
```

Use `--force` after changing model weights or preprocessing. `EMBEDDING_MODEL_REVISION` can pin a model revision. Missing or invalid local photos are recorded without fabricated vectors; archived items are excluded. The command exits with an error when model availability prevents embeddings from being generated.

## Draft confirmation and saving

The frontend keeps the draft in memory. Each unresolved crop is handled in sequence; canceling a selection returns to that crop, and identification can be paused and resumed while the draft remains open. Final confirmation requires every remaining crop to be resolved.

The camera sends the full confirmed draft and optional photo to `POST /outfit-submissions`. Existing IDs are reused and deduplicated. New items, embeddings/status, outfit, links, and a durable submission receipt share one database commit. Validation rejects unavailable, archived, or foreign items rather than silently omitting them.

Each submission has a UUID unique within the account and a fingerprint of its JSON and original photo bytes. Retries with the same content return the stored response; changed content using the same key returns HTTP 409. A database unique constraint arbitrates competing requests. Transient database failures return a retryable error without relaxing uniqueness.

New photos are bounded, decoded, stripped of metadata, and converted to JPEG in an attempt-owned staging area. They are published before the database commit; handled failures remove attempt-owned files. An uncertain commit acknowledgement is checked against the durable receipt before cleanup. If the database cannot confirm the outcome, files are retained. A process crash can still leave orphan files: filesystem operations and SQLite do not share a transaction, and automatic orphan cleanup is not implemented.

The browser retains the exact pending request in memory and an account-scoped submission ID in session storage. Editing is locked while the outcome is uncertain. Retrying uses the same snapshot and ID. **Check save status**, also used after a refresh, calls `POST /outfit-submissions/<id>/resolve`: it either returns the saved response or commits a cancellation receipt. This cancellation prevents a delayed original request from saving after the UI starts another attempt. Only the receipt survives refreshes, not unsaved photos or the draft. Recovery requires the same account and browser-tab storage; blocked storage prevents sending a new camera submission.

Responses are merged by ID instead of incrementing counts on replay. A background refresh obtains current statistics because a historical receipt may predate subsequent logs or edits. The wardrobe **Log Wear** shortcut uses the same submission endpoint and receipt protection, with a disabled button during saving and visible success/retry feedback. An unresolved shortcut save can also be recovered through **Log a look**. The older `/outfits` endpoint remains available for compatibility; current UI saving flows use submission receipts.

## Outfit history

`worn_date` is the selected calendar day; `logged_at` is the actual entry timestamp. The API exposes entry time as `loggedAt`, with an explicit UTC offset for existing naive UTC timestamps. This serialization does not change stored records.

History groups logs by wear date, then sorts entries by their actual entry time, newest first. The browser formats entry times locally and includes the entry date for backdated logs. Missing or invalid timestamps appear last with “Time unavailable.” Expanding history preserves complete day groups.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/pages/CameraView.tsx` | Photo-to-outfit draft workflow |
| `src/hooks/useGarmentResolution.ts` | Sequential identification state |
| `src/state/garmentResolution.ts` | Draft validation and save planning |
| `src/components/UnrecognizedGarmentModal.tsx` | Unidentified garment popup |
| `src/utils/outfitHistory.ts` | History grouping and local-time formatting |
| `src/api/` | Typed requests and response adapters |
| `wearwise_app/models.py` | Users, items, embeddings, outfits, and relationships |
| `wearwise_app/services/image_embeddings.py` | CLIP inference and model metadata |
| `wearwise_app/services/embedding_store.py` | Validated photo loading and embedding persistence |
| `wearwise_app/services/garment_matching.py` | Compatible-vector comparison and ranking |
| `wearwise_app/services/detection_matching.py` | Owner-scoped detection matching |
| `wearwise_app/embedding_commands.py` | Explicit embedding backfill command |
| `wearwise_app/services/outfit_submission.py` | Atomic saves, validated staged photos, retry receipts, and cancellation |
| `src/state/outfitSubmission.ts` | Submission snapshots, receipt storage, and replay-safe merging |
| `migrations/` | Database migrations |
| `scripts/` | Demo seeding and real-photo replacement |
| `tests/` | Backend and frontend logic tests |

The retained [database diagram](schema.png) predates image embeddings. Current models and migrations are authoritative.

## Remaining limitations

The detector attempts to load fashion weights and falls back to a general COCO YOLO model if needed. In fallback mode, a person's bounding box is split into approximate top and bottom regions; its confidence describes person detection rather than garment identity.

Crops and dominant colors can include background or skin pixels. The repository does not establish a recognition benchmark or provide a model training pipeline. Local filesystem storage is implemented; S3 storage remains a stub. Public deployment requires protected photo access and production session configuration, alongside improvements to save reliability.


## Outfit assistant

The Log a look banner and fourth Insights summary card share an account-scoped
React provider and one native dialog. Explicit generation calls the authenticated
assistant endpoint. It obtains city-local hourly weather, selected primary-calendar
events with confirmed dress codes, and active own-wardrobe forgotten flags. The
Anthropic response is schema-checked and item IDs are validated again after
inference. Suggestions do not write outfits. Google OAuth tokens are encrypted
separately from the Flask session. See [assistant setup, behavior, and limitations](OUTFIT_ASSISTANT.md).
