"""
FortiConnect — Test Settings
Uses a separate test database. Does not require Redis (uses in-memory channel layer).
"""
from pathlib import Path

import environ

env = environ.Env()

_env_file = Path(__file__).resolve().parent.parent.parent / ".env.test"
if _env_file.exists():
    environ.Env.read_env(str(_env_file))

# Fall back to .env if .env.test absent
_env_file_dev = Path(__file__).resolve().parent.parent.parent / ".env"
if _env_file_dev.exists():
    environ.Env.read_env(str(_env_file_dev))

from .base import *  # noqa: F401, F403, E402

DEBUG = True
ALLOWED_HOSTS = ["*"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Override channel layer to use in-memory for tests (no Redis needed)
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}

# Override cache to dummy for tests
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.dummy.DummyCache",
    }
}

# Speed up password hashing in tests
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

CORS_ALLOWED_ORIGINS = ["http://localhost:5173"]

