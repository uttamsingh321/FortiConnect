"""
FortiConnect ASGI config — serves HTTP and WebSocket via Django Channels.
"""
import os

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "forticonnect.settings.development")

# Initialize Django ASGI application early to populate the app registry
django_asgi_app = get_asgi_application()

from apps.identity.ws_auth import JWTAuthMiddleware
from apps.conversations.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(
            JWTAuthMiddleware(
                URLRouter(websocket_urlpatterns)
            )
        ),
    }
)

