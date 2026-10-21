"""
FortiConnect — Notification Models

Notifications are persisted in PostgreSQL.
Real-time delivery uses the WebSocket channel layer.
Only the intended recipient can see their notifications.
"""
from django.db import models
from apps.employees.models import Employee


class NotificationType(models.TextChoices):
    NEW_MESSAGE = "new_message", "New Message"
    GROUP_INVITE = "group_invite", "Group Invitation"
    MEMBER_ADDED = "member_added", "Member Added"
    MEMBER_REMOVED = "member_removed", "Member Removed"
    ROLE_CHANGED = "role_changed", "Role Changed"


class Notification(models.Model):
    """
    A notification for a single employee.
    Content is minimal — does not include full message text by default.
    """
    recipient = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="notifications",
        db_index=True,
    )
    type = models.CharField(
        max_length=30,
        choices=NotificationType.choices,
        db_index=True,
    )
    # Generic JSON payload — stores minimal metadata, not full message content
    payload = models.JSONField(default=dict)
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    # Optional link to source objects
    conversation_id = models.IntegerField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "is_read", "created_at"]),
        ]
        verbose_name = "Notification"
        verbose_name_plural = "Notifications"

    def __str__(self):
        return f"Notification({self.type}) for {self.recipient}"

