"""
FortiConnect — Conversation Serializers
"""
from django.utils import timezone
from rest_framework import serializers

from apps.employees.serializers import EmployeeListSerializer
from .models import Conversation, ConversationMembership, ConversationType, MemberRole, Message


class MessageSerializer(serializers.ModelSerializer):
    author = EmployeeListSerializer(read_only=True)
    is_deleted = serializers.BooleanField(read_only=True)

    class Meta:
        model = Message
        fields = ["id", "conversation", "author", "content", "created_at", "edited_at", "is_deleted"]
        read_only_fields = ["id", "conversation", "author", "created_at", "edited_at", "is_deleted"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Hide content of deleted messages
        if instance.is_deleted:
            data["content"] = "[This message was deleted]"
        return data


class SendMessageSerializer(serializers.Serializer):
    content = serializers.CharField(
        min_length=1,
        max_length=4000,
        trim_whitespace=True,
        error_messages={
            "min_length": "Message cannot be empty.",
            "max_length": "Message exceeds the 4000 character limit.",
        },
    )


class MembershipSerializer(serializers.ModelSerializer):
    employee = EmployeeListSerializer(read_only=True)

    class Meta:
        model = ConversationMembership
        fields = ["id", "employee", "role", "joined_at", "removed_at"]
        read_only_fields = fields


class ConversationSerializer(serializers.ModelSerializer):
    """Serializer for conversation list."""
    memberships = MembershipSerializer(
        many=True,
        read_only=True,
        source="memberships_active",  # annotated by view
    )
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Conversation
        fields = [
            "id", "type", "name", "description", "created_by",
            "created_at", "updated_at", "is_archived",
            "memberships", "last_message", "unread_count",
        ]
        read_only_fields = fields

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


class CreateDirectConversationSerializer(serializers.Serializer):
    participant_employee_id = serializers.IntegerField(
        help_text="Database pk of the other employee."
    )


class CreateGroupConversationSerializer(serializers.Serializer):
    name = serializers.CharField(min_length=1, max_length=100)
    description = serializers.CharField(max_length=500, required=False, default="")
    member_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=0,
        max_length=499,
        required=False,
        default=list,
    )


class AddMemberSerializer(serializers.Serializer):
    employee_id = serializers.IntegerField(help_text="Database pk of the employee to add.")


class UpdateMemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=[MemberRole.ADMIN, MemberRole.MEMBER])

