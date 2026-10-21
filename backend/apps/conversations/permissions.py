"""
FortiConnect — Conversation Permissions

Server-enforces membership before every read/write operation.
"""
from rest_framework.permissions import BasePermission

from .models import ConversationMembership, MemberRole


class IsConversationMember(BasePermission):
    """
    Grants access only to active members of the conversation.
    The view must have `conversation` available on kwargs or via get_object().
    """

    def has_object_permission(self, request, view, obj):
        # obj is a Conversation instance
        try:
            employee = request.user.employee
        except Exception:
            return False

        return ConversationMembership.objects.filter(
            conversation=obj,
            employee=employee,
            removed_at__isnull=True,
        ).exists()


class IsConversationAdmin(BasePermission):
    """
    Grants access only to admins or owners of the group.
    """

    def has_object_permission(self, request, view, obj):
        try:
            employee = request.user.employee
        except Exception:
            return False

        return ConversationMembership.objects.filter(
            conversation=obj,
            employee=employee,
            role__in=[MemberRole.OWNER, MemberRole.ADMIN],
            removed_at__isnull=True,
        ).exists()

