"""
FortiConnect — Employee Serializers

Exposed fields deliberately exclude passwords, internal secrets,
HR system credentials, and unnecessary personal data.
"""
from rest_framework import serializers
from .models import Employee


class EmployeeListSerializer(serializers.ModelSerializer):
    """Minimal representation for directory listing and conversation participant display."""

    class Meta:
        model = Employee
        fields = [
            "id",
            "employee_id",
            "display_name",
            "department",
            "title",
            "employment_status",
            "is_active",
        ]
        read_only_fields = fields


class EmployeeDetailSerializer(serializers.ModelSerializer):
    """Full profile for viewing a single employee. Still excludes sensitive HR data."""

    class Meta:
        model = Employee
        fields = [
            "id",
            "employee_id",
            "display_name",
            "email",
            "department",
            "title",
            "phone",
            "location",
            "bio",
            "employment_status",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

