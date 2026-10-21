"""
FortiConnect Identity — Middleware

Request logging middleware that attaches a request ID and logs
each request/response without logging sensitive fields.
"""
import uuid
import structlog
import structlog.contextvars


logger = structlog.get_logger(__name__)

# Fields that must never appear in request logs
_SENSITIVE_FIELDS = frozenset({"password", "token", "refresh", "access", "authorization"})


class RequestLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        logger.info(
            "request_started",
            method=request.method,
            path=request.path,
            remote_addr=self._get_client_ip(request),
        )

        response = self.get_response(request)

        logger.info(
            "request_finished",
            method=request.method,
            path=request.path,
            status_code=response.status_code,
        )

        response["X-Request-ID"] = request_id
        return response

    @staticmethod
    def _get_client_ip(request):
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "unknown")

