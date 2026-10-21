"""
FortiConnect — Conversation, Message, Reaction, and Attachment Models

Schema design:
- Conversation: either a DIRECT (2-person) or GROUP type with optional avatar
- ConversationMembership: explicit many-to-many with roles for groups, unread pointer, and mute
- Message: durable, stored in PostgreSQL with reply_to threading, pinning, and idempotency
- MessageReaction: emoji reactions with unique employee/message/emoji constraint
- MessageAttachment: secure file attachments with authenticated access
- PresenceRecord: ephemeral online/offline status, stored short-term in DB
  (Redis is the primary store; DB is a fallback/audit trail)

Security invariants enforced at query level:
- Every message queryset is scoped to conversations the requesting user is a member of.
- Membership is checked server-side on every operation.
- No client-supplied group name is passed through to channel layer without sanitation.
"""
import uuid
from django.contrib.auth.models import User
from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.employees.models import Employee


class ConversationType(models.TextChoices):
    DIRECT = "direct", "Direct Message"
    GROUP = "group", "Group"


class MemberRole(models.TextChoices):
    OWNER = "owner", "Owner"
    ADMIN = "admin", "Admin"
    MEMBER = "member", "Member"


class Conversation(models.Model):
    """
    A conversation is either a 1-on-1 direct message thread or a group channel.
    The participants are tracked via ConversationMembership.
    """

    type = models.CharField(
        max_length=10,
        choices=ConversationType.choices,
        default=ConversationType.DIRECT,
        db_index=True,
    )

    # Group-only fields
    name = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Required for group conversations.",
    )
    description = models.TextField(max_length=500, blank=True, default="")
    avatar = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Custom avatar identifier or image URL.",
    )

    created_by = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_conversations",
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Soft-delete: archived conversations are hidden from listings but messages preserved
    is_archived = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["type", "is_archived"]),
        ]
        verbose_name = "Conversation"
        verbose_name_plural = "Conversations"

    def __str__(self):
        if self.type == ConversationType.GROUP:
            return f"Group: {self.name or '(unnamed)'} #{self.pk}"
        return f"DM #{self.pk}"

    @property
    def channel_group_name(self) -> str:
        """Safe channel group name for Django Channels. Never use client-supplied values."""
        return f"conversation_{self.pk}"


class ConversationMembership(models.Model):
    """
    Explicit membership record for each participant in a conversation.
    This is the authorization source of truth for all message operations.
    """

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="conversation_memberships",
    )
    role = models.CharField(
        max_length=10,
        choices=MemberRole.choices,
        default=MemberRole.MEMBER,
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    # Soft-removal: removed members retain historical records
    removed_at = models.DateTimeField(null=True, blank=True)

    # Unread and notification preferences
    last_read_message_id = models.IntegerField(default=0, db_index=True)
    is_muted = models.BooleanField(default=False)

    class Meta:
        unique_together = [("conversation", "employee")]
        indexes = [
            models.Index(fields=["employee", "removed_at"]),
            models.Index(fields=["conversation", "removed_at"]),
        ]
        verbose_name = "Conversation Membership"
        verbose_name_plural = "Conversation Memberships"

    def __str__(self):
        return f"{self.employee} in {self.conversation}"

    @property
    def is_active_member(self) -> bool:
        return self.removed_at is None


class Message(models.Model):
    """
    A single message in a conversation.
    PostgreSQL is the durable source of truth. WebSocket delivery is best-effort.
    """

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
        db_index=True,
    )
    author = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        related_name="authored_messages",
    )
    content = models.TextField(max_length=4000)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    # Threading / Reply support
    reply_to = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replies",
    )

    # Pinning support
    is_pinned = models.BooleanField(default=False, db_index=True)
    pinned_at = models.DateTimeField(null=True, blank=True)
    pinned_by = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pinned_messages",
    )

    # Deduplication and retry idempotency
    idempotency_key = models.CharField(max_length=64, null=True, blank=True, db_index=True)

    # Soft-delete: deleted messages show a placeholder, not the content
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
            models.Index(fields=["author", "created_at"]),
            models.Index(fields=["conversation", "is_pinned"]),
        ]
        verbose_name = "Message"
        verbose_name_plural = "Messages"

    def __str__(self):
        return f"Message #{self.pk} in {self.conversation}"

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class MessageReaction(models.Model):
    """
    Emoji reaction to a message by an employee.
    Enforces uniqueness so a user cannot duplicate reactions to the same message.
    """

    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="reactions",
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="message_reactions",
    )
    emoji = models.CharField(max_length=16, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("message", "employee", "emoji")]
        indexes = [
            models.Index(fields=["message", "emoji"]),
        ]
        verbose_name = "Message Reaction"
        verbose_name_plural = "Message Reactions"

    def __str__(self):
        return f"{self.employee} reacted {self.emoji} on #{self.message_id}"


class MessageAttachment(models.Model):
    """
    Authorized file attachment linked to a message.
    Served via authenticated endpoint to ensure security checks.
    """

    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to="attachments/%Y/%m/%d/")
    original_name = models.CharField(max_length=255)
    file_size = models.BigIntegerField(default=0)
    content_type = models.CharField(max_length=100, default="application/octet-stream")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "Message Attachment"
        verbose_name_plural = "Message Attachments"

    def __str__(self):
        return f"Attachment {self.original_name} on #{self.message_id}"


class PresenceRecord(models.Model):
    """
    Last-seen metadata stored in the database for audit / fallback.
    Real-time presence state lives in Redis (short TTL).
    """

    employee = models.OneToOneField(
        Employee,
        on_delete=models.CASCADE,
        related_name="presence",
    )
    status = models.CharField(
        max_length=20,
        choices=[("online", "Online"), ("offline", "Offline"), ("away", "Away")],
        default="offline",
    )
    last_seen_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        verbose_name = "Presence Record"
        verbose_name_plural = "Presence Records"

    def __str__(self):
        return f"{self.employee} — {self.status}"
