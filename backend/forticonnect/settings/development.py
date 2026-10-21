"""
FortiConnect — Development Settings
Loads .env from backend/.env
"""
from pathlib import Path

import environ

env = environ.Env()

# Load .env file
_env_file = Path(__file__).resolve().parent.parent.parent / ".env"
if _env_file.exists():
    environ.Env.read_env(str(_env_file))

from .base import *  # noqa: F401, F403, E402

DEBUG = True

# Check if PostgreSQL connection works, otherwise seamlessly fall back to SQLite
def _get_database_config():
    db_url = env("DATABASE_URL", default="")
    if not db_url or db_url.startswith("sqlite"):
        return {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": BASE_DIR / "db.sqlite3",
            }
        }
    try:
        import psycopg
        # Parse connection string test with a 1-second timeout
        conn = psycopg.connect(db_url, connect_timeout=1)
        conn.close()
        return {
            "default": env.db("DATABASE_URL")
        }
    except Exception as e:
        print(f"\n[!] Notice: PostgreSQL connection to '{db_url.split('@')[-1] if '@' in db_url else 'db'}' was not available ({e}).")
        print("[!] Defaulting to local SQLite database (backend/db.sqlite3) for development.\n")
        return {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": BASE_DIR / "db.sqlite3",
            }
        }

DATABASES = _get_database_config()

# Fallback to in-memory channel layer if Redis is not running locally
try:
    import redis as redis_lib
    r = redis_lib.from_url(env("REDIS_URL", default="redis://localhost:6379/0"), socket_timeout=1)
    r.ping()
except Exception:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }

# Development: allow localhost
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0"]

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Development: allow WebSocket connections from Vite dev server
CORS_ORIGIN_WHITELIST = CORS_ALLOWED_ORIGINS

# Email backend (console in dev)
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# More verbose logging in development
import logging
logging.getLogger("django.db.backends").setLevel(logging.DEBUG)

