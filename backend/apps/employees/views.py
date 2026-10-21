"""
FortiConnect — Employee Directory Views

All endpoints require authentication. Employee profiles are read-only
from the API perspective — changes come via HR sync.

Authorization: any authenticated active employee can browse the directory.
Inactive/terminated employees are visible in the directory but
their detailed contact info is limited.
"""
import structlog
from django.db.models import Q
from rest_framework import filters, generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Employee
from .serializers import EmployeeDetailSerializer, EmployeeListSerializer

logger = structlog.get_logger(__name__)


class EmployeeListView(generics.ListAPIView):
    """
    GET /api/employees/
    Lists all employees (active and inactive shown; deactivated accounts
    are surfaced so users know the account exists but is unavailable).
    Supports ?search= query parameter.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = EmployeeListSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["display_name", "employee_id", "department", "email"]
    ordering_fields = ["display_name", "department", "created_at"]
    ordering = ["display_name"]

    def get_queryset(self):
        qs = Employee.objects.all()
        # Optional ?active_only=true filter
        if self.request.query_params.get("active_only", "").lower() == "true":
            qs = qs.filter(is_active=True)
        return qs


class EmployeeDetailView(generics.RetrieveAPIView):
    """
    GET /api/employees/{id}/
    Returns full profile of an employee by database id.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = EmployeeDetailSerializer
    queryset = Employee.objects.all()


class EmployeeMeView(APIView):
    """
    GET /api/employees/me/
    Returns the authenticated user's own employee profile.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            employee = request.user.employee
        except Employee.DoesNotExist:
            return Response(
                {"detail": "No employee profile is associated with your account."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = EmployeeDetailSerializer(employee, context={"request": request})
        return Response(serializer.data)

