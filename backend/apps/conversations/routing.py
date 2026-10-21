"""
FortiConnect — WebSocket URL Routing

WebSocket URLs are separate from Django HTTP URL routing.
The JWTAuthMiddleware wraps the entire routing stack.
"""
from django.urls import re_path
from apps.identity.ws_auth import JWTAuthMiddleware
from .consumers import ChatConsumer

websocket_urlpatterns = [
    re_path(r"^ws/chat/$", JWTAuthMiddleware(ChatConsumer.as_asgi())),
]

