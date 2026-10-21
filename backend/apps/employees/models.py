"""
FortiConnect — Employee Models

Employee is the central identity object for FortiConnect.
It is decoupled from Django's auth.User so that authentication
can be swapped to a company SSO without rebuilding the profile layer.

Design decisions:
- employee_id: stable HR/XHR identifier (not the Django PK)
- is_active: deactivated employees lose messaging access
- user: optional link to Django auth user; absent until provisioned
"""
import uuid
from django.contrib.auth.models import User
from django.db import models


class EmploymentStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"
    ON_LEAVE = "on_leave", "On Leave"
    TERMINATED = "terminated", "Terminated"


class Employee(models.Model):
    """
    Represents a company employee.

    The `employee_id` field holds the stable identifier from the HR/XHR system.
    The `user` field links to a Django auth user (optional, provisioned on first login).
    """

    # Stable HR identifier — distinct from Django PK
    employee_id = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="Stable identifier from the HR/XHR system.",
    )

    # Link to Django authentication user
    user = models.OneToOneField(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee",
        help_text="Linked Django auth user account.",
    )

    # Profile fields
    display_name = models.CharField(max_length=150, db_index=True)
    email = models.EmailField(unique=True, db_index=True)
    department = models.CharField(max_length=100, blank=True, default="")
    title = models.CharField(max_length=150, blank=True, default="")
    phone = models.CharField(max_length=30, blank=True, default="")
    location = models.CharField(max_length=100, blank=True, default="")
    bio = models.TextField(max_length=500, blank=True, default="")

    # Status
    employment_status = models.CharField(
        max_length=20,
        choices=EmploymentStatus.choices,
        default=EmploymentStatus.ACTIVE,
        db_index=True,
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Active employees can use FortiConnect. Deactivate instead of deleting.",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # HR sync tracking
    last_synced_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time this record was synced from HR/XHR.",
    )

    class Meta:
        ordering = ["display_name"]
        indexes = [
            models.Index(fields=["is_active", "display_name"]),
            models.Index(fields=["department", "is_active"]),
        ]
        verbose_name = "Employee"
        verbose_name_plural = "Employees"

    def __str__(self):
        return f"{self.display_name} ({self.employee_id})"

    @property
    def is_available_for_messaging(self) -> bool:
        """Returns True only if the employee can send and receive messages."""
        return self.is_active and self.employment_status == EmploymentStatus.ACTIVE

