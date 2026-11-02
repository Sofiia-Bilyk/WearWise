import logging
import math
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from flask import Flask
from flask_cors import CORS
from flask_migrate import Migrate
from .models import db
from .routes import auth_bp, items_bp, outfits_bp, detection_bp, uploads_bp

logger = logging.getLogger(__name__)

def create_app(test_config=None):
    app = Flask(__name__)

    # ── Configuration ─────────────────────────────────────────────────────────────
    if test_config is None:
        _secret_key = os.environ.get('SECRET_KEY')
        if not _secret_key:
            _secret_key = 'dev-secret-key-change-in-production'
            logger.warning(
                'SECRET_KEY env var not set — using insecure default. '
                'Set SECRET_KEY in your environment before deploying.'
            )
        app.config['SECRET_KEY'] = _secret_key
        
        # Database Configuration
        _default_db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'database.db')
        _env_db_uri = os.environ.get('SQLALCHEMY_DATABASE_URI')

        if not _env_db_uri:
            os.makedirs(os.path.dirname(_default_db_path), exist_ok=True)
            _env_db_uri = f'sqlite:///{_default_db_path}'

        app.config['SQLALCHEMY_DATABASE_URI'] = _env_db_uri
        app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    else:
        # load the test config if passed in
        app.config.from_mapping(test_config)

    _production = os.environ.get('PRODUCTION', '').lower() in ('1', 'true', 'yes')
    app.config['SESSION_COOKIE_SAMESITE'] = 'None' if _production else 'Lax'
    app.config['SESSION_COOKIE_SECURE'] = _production
    app.config['SESSION_COOKIE_HTTPONLY'] = True

    # Binary Asset Storage (Attached Resource)
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER')
    if not UPLOAD_FOLDER:
        UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')

    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

    # Matching settings are overridable in tests and deployment configuration.
    app.config.setdefault('MATCH_MIN_SIMILARITY', float(os.environ.get('MATCH_MIN_SIMILARITY', '0.80')))
    app.config.setdefault('MATCH_MIN_MARGIN', float(os.environ.get('MATCH_MIN_MARGIN', '0.05')))
    threshold = app.config['MATCH_MIN_SIMILARITY']
    margin = app.config['MATCH_MIN_MARGIN']
    if not math.isfinite(threshold) or not -1 <= threshold <= 1:
        raise ValueError('MATCH_MIN_SIMILARITY must be between -1 and 1.')
    if not math.isfinite(margin) or not 0 <= margin <= 2:
        raise ValueError('MATCH_MIN_MARGIN must be between 0 and 2.')

    # ── Extensions ────────────────────────────────────────────────────────────────
    db.init_app(app)
    Migrate(app, db, render_as_batch=True)

    # CORS Configuration
    # In production, set CORS_ORIGINS to a comma-separated list of trusted domains
    # e.g. CORS_ORIGINS=https://wearwise.app,https://www.wearwise.app
    _cors_origins = os.environ.get('CORS_ORIGINS')
    if _cors_origins:
        _cors_origins = [o.strip() for o in _cors_origins.split(',') if o.strip()]
        if not _cors_origins:
            _cors_origins = None

    if not _cors_origins:
        if _production:
            raise RuntimeError(
                "CORS_ORIGINS must be explicitly set in production. "
                "Example: CORS_ORIGINS=https://wearwise.app,https://www.wearwise.app"
            )
        logger.warning(
            'CORS_ORIGINS not set — defaulting to http://localhost:3000. '
            'Set CORS_ORIGINS before deploying to production.'
        ) # Development fallback
        _cors_origins = ["http://localhost:3000"]

    CORS(
        app,
        supports_credentials=True,
        origins=_cors_origins,
        # Explicitly whitelist the methods our API uses
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        # Explicitly whitelist headers the frontend sends
        allow_headers=["Content-Type", "Authorization"],
    )

    # ── Blueprints ────────────────────────────────────────────────────────────────
    app.register_blueprint(auth_bp)
    app.register_blueprint(items_bp)
    app.register_blueprint(outfits_bp)
    app.register_blueprint(detection_bp)
    app.register_blueprint(uploads_bp)

    from .embedding_commands import embeddings_cli
    app.cli.add_command(embeddings_cli)

    @app.route("/")
    def home():
        return "WearWise backend is running!"

    return app

app = create_app()


if __name__ == "__main__":
    _port = int(os.environ.get('BACKEND_PORT', 5001))
    _is_production = os.environ.get('PRODUCTION', '').lower() in ('1', 'true', 'yes')
    app.run(debug=not _is_production, port=_port)
