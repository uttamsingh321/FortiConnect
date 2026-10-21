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

