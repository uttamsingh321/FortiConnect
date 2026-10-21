"""
FortiConnect — Production Settings

Used by Render (and any other production host). Expects the following
environment variables to be set:

    DJANGO_SETTINGS_MODULE   forticonnect.settings.production
    SECRET_KEY               random 50+ char string
    DATABASE_URL             postgres://user:pass@host:5432/dbname
    REDIS_URL                redis://host:6379/0
    ALLOWED_HOSTS            comma separated hostnames
    CORS_ALLOWED_ORIGINS     comma separated frontend origins

There is intentionally NO silent fallback to SQLite or to the in-memory
channel layer here: a production process that quietly runs on a local
file database (or without Redis) looks healthy but loses data and breaks
multi-process WebSocket fan-out. Missing configuration fails loudly
instead.
"""
from pathlib import Path

import environ

env = environ.Env()

# NOTE: production deliberately does NOT read backend/.env — on a real host the
# environment is the single source of truth. The file is only loaded here to
# support "run production settings locally" workflows.
_env_file = Path(__file__).resolve().parent.parent.parent / ".env"
if _env_file.exists():
    environ.Env.read_env(str(_env_file))

from .base import *  # noqa: F401, F403, E402


# ---------------------------------------------------------------------------
# Required configuration
# ---------------------------------------------------------------------------

def _required(name, *, default=None):
    """Return an environment variable, raising ImproperlyConfigured if unset."""
    value = env(name, default=default)
    if value is None or (isinstance(value, str) and not value.strip()):
        from django.core.exceptions import ImproperlyConfigured

        raise ImproperlyConfigured(
            f"Environment variable {name!r} must be set for production. "
            f"See backend/forticonnect/settings/production.py for the full list."
        )
    return value


DEBUG = False

SECRET_KEY = _required("SECRET_KEY")

# ---------------------------------------------------------------------------
# Hosts / CORS
# ---------------------------------------------------------------------------

# ALLOWED_HOSTS is a comma separated string in the environment.
_allowed_hosts = env.list("ALLOWED_HOSTS", default=[])
if not _allowed_hosts:
    raise ValueError(
        "ALLOWED_HOSTS must be set in production (comma separated hostnames)."
    )
ALLOWED_HOSTS = _allowed_hosts

# CORS_ALLOWED_ORIGINS is a comma separated string in the environment.
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGIN_REGEXES = []

CSRF_TRUSTED_ORIGINS = list(CORS_ALLOWED_ORIGINS)

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

DATABASE_URL = _required("DATABASE_URL")

if DATABASE_URL.startswith("sqlite"):
    raise ValueError(
        "Refusing to start in production with a SQLite DATABASE_URL. "
        "Configure a real PostgreSQL database."
    )

DATABASES = {
    "default": env.db("DATABASE_URL"),
}

# Django's connection pool: keeps connections alive and caps concurrency so a
# free-tier PostgreSQL instance is not exhausted by idle Daphne workers.
DATABASES["default"]["CONN_MAX_AGE"] = 60
DATABASES["default"]["OPTIONS"] = {
    **DATABASES["default"].get("OPTIONS", {}),
    "connect_timeout": 10,
}

# ---------------------------------------------------------------------------
# Redis / channels / cache
# ---------------------------------------------------------------------------

REDIS_URL = _required("REDIS_URL")

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [REDIS_URL],
            "capacity": 1500,
            "expiry": 60,
        },
    },
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
    },
}

# Presence is written by the WebSocket consumer using CACHES["default"]["LOCATION"],
# so the cache location must be a redis:// URL for presence to work.

# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = int(env("SECURE_HSTS_SECONDS", default=60 * 60 * 24 * 30))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True

# ---------------------------------------------------------------------------
# Static / media
# ---------------------------------------------------------------------------

STATIC_ROOT = BASE_DIR / "staticfiles"

# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
