"""
FortiConnect Identity — Views

Login, logout, and health check endpoints.
Rate limiting applied to login to prevent brute force attacks.
"""
import structlog
from django.conf import settings
from django.db import connection
from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from django_ratelimit.decorators import ratelimit
from django_ratelimit.exceptions import Ratelimited
from django.utils.decorators import method_decorator

from .serializers import FortiConnectTokenObtainPairSerializer

logger = structlog.get_logger(__name__)


@method_decorator(
    ratelimit(key="ip", rate="10/m", method="POST", block=True),
    name="dispatch",
)
class FortiConnectTokenObtainPairView(TokenObtainPairView):
    """
    POST /api/auth/login/
    Rate limited: 10 attempts per IP per minute.
    """
    permission_classes = [AllowAny]
    serializer_class = FortiConnectTokenObtainPairSerializer

    def handle_exception(self, exc):
        if isinstance(exc, Ratelimited):
            return Response(
                {"detail": "Too many login attempts. Please wait before trying again."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        return super().handle_exception(exc)


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Blacklists the provided refresh token (client-side token removal is still required).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            # Token already invalid or not found — still return 204
            pass

        logger.info("logout", user_id=request.user.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class HealthCheckView(APIView):
    """
    GET /api/health/
    Returns system health status. Public endpoint.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        checks = {}

        # Database
        try:
            connection.ensure_connection()
            checks["database"] = "ok"
        except Exception as e:
            checks["database"] = f"error: {type(e).__name__}"

        # Redis / Cache
        try:
            cache.set("health_check", "ok", timeout=5)
            val = cache.get("health_check")
            checks["cache"] = "ok" if val == "ok" else "error: unexpected value"
        except Exception as e:
            checks["cache"] = f"error: {type(e).__name__}"

        all_ok = all(v == "ok" for v in checks.values())
        status_code = status.HTTP_200_OK if all_ok else status.HTTP_503_SERVICE_UNAVAILABLE

        return Response({"status": "ok" if all_ok else "degraded", "checks": checks}, status=status_code)
