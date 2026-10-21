"""
FortiConnect — Notification Views

All notification views are scoped strictly to the requesting employee.
No notification from another employee is ever returned.
"""
import structlog
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.employees.models import Employee
from .models import Notification
from .serializers import NotificationSerializer

logger = structlog.get_logger(__name__)


def _get_employee(user):
    try:
        return user.employee
    except Employee.DoesNotExist:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("No employee profile.")


class NotificationListView(APIView):
    """
    GET  /api/notifications/          — list notifications (paginated)
    POST /api/notifications/read-all/ — mark all as read
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = _get_employee(request.user)
        qs = Notification.objects.filter(recipient=employee).order_by("-created_at")

        # Filter unread only
        if request.query_params.get("unread_only", "").lower() == "true":
            qs = qs.filter(is_read=False)

        # Cursor pagination
        before_id = request.query_params.get("before_id")
        if before_id:
            try:
                qs = qs.filter(pk__lt=int(before_id))
            except ValueError:
                return Response({"detail": "Invalid before_id."}, status=400)

        limit = min(int(request.query_params.get("limit", 50)), 100)
        notifications = list(qs[:limit])

        unread_count = Notification.objects.filter(recipient=employee, is_read=False).count()

        return Response({
            "results": NotificationSerializer(notifications, many=True).data,
            "unread_count": unread_count,
        })


class NotificationMarkReadView(APIView):
    """
    POST /api/notifications/{id}/read/ — mark a single notification as read
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        employee = _get_employee(request.user)
        notification = get_object_or_404(Notification, pk=pk, recipient=employee)
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=["is_read", "read_at"])
        return Response(NotificationSerializer(notification).data)


class NotificationMarkAllReadView(APIView):
    """
    POST /api/notifications/read-all/ — mark all notifications as read
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        employee = _get_employee(request.user)
        count = Notification.objects.filter(recipient=employee, is_read=False).update(
            is_read=True, read_at=timezone.now()
        )
        return Response({"marked_read": count})


class NotificationUnreadCountView(APIView):
    """
    GET /api/notifications/unread-count/ — fast unread badge count
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = _get_employee(request.user)
        count = Notification.objects.filter(recipient=employee, is_read=False).count()
        return Response({"unread_count": count})

