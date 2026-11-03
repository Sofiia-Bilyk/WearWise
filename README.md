# WearWise

WearWise helps you track what you wear, rediscover your wardrobe, and understand your clothing habits. Upload an outfit photo, identify any unfamiliar garments, and confirm your outfit before saving it.

## What you can do

- Capture an outfit with your camera or upload a photo.
- Match detected clothing to existing wardrobe items using image similarity.
- Identify uncertain garments through one popup at a time: choose an existing item or mark it as new.
- Review, change, or remove suggestions before confirming the whole outfit.
- Add items manually and manage photos, names, categories, colors, brands, and costs.
- Browse outfit history grouped by the day worn, with separate entry times within each day.
- Explore a Most Worn Item gallery, wardrobe utilization, and category breakdowns.
- Rediscover clothing not worn for more than 30 days and postpone reminders.
- Open shared AI outfit suggestions from Log a look or the fourth Insights card, using weather, selected Google Calendar events, and forgotten items.
- Keep wardrobe records associated with your signed-in account.

## How to log an outfit

1. Register or sign in.
2. Take or upload a photo, or choose wardrobe items manually.
3. Review the automatically matched items.
4. For each unidentified crop, choose an existing wardrobe item or enter details for a new one. Multiple crops appear in sequence.
5. Review the completed draft and select the day the outfit was worn.
6. Confirm the whole log to save it.

New items, their outfit links, and the outfit are saved together when you confirm the final draft. A failed transaction saves none of those records. Repeating the same submission reuses its result instead of creating duplicates.

If a connection fails, the draft stays locked while you retry the same save or select **Check save status**. That check either recovers the saved log or cancels the attempt before you edit and submit again. A small account-scoped receipt survives refreshes in the same browser tab; photos and draft details are not stored in that receipt. After refresh, WearWise checks the receipt before allowing another camera log. An unsaved draft itself does not survive refreshes.

## Understanding your history

Outfits are grouped by their selected wear date. Multiple logs on the same day appear together, ordered by when they were entered, newest first. Entry times use your browser's local time zone. Backdated logs show the actual entry date as well as the time; older records without a usable timestamp show “Time unavailable.” Expanding history reveals complete day groups.

## Recognition limits

Similar garments, lighting, busy backgrounds, and partial views can cause incorrect matches. Uncertain crops remain available for manual identification, and automatic selections can be changed before confirmation. Similarity scores are not probabilities. The current matching thresholds are provisional and have not been calibrated against a recognition benchmark. If matching is unavailable, you can continue identifying garments manually.

## Local development on Windows

The local setup has been exercised with Node.js 24 and Python 3.12. Use those versions to reproduce it; Python 3.11+ is recommended.

From the repository root:

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

For first-time setup only, copy the example configuration. Keep your existing `.env` if already configured:

```powershell
Copy-Item .env.example .env
```

Set `VITE_PROXY_TARGET=http://127.0.0.1:5001` in `.env` to match the backend address below.

```powershell
python -m flask --app wearwise_app.app db upgrade
python -m flask --app wearwise_app.app run --host 127.0.0.1 --port 5001
```

In another terminal:

```powershell
npm run dev
```

Open [WearWise locally](http://localhost:3000). Vite proxies API and uploaded-photo requests to Flask.

## Prepare wardrobe matching

Activate the virtual environment and prepare embeddings for existing local photos:

```powershell
python -m flask --app wearwise_app.app embeddings backfill --download-model
```

This explicitly downloads the CLIP model into the local cache. Web requests use cached weights and do not initiate model downloads. The initial download is large. Subsequent backfills can omit `--download-model`; unchanged ready embeddings are skipped.

## Run with Docker

```powershell
docker compose up --build
```

Open [WearWise in Docker](http://localhost). Prepare matching inside the backend container:

```powershell
docker compose exec backend python -m flask --app wearwise_app.app embeddings backfill --download-model
```

Containers have their own model cache, which may need preparing again after recreation. The Compose configuration is intended for local development. A public deployment needs production secrets, session settings, HTTPS, and private-photo access controls.

## Demo wardrobe and history

The optional scripts target the existing local account configured by `EMAIL` in `scripts/seed_demo_data.py`. That account must already exist. The scripts are designed for the project's local SQLite database.

```powershell
python scripts/seed_demo_data.py
python scripts/replace_demo_photos.py
```

The seed creates 16 clearly labeled demo items across five categories and 24 outfit logs for October 2026. It includes varied wear counts, unworn items, and a postponed reminder. The replacement script adds real clothing photos from Pexels and generates embeddings when the model is available.

Seeding can be rerun without duplicating the marked demo records. Photo replacement preserves item IDs and outfit links. Both scripts create database backups before changing records and leave non-demo records intact. Photo sources and licensing links are listed in [demo-photo-sources.json](docs/demo-photo-sources.json).

Downloaded photos live in the ignored uploads directory. A fresh checkout needs the replacement script to obtain them again. Demo usage history is synthetic; it is not customer data or evidence of recognition accuracy.

## AI outfit assistance

See [setup and data sharing](docs/OUTFIT_ASSISTANT.md) for Anthropic API credentials,
Google Calendar OAuth, token encryption, weather, and the three recommendation
signals. Credentials belong in the root `.env`, never frontend source. Opening a
suggestion does not create a wear log or start a new paid model request.

## Technology

- React, TypeScript, Vite, and Recharts for the interface.
- Python, Flask, SQLAlchemy, SQLite, and Alembic migrations for the backend.
- YOLO for garment regions, OpenCV and K-Means for color extraction, and CLIP for image similarity.

See [how WearWise works](docs/README.md) and [testing guidance](TESTING.md).

## Project origin

WearWise is Sofiia Bilyk's personal continuation of [ReWear](https://github.com/Sofiia-Bilyk/ReWear). The inherited implementation and original contributors are acknowledged in [ATTRIBUTION.md](ATTRIBUTION.md).
