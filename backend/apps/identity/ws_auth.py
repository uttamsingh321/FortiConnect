"""
FortiConnect Identity — WebSocket JWT Authentication

Provides a token-based authentication middleware for Django Channels.
Tokens are passed as a query parameter: ?token=<access_token>
"""
from urllib.parse import parse_qs

import structlog
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken

logger = structlog.get_logger(__name__)


@database_sync_to_async
def get_user_from_token(token_str: str):
    """Validate JWT access token and return the associated User."""
    from django.contrib.auth import get_user_model
    User = get_user_model()

    try:
        token = AccessToken(token_str)
        user_id = token.get("user_id")
        if user_id is None:
            return AnonymousUser()
        user = User.objects.select_related("employee").get(pk=user_id, is_active=True)
        # Verify employee is active if profile exists
        try:
            if not user.employee.is_active:
                logger.warning("ws_auth_inactive_employee", user_id=user_id)
                return AnonymousUser()
        except Exception:
            pass
        return user
    except (InvalidToken, TokenError, User.DoesNotExist) as e:
        logger.debug("ws_auth_failed", reason=str(e))
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """
    WebSocket middleware that authenticates connections using a JWT
    access token supplied as ?token=<jwt> in the WebSocket URL.
    """

    async def __call__(self, scope, receive, send):
        # Extract token from query string
        query_string = scope.get("query_string", b"").decode()
        params = parse_qs(query_string)
        token_list = params.get("token", [])

        if token_list:
            scope["user"] = await get_user_from_token(token_list[0])
        else:
            scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)

