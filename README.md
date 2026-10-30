# WearWise

A wardrobe tracking application that helps you log outfits, understand wear patterns, and rediscover clothing you already own.

## Main features

- Capture an outfit with your camera or upload a photo.
- Review and correct AI-suggested clothing categories and colors before saving.
- Add items manually or choose existing items from your wardrobe.
- Manage wardrobe items, including photos, names, categories, colors, brands, and costs.
- Log outfits by date and browse outfit history.
- Explore wardrobe utilization, wear counts, category breakdowns, and logging activity.
- Rediscover items not worn for more than 30 days, with an option to postpone reminders.
- Keep wardrobe records associated with your account through session-based authentication.

## How it works

1. Register or sign in.
2. Capture or upload an outfit photo, or select items manually.
3. Review detected items and correct or remove suggestions as needed.
4. Save the outfit and explore wear insights as your history grows.

Detection suggests garment categories and colors; it does not automatically identify a garment as an existing wardrobe item. Choose existing wardrobe items manually when logging repeat wears.

## Technology and architecture

- **Frontend:** React, TypeScript, Vite, and Recharts.
- **Backend:** Python, Flask, and SQLAlchemy.
- **Data:** SQLite by default, with Alembic migrations through Flask-Migrate.
- **Computer vision:** pretrained YOLO weights, OpenCV, and K-Means color extraction.
- **Local deployment:** Docker Compose, Nginx, and Gunicorn, with persistent database and upload volumes.

See [architecture and limitations](docs/README.md) for the request flow and source layout.

## Quick start with Docker

From the repository root:

```powershell
docker compose up --build
```

Open http://localhost. The first build installs computer vision dependencies and downloads fallback model weights. The fashion model is downloaded on its first use if available.

This configuration is for local development. Configure a private secret, HTTPS, secure cookies, trusted origins, and photo access controls before exposing a deployment publicly.

## Local development on Windows

Install Node.js 22+ and Python 3.11+, then run from the repository root:

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m flask --app wearwise_app.app db upgrade
python -m wearwise_app.app
```

In another terminal:

```powershell
npm run dev
```

Open http://localhost:3000. The backend runs on port 5001; Vite proxies `/api/` and `/uploads/` to it. Customize configuration in `.env`.

## Verification

See [TESTING.md](TESTING.md) for backend tests, TypeScript checking, and frontend build commands. Test results and performance measurements should be recorded from actual runs.

## Project origin

WearWise is Sofiia Bilyk's personal continuation of [ReWear](https://github.com/Sofiia-Bilyk/ReWear). The inherited implementation and original contributors are acknowledged in [ATTRIBUTION.md](ATTRIBUTION.md). New features and improvements will be documented as they are implemented.
