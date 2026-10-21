"""
FortiConnect Identity — Custom Exception Handler

Returns safe, consistent error shapes without leaking stack traces.
"""
import structlog
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = structlog.get_logger(__name__)


def custom_exception_handler(exc, context):
    """
    Wraps the default DRF exception handler to:
    - Log unexpected errors
    - Suppress internal details in responses
    """
    response = exception_handler(exc, context)

    if response is None:
        # Unhandled exception — log and return generic 500
        logger.exception(
            "unhandled_exception",
            exc_type=type(exc).__name__,
            view=str(context.get("view")),
        )
        return Response(
            {"detail": "An unexpected error occurred. Please try again later."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return response

