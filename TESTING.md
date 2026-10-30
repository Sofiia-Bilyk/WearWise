# Verification

Run these commands from the repository root after installing dependencies as described in the main README.

## Backend

```powershell
python -m pytest tests/ -v
```

The suite covers authentication, access guards, item and outfit routes, models, serialization, and an oversized detection-request check. The detection-request test mocks inference; it is not a recognition accuracy benchmark.

Run a focused test file when investigating a specific area:

```powershell
python -m pytest tests/test_items_routes.py -v
python -m pytest tests/test_outfits_routes.py -v
python -m pytest tests/test_detector.py -v
```

Optional coverage reporting requires an additional dependency:

```powershell
python -m pip install pytest-cov
python -m pytest tests/ --cov=wearwise_app --cov-report=html
```

## Frontend

```powershell
npm ci
npm run lint
npm run build:frontend
```

The `lint` script runs TypeScript checking. It does not run a separate style linter. A frontend browser test suite is not currently configured.

## Manual smoke check

1. Register, sign in, and sign out.
2. Add, edit, and remove a wardrobe item.
3. Upload a photo, review detection suggestions, and correct a suggestion.
4. Log an outfit with an existing wardrobe item and verify it persists after refreshing.
5. Check insights and postpone a forgotten-item reminder.
6. Check the empty wardrobe, invalid image, and failed-request experiences.

Record actual command output when reporting test counts, coverage, or passing results. No specific result is guaranteed by this document.
