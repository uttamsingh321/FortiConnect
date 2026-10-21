"""
FortiConnect — Conversation, Message, Reaction, and Attachment Serializers
"""
from collections import defaultdict
from django.utils import timezone
from rest_framework import serializers

from apps.employees.serializers import EmployeeListSerializer
from .models import (
    Conversation,
    ConversationMembership,
    ConversationType,
    MemberRole,
    Message,
    MessageAttachment,
    MessageReaction,
)


class MessageAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = MessageAttachment
        fields = ["id", "original_name", "file_size", "content_type", "created_at", "file_url"]
        read_only_fields = fields

    def get_file_url(self, obj):
        return f"/api/attachments/{obj.pk}/download/"


class MessageReactionGroupSerializer(serializers.Serializer):
    emoji = serializers.CharField()
    count = serializers.IntegerField()
    users = serializers.ListField(child=serializers.CharField())
    user_ids = serializers.ListField(child=serializers.IntegerField())
    has_reacted = serializers.BooleanField()


class ReplyPreviewSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "author_name", "content", "is_deleted"]
        read_only_fields = fields

    def get_author_name(self, obj):
        if obj.author:
            return obj.author.display_name
        return "Unknown"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.is_deleted:
            data["content"] = "[This message was deleted]"
        return data


class MessageSerializer(serializers.ModelSerializer):
    author = EmployeeListSerializer(read_only=True)
    is_deleted = serializers.BooleanField(read_only=True)
    reply_to = ReplyPreviewSerializer(read_only=True)
    reactions = serializers.SerializerMethodField()
    attachments = MessageAttachmentSerializer(many=True, read_only=True)
    pinned_by = EmployeeListSerializer(read_only=True)

    class Meta:
        model = Message
        fields = [
            "id", "conversation", "author", "content",
            "created_at", "edited_at", "is_deleted",
            "reply_to", "reactions", "attachments",
            "is_pinned", "pinned_at", "pinned_by",
        ]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.is_deleted:
            data["content"] = "[This message was deleted]"
        return data

    def get_reactions(self, obj):
        request = self.context.get("request")
        current_emp_id = None
        if request and hasattr(request.user, "employee") and request.user.employee:
            current_emp_id = request.user.employee.pk

        grouped = defaultdict(lambda: {"count": 0, "users": [], "user_ids": [], "has_reacted": False})
        for r in obj.reactions.select_related("employee").all():
            name = r.employee.display_name if r.employee else "Unknown"
            grouped[r.emoji]["count"] += 1
            grouped[r.emoji]["users"].append(name)
            if r.employee:
                grouped[r.emoji]["user_ids"].append(r.employee.pk)
                if current_emp_id and r.employee.pk == current_emp_id:
                    grouped[r.emoji]["has_reacted"] = True

        return [
            {
                "emoji": emoji,
                "count": info["count"],
                "users": info["users"],
                "user_ids": info["user_ids"],
                "has_reacted": info["has_reacted"],
            }
            for emoji, info in grouped.items()
        ]


class SendMessageSerializer(serializers.Serializer):
    content = serializers.CharField(
        max_length=4000,
        required=False,
        allow_blank=True,
        default="",
        trim_whitespace=True,
    )
    reply_to_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    idempotency_key = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")


class ToggleReactionSerializer(serializers.Serializer):
    emoji = serializers.CharField(min_length=1, max_length=16)


class MembershipSerializer(serializers.ModelSerializer):
    employee = EmployeeListSerializer(read_only=True)

    class Meta:
        model = ConversationMembership
        fields = ["id", "employee", "role", "joined_at", "removed_at", "last_read_message_id", "is_muted"]
        read_only_fields = fields


class ConversationSerializer(serializers.ModelSerializer):
    """Serializer for conversation list and detail."""
    memberships = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    pinned_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id", "type", "name", "description", "avatar", "created_by",
            "created_at", "updated_at", "is_archived",
            "memberships", "last_message", "unread_count", "pinned_count",
        ]
        read_only_fields = fields

    def get_memberships(self, obj):
        members = getattr(obj, "memberships_active", None)
        if members is None:
            members = obj.memberships.filter(removed_at__isnull=True).select_related("employee")
        return MembershipSerializer(members, many=True).data

    def get_last_message(self, obj):
        last = obj.messages.filter(deleted_at__isnull=True).order_by("-created_at").first()
        if last:
            return {
                "id": last.pk,
                "content": last.content[:100],
                "created_at": last.created_at,
                "author_name": last.author.display_name if last.author else "Unknown",
            }
        return None

    def get_unread_count(self, obj):
        request = self.context.get("request")
        if not request or not hasattr(request.user, "employee") or not request.user.employee:
            return 0
        emp = request.user.employee
        membership = obj.memberships.filter(employee=emp, removed_at__isnull=True).first()
        if not membership:
            return 0
        return obj.messages.filter(
            pk__gt=membership.last_read_message_id,
            deleted_at__isnull=True,
        ).exclude(author=emp).count()

    def get_pinned_count(self, obj):
        return obj.messages.filter(is_pinned=True, deleted_at__isnull=True).count()


class CreateDirectConversationSerializer(serializers.Serializer):
    participant_employee_id = serializers.IntegerField(
        help_text="Database pk of the other employee."
    )


class CreateGroupConversationSerializer(serializers.Serializer):
    name = serializers.CharField(min_length=1, max_length=100)
    description = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    avatar = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    member_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=0,
        max_length=499,
        required=False,
        default=list,
    )


class UpdateGroupConversationSerializer(serializers.Serializer):
    name = serializers.CharField(min_length=1, max_length=100, required=False)
    description = serializers.CharField(max_length=500, required=False, allow_blank=True)
    avatar = serializers.CharField(max_length=255, required=False, allow_blank=True)


class AddMemberSerializer(serializers.Serializer):
    employee_id = serializers.IntegerField(help_text="Database pk of the employee to add.")


class UpdateMemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=[MemberRole.ADMIN, MemberRole.MEMBER])


class TransferOwnershipSerializer(serializers.Serializer):
    new_owner_id = serializers.IntegerField(help_text="Database pk of the new owner employee.")
