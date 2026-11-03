# Testing WearWise

Run these commands from the repository root after installing dependencies and activating the virtual environment described in the main README.

## Backend tests

```powershell
python -m pytest tests/ -v
```

Tests cover authentication, ownership checks, item and outfit routes, models, serialization, image embeddings, candidate matching, embedding storage and backfill, and demo-photo replacement. Mocked inference and synthetic vectors make logic checks reproducible without downloading a model; they do not establish real-world recognition accuracy.

Focused checks for the recent changes:

```powershell
python -m pytest tests/test_image_embeddings.py tests/test_embedding_integration.py tests/test_garment_matching.py tests/test_serializers.py tests/test_demo_photo_replacement.py -v
```

Optional coverage reporting:

```powershell
python -m pip install pytest-cov
python -m pytest tests/ --cov=wearwise_app --cov-report=html
```

## Frontend checks

```powershell
npm ci
npm run lint
npm run test:frontend
npm run build:frontend
```

The `lint` script runs TypeScript checking. Frontend logic tests cover draft resolution, save planning, history grouping, and timestamp formatting. They use Node's built-in test runner and its TypeScript stripping support; use Node.js 24 to reproduce the local setup. A persistent automated browser test suite is not configured.

## Manual workflow checks

### Prepare the wardrobe

Add an item with a clear local photo, then prepare real embeddings:

```powershell
python -m flask --app wearwise_app.app embeddings backfill --download-model
```

Confirm the item has a ready embedding before testing automatic matching.

### Check matching and corrections

Upload a recognizable photo of an existing item. Confirm a successful match reuses its wardrobe ID. Try similar garments and unfamiliar clothing: uncertain results should allow manual identification. Change an automatic selection before saving and verify the correction is retained. Repeat-wear logging should not create another copy of an existing item.

### Check sequential identification

Upload a photo containing multiple unidentified crops. Confirm only one identification popup appears at a time. Test both choosing an existing item and entering a new item's details. Canceling a subview should return to the same crop; resolving it should advance to the next. Pause and resume identification while the draft is open. Final submission should remain disabled until every remaining crop is resolved.

### Check final confirmation

Before confirming, verify that a proposed new item has not yet been created in the wardrobe. Confirm the complete outfit, refresh, and verify persistence. Check that existing items were reused and repeated selections produced only one link per item in the outfit. Interrupt a save and retry the same attempt: it should reuse the saved result, with no duplicate items, outfits, or wear-count increments. While the outcome is uncertain, editing should be disabled. Use **Check save status** to recover success or cancel the attempt before editing. Refresh with a pending receipt and verify recovery runs before another camera log can begin.

Focused transactional-save checks:

```powershell
python -m pytest tests/test_outfit_submissions.py -v
```

These cover mixed-item saves, ownership/archival validation, rollback, staged-file cleanup, lost commit acknowledgements, duplicate requests, conflicts, account-scoped receipts, cancellation of late requests, and parallel requests against a temporary file-backed SQLite database. Frontend submission tests cover snapshotting, receipt isolation, and replay-safe merging. Browser interaction checks remain manual.

### Check history

Create several logs for the same wear date. Verify one day group contains all of them, ordered by entry time, newest first. Check entry times against the browser's local time zone and open outfit details. Backdate a log and verify its actual entry date remains visible. Expand history and confirm day groups are not split. Records without usable timestamps should display “Time unavailable.”

### Check insights and demo data

Verify the Most Worn Item gallery, category split, wardrobe utilization, forgotten-item reminders, and single-photo versus multi-photo outfit thumbnails. If using seeded records, remember that the usage history is synthetic and the clothing photos are illustrative demo assets.

## Verify real CLIP inference

A successful mocked test is not proof that real model inference works. Prepare the actual weights with the backfill command and verify inference produces 512 finite values, a vector norm approximately equal to one, and the expected model revision and preprocessing metadata. Repeat inference on the same image to check consistency.

Test different photos of the same garment as well as visually similar but different garments, varied lighting, partial views, and unknown items. A photo matching itself is only a smoke check. Measure false matches, manual correction rates, and latency on a representative labeled set before making recognition accuracy claims or treating the provisional thresholds as production settings.

Record actual command output and observed behavior when reporting results. This document does not guarantee a particular test count, coverage percentage, or passing result.


## Saving race and multipart regressions

```powershell
npm run test:components
python -m pytest tests/test_outfit_submissions.py -v
```

Component tests use a virtual DOM to check account boundaries, stale refreshes,
actual camera unmount/recovery flows, and receipt cleanup that preserves newer
attempts. Native dialog/camera APIs are stubbed; these are not visual browser tests.
Backend regressions use real multipart image data above 500 KB and verify that
the bounded 32 MiB request/form-field and 10 MiB individual-photo limits remain
enforced. Nginx accepts the same 32 MiB total limit as the submission endpoint.
