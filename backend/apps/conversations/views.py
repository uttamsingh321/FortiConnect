"""
FortiConnect — Conversation & Messaging Views

Authorization invariants:
- Every queryset is scoped to the requesting employee's active memberships.
- Conversation retrieval by ID always re-checks membership before returning data.
- Non-members receive HTTP 404 (not 403) to avoid revealing conversation existence.
- Message send is blocked if the author is not an active member.
- Group admin actions (add/remove/role/pin) require OWNER or ADMIN role.
- File attachment downloads enforce membership verification before serving content.
"""
from datetime import timedelta
import structlog
from django.db import transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from apps.employees.models import Employee
from .models import (
    Conversation,
    ConversationMembership,
    ConversationType,
    MemberRole,
    Message,
    MessageAttachment,
    MessageReaction,
)
from .permissions import IsConversationAdmin
from .serializers import (
    AddMemberSerializer,
    ConversationSerializer,
    CreateDirectConversationSerializer,
    CreateGroupConversationSerializer,
    MembershipSerializer,
    MessageAttachmentSerializer,
    MessageSerializer,
    SendMessageSerializer,
    ToggleReactionSerializer,
    TransferOwnershipSerializer,
    UpdateGroupConversationSerializer,
    UpdateMemberRoleSerializer,
)

logger = structlog.get_logger(__name__)


def _get_employee_or_403(user):
    """Get the employee for the current user, raise 403 if not found."""
    try:
        return user.employee
    except Employee.DoesNotExist:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("No employee profile found for this user.")


def _get_conversation_for_member(conversation_id, employee):
    """
    Return the conversation only if the employee is an active member.
    Returns HTTP 404 (not 403) to avoid revealing existence.
    """
    return get_object_or_404(
        Conversation,
        pk=conversation_id,
        memberships__employee=employee,
        memberships__removed_at__isnull=True,
    )


def _broadcast_event(conversation: Conversation, event_payload: dict):
    """Broadcast an arbitrary real-time event to all connected room subscribers."""
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            conversation.channel_group_name,
            event_payload,
        )
    except Exception as e:
        logger.error("ws_broadcast_failed", conversation_id=conversation.pk, error=str(e))


class ConversationListCreateView(APIView):
    """
    GET  /api/conversations/   — list the authenticated employee's active conversations
    POST /api/conversations/   — create a new direct or group conversation
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = _get_employee_or_403(request.user)
        include_archived = request.query_params.get("include_archived", "false").lower() == "true"
        conversations = (
            Conversation.objects
            .filter(
                memberships__employee=employee,
                memberships__removed_at__isnull=True,
            )
            .prefetch_related("memberships__employee", "messages")
            .order_by("-updated_at")
            .distinct()
        )
        if not include_archived:
            conversations = conversations.filter(is_archived=False)

        serializer = ConversationSerializer(
            conversations, many=True, context={"request": request}
        )
        return Response(serializer.data)

    def post(self, request):
        conv_type = request.data.get("type", "direct")
        if conv_type == ConversationType.DIRECT:
            return self._create_direct(request)
        elif conv_type == ConversationType.GROUP:
            return self._create_group(request)
        else:
            return Response(
                {"detail": f"Invalid conversation type: {conv_type}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def _create_direct(self, request):
        serializer = CreateDirectConversationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        employee = _get_employee_or_403(request.user)
        other_employee = get_object_or_404(
            Employee,
            pk=serializer.validated_data["participant_employee_id"],
            is_active=True,
        )

        if employee.pk == other_employee.pk:
            return Response(
                {"detail": "You cannot create a direct message with yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if DM already exists between these two employees
        existing = (
            Conversation.objects
            .filter(type=ConversationType.DIRECT)
            .filter(memberships__employee=employee, memberships__removed_at__isnull=True)
            .filter(memberships__employee=other_employee, memberships__removed_at__isnull=True)
            .first()
        )
        if existing:
            return Response(
                ConversationSerializer(existing, context={"request": request}).data,
                status=status.HTTP_200_OK,
            )

        with transaction.atomic():
            conversation = Conversation.objects.create(type=ConversationType.DIRECT)
            ConversationMembership.objects.create(
                conversation=conversation, employee=employee, role=MemberRole.MEMBER
            )
            ConversationMembership.objects.create(
                conversation=conversation, employee=other_employee, role=MemberRole.MEMBER
            )

        logger.info("direct_conversation_created", conversation_id=conversation.pk)
        return Response(
            ConversationSerializer(conversation, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def _create_group(self, request):
        serializer = CreateGroupConversationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        employee = _get_employee_or_403(request.user)
        member_ids = serializer.validated_data.get("member_ids", [])

        with transaction.atomic():
            conversation = Conversation.objects.create(
                type=ConversationType.GROUP,
                name=serializer.validated_data["name"],
                description=serializer.validated_data.get("description", ""),
                avatar=serializer.validated_data.get("avatar", ""),
                created_by=employee,
            )
            # Creator is the owner
            ConversationMembership.objects.create(
                conversation=conversation, employee=employee, role=MemberRole.OWNER
            )
            # Add initial members
            for member_id in set(member_ids):
                if member_id == employee.pk:
                    continue
                try:
                    member = Employee.objects.get(pk=member_id, is_active=True)
                    ConversationMembership.objects.get_or_create(
                        conversation=conversation,
                        employee=member,
                        defaults={"role": MemberRole.MEMBER},
                    )
                except Employee.DoesNotExist:
                    pass

        logger.info("group_conversation_created", conversation_id=conversation.pk, name=conversation.name)
        return Response(
            ConversationSerializer(conversation, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class ConversationDetailView(APIView):
    """
    GET    /api/conversations/{id}/   — get conversation details (members only)
    PATCH  /api/conversations/{id}/   — update group name/description/avatar (admins/owners only)
    DELETE /api/conversations/{id}/   — archive conversation (admins/owners only)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)
        return Response(ConversationSerializer(conversation, context={"request": request}).data)

    def patch(self, request, pk):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)

        if conversation.type != ConversationType.GROUP:
            return Response({"detail": "Only group conversations can be updated."}, status=400)

        # Admin check
        is_admin = ConversationMembership.objects.filter(
            conversation=conversation,
            employee=employee,
            role__in=[MemberRole.OWNER, MemberRole.ADMIN],
            removed_at__isnull=True,
        ).exists()
        if not is_admin:
            return Response({"detail": "Only group admins can update group details."}, status=403)

        serializer = UpdateGroupConversationSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        if "name" in serializer.validated_data:
            conversation.name = serializer.validated_data["name"].strip()
        if "description" in serializer.validated_data:
            conversation.description = serializer.validated_data["description"].strip()
        if "avatar" in serializer.validated_data:
            conversation.avatar = serializer.validated_data["avatar"].strip()

        conversation.save()

        # Broadcast update
        _broadcast_event(
            conversation,
            {
                "type": "conversation.updated",
                "conversation": ConversationSerializer(conversation, context={"request": request}).data,
            },
        )
        return Response(ConversationSerializer(conversation, context={"request": request}).data)

    def delete(self, request, pk):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)

        is_admin = ConversationMembership.objects.filter(
            conversation=conversation,
            employee=employee,
            role__in=[MemberRole.OWNER, MemberRole.ADMIN],
            removed_at__isnull=True,
        ).exists()
        if not is_admin:
            return Response({"detail": "Only group admins can archive conversations."}, status=403)

        conversation.is_archived = True
        conversation.save(update_fields=["is_archived"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ArchiveConversationView(APIView):
    """
    POST /api/conversations/{id}/archive/ — toggle archive status (admins/owners only)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)

        is_admin = ConversationMembership.objects.filter(
            conversation=conversation,
            employee=employee,
            role__in=[MemberRole.OWNER, MemberRole.ADMIN],
            removed_at__isnull=True,
        ).exists()
        if not is_admin:
            return Response({"detail": "Only group admins can archive or unarchive."}, status=403)

        conversation.is_archived = not conversation.is_archived
        conversation.save(update_fields=["is_archived"])
        return Response({"is_archived": conversation.is_archived})


class TransferOwnershipView(APIView):
    """
    POST /api/conversations/{id}/transfer-ownership/ — transfer group ownership (Owner only)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)

        if conversation.type != ConversationType.GROUP:
            return Response({"detail": "Only group conversations have owners."}, status=400)

        # Requester must be current Owner
        owner_membership = ConversationMembership.objects.filter(
            conversation=conversation,
            employee=employee,
            role=MemberRole.OWNER,
            removed_at__isnull=True,
        ).first()
        if not owner_membership:
            return Response({"detail": "Only the group owner can transfer ownership."}, status=403)

        serializer = TransferOwnershipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_employee = get_object_or_404(
            Employee, pk=serializer.validated_data["new_owner_id"], is_active=True
        )

        target_membership = get_object_or_404(
            ConversationMembership,
            conversation=conversation,
            employee=target_employee,
            removed_at__isnull=True,
        )

        with transaction.atomic():
            owner_membership.role = MemberRole.ADMIN
            owner_membership.save(update_fields=["role"])

            target_membership.role = MemberRole.OWNER
            target_membership.save(update_fields=["role"])

        _broadcast_event(
            conversation,
            {
                "type": "conversation.updated",
                "conversation": ConversationSerializer(conversation, context={"request": request}).data,
            },
        )
        return Response(ConversationSerializer(conversation, context={"request": request}).data)


class MarkConversationReadView(APIView):
    """
    POST /api/conversations/{id}/read/ — advance last-read pointer to latest message
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)

        membership = ConversationMembership.objects.filter(
            conversation=conversation,
            employee=employee,
            removed_at__isnull=True,
        ).first()
        if not membership:
            return Response({"detail": "Not a member."}, status=404)

        latest_msg = conversation.messages.filter(deleted_at__isnull=True).order_by("-pk").first()
        if latest_msg:
            membership.last_read_message_id = latest_msg.pk
            membership.save(update_fields=["last_read_message_id"])

        return Response({"last_read_message_id": membership.last_read_message_id, "unread_count": 0})


class MessageListCreateView(APIView):
    """
    GET  /api/conversations/{id}/messages/  — paginated message history, search, and pinned filter
    POST /api/conversations/{id}/messages/  — send message with replies, attachments, idempotency
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)

        messages = (
            Message.objects
            .filter(conversation=conversation)
            .select_related("author", "reply_to", "reply_to__author", "pinned_by")
            .prefetch_related("reactions__employee", "attachments")
            .order_by("-created_at")
        )

        # Keyword search filter
        query = request.query_params.get("q")
        if query:
            messages = messages.filter(content__icontains=query.strip(), deleted_at__isnull=True)

        # Pinned messages only filter
        pinned_only = request.query_params.get("pinned_only", "false").lower() == "true"
        if pinned_only:
            messages = messages.filter(is_pinned=True, deleted_at__isnull=True)

        # Cursor pagination via ?before_id=<message_id>
        before_id = request.query_params.get("before_id")
        if before_id:
            try:
                messages = messages.filter(pk__lt=int(before_id))
            except ValueError:
                return Response({"detail": "Invalid before_id."}, status=400)

        limit = min(int(request.query_params.get("limit", 50)), 100)
        messages = list(messages[:limit])
        messages.reverse()  # Chronological order

        return Response(MessageSerializer(messages, many=True, context={"request": request}).data)

    def post(self, request, pk):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)

        membership = ConversationMembership.objects.filter(
            conversation=conversation,
            employee=employee,
            removed_at__isnull=True,
        ).first()
        if not membership:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if not employee.is_available_for_messaging:
            return Response(
                {"detail": "Your account is inactive and cannot send messages."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        idempotency_key = serializer.validated_data.get("idempotency_key")
        content = serializer.validated_data.get("content", "")
        reply_to_id = serializer.validated_data.get("reply_to_id")
        attachment_file = request.FILES.get("attachment")

        if not content and not attachment_file:
            return Response({"detail": "Message content or file attachment is required."}, status=400)

        # Check idempotency within last 1 hour
        if idempotency_key:
            existing = Message.objects.filter(
                conversation=conversation,
                author=employee,
                idempotency_key=idempotency_key,
                created_at__gte=timezone.now() - timedelta(hours=1),
            ).first()
            if existing:
                return Response(
                    MessageSerializer(existing, context={"request": request}).data,
                    status=status.HTTP_200_OK,
                )

        reply_to = None
        if reply_to_id:
            reply_to = Message.objects.filter(conversation=conversation, pk=reply_to_id).first()

        with transaction.atomic():
            message = Message.objects.create(
                conversation=conversation,
                author=employee,
                content=content or (f"[Attached: {attachment_file.name}]" if attachment_file else ""),
                reply_to=reply_to,
                idempotency_key=idempotency_key or None,
            )

            if attachment_file:
                MessageAttachment.objects.create(
                    message=message,
                    file=attachment_file,
                    original_name=attachment_file.name,
                    file_size=attachment_file.size,
                    content_type=getattr(attachment_file, "content_type", "application/octet-stream"),
                )

            # Auto-advance sender's last read position
            membership.last_read_message_id = message.pk
            membership.save(update_fields=["last_read_message_id"])

            conversation.updated_at = message.created_at
            conversation.save(update_fields=["updated_at"])

        message_data = MessageSerializer(message, context={"request": request}).data

        # Broadcast message via WebSocket
        _broadcast_event(
            conversation,
            {
                "type": "chat.message",
                "message": message_data,
            },
        )

        logger.info("message_sent", message_id=message.pk, conversation_id=conversation.pk)
        return Response(message_data, status=status.HTTP_201_CREATED)


class MessageDetailView(APIView):
    """
    PATCH  /api/messages/{id}/  — edit own message
    DELETE /api/messages/{id}/  — soft-delete own message or moderate if admin
    """
    permission_classes = [IsAuthenticated]

    def _get_message_and_role(self, request, pk):
        employee = _get_employee_or_403(request.user)
        message = get_object_or_404(Message, pk=pk)

        membership = ConversationMembership.objects.filter(
            conversation=message.conversation,
            employee=employee,
            removed_at__isnull=True,
        ).first()
        if not membership:
            raise Http404

        is_author = message.author == employee
        is_admin = membership.role in [MemberRole.OWNER, MemberRole.ADMIN]
        return message, employee, is_author, is_admin

    def patch(self, request, pk):
        message, employee, is_author, is_admin = self._get_message_and_role(request, pk)
        if not is_author:
            return Response({"detail": "You can only edit your own messages."}, status=403)
        if message.is_deleted:
            return Response({"detail": "Cannot edit a deleted message."}, status=400)

        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        message.content = serializer.validated_data["content"]
        message.edited_at = timezone.now()
        message.save(update_fields=["content", "edited_at"])

        updated_data = MessageSerializer(message, context={"request": request}).data

        _broadcast_event(
            message.conversation,
            {
                "type": "chat.message",
                "message": updated_data,
            },
        )
        return Response(updated_data)

    def delete(self, request, pk):
        message, employee, is_author, is_admin = self._get_message_and_role(request, pk)
        if not is_author and not is_admin:
            return Response({"detail": "Only author or admin can delete messages."}, status=403)

        message.deleted_at = timezone.now()
        message.save(update_fields=["deleted_at"])

        updated_data = MessageSerializer(message, context={"request": request}).data

        _broadcast_event(
            message.conversation,
            {
                "type": "chat.message",
                "message": updated_data,
            },
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ToggleReactionView(APIView):
    """
    POST /api/messages/{id}/reactions/ — toggle an emoji reaction
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        employee = _get_employee_or_403(request.user)
        message = get_object_or_404(Message, pk=pk)

        # Check membership in the conversation
        membership = ConversationMembership.objects.filter(
            conversation=message.conversation,
            employee=employee,
            removed_at__isnull=True,
        ).first()
        if not membership:
            raise Http404

        if message.is_deleted:
            return Response({"detail": "Cannot react to deleted message."}, status=400)

        serializer = ToggleReactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        emoji = serializer.validated_data["emoji"].strip()

        reaction = MessageReaction.objects.filter(
            message=message, employee=employee, emoji=emoji
        ).first()

        if reaction:
            reaction.delete()
            action = "removed"
        else:
            MessageReaction.objects.create(
                message=message, employee=employee, emoji=emoji
            )
            action = "added"

        updated_reactions = MessageSerializer(message, context={"request": request}).data["reactions"]

        _broadcast_event(
            message.conversation,
            {
                "type": "message.reaction",
                "message_id": message.pk,
                "conversation_id": message.conversation_id,
                "reactions": updated_reactions,
            },
        )
        return Response({"action": action, "reactions": updated_reactions})


class PinMessageView(APIView):
    """
    POST /api/conversations/{id}/pin/{message_id}/ — pin or unpin a message (Owner/Admin only)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, message_id):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)

        is_admin = ConversationMembership.objects.filter(
            conversation=conversation,
            employee=employee,
            role__in=[MemberRole.OWNER, MemberRole.ADMIN],
            removed_at__isnull=True,
        ).exists()
        if not is_admin:
            return Response({"detail": "Only group admins can pin messages."}, status=403)

        message = get_object_or_404(Message, pk=message_id, conversation=conversation)
        if message.is_deleted:
            return Response({"detail": "Cannot pin a deleted message."}, status=400)

        message.is_pinned = not message.is_pinned
        if message.is_pinned:
            message.pinned_at = timezone.now()
            message.pinned_by = employee
        else:
            message.pinned_at = None
            message.pinned_by = None
        message.save(update_fields=["is_pinned", "pinned_at", "pinned_by"])

        msg_data = MessageSerializer(message, context={"request": request}).data

        _broadcast_event(
            conversation,
            {
                "type": "chat.message",
                "message": msg_data,
            },
        )
        return Response({"is_pinned": message.is_pinned, "message": msg_data})


class AttachmentDownloadView(APIView):
    """
    GET /api/attachments/{id}/download/ — safe authenticated attachment download
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        employee = _get_employee_or_403(request.user)
        attachment = get_object_or_404(MessageAttachment, pk=pk)

        # Enforce conversation membership
        membership = ConversationMembership.objects.filter(
            conversation=attachment.message.conversation,
            employee=employee,
            removed_at__isnull=True,
        ).first()
        if not membership:
            raise Http404

        if not attachment.file or not attachment.file.storage.exists(attachment.file.name):
            raise Http404("Attachment file not found.")

        response = FileResponse(
            attachment.file.open("rb"),
            content_type=attachment.content_type,
        )
        response["Content-Disposition"] = f'inline; filename="{attachment.original_name}"'
        return response


class ConversationMembersView(APIView):
    """
    GET    /api/conversations/{id}/members/ — list active members
    POST   /api/conversations/{id}/members/ — add member (admin only)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)

        memberships = ConversationMembership.objects.filter(
            conversation=conversation,
            removed_at__isnull=True,
        ).select_related("employee")

        return Response(MembershipSerializer(memberships, many=True).data)

    def post(self, request, pk):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)

        if conversation.type != ConversationType.GROUP:
            return Response({"detail": "Cannot add members to a direct message."}, status=400)

        # Only admins/owners can add
        is_admin = ConversationMembership.objects.filter(
            conversation=conversation,
            employee=employee,
            role__in=[MemberRole.OWNER, MemberRole.ADMIN],
            removed_at__isnull=True,
        ).exists()
        if not is_admin:
            return Response({"detail": "Only group admins can add members."}, status=403)

        serializer = AddMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_employee = get_object_or_404(Employee, pk=serializer.validated_data["employee_id"], is_active=True)

        membership, created = ConversationMembership.objects.get_or_create(
            conversation=conversation,
            employee=new_employee,
            defaults={"role": MemberRole.MEMBER},
        )
        if not created and membership.removed_at is not None:
            membership.removed_at = None
            membership.save(update_fields=["removed_at"])

        _broadcast_event(
            conversation,
            {
                "type": "conversation.updated",
                "conversation": ConversationSerializer(conversation, context={"request": request}).data,
            },
        )
        logger.info("member_added", conversation_id=conversation.pk, employee_id=new_employee.pk)
        return Response(MembershipSerializer(membership).data, status=status.HTTP_201_CREATED)


class ConversationMemberDetailView(APIView):
    """
    DELETE /api/conversations/{id}/members/{member_id}/ — remove member (admin only or self)
    PATCH  /api/conversations/{id}/members/{member_id}/ — update role (admin/owner only)
    """
    permission_classes = [IsAuthenticated]

    def _get_requester_and_membership(self, request, pk, member_id):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)

        is_admin = ConversationMembership.objects.filter(
            conversation=conversation,
            employee=employee,
            role__in=[MemberRole.OWNER, MemberRole.ADMIN],
            removed_at__isnull=True,
        ).exists()

        target_membership = get_object_or_404(
            ConversationMembership,
            pk=member_id,
            conversation=conversation,
            removed_at__isnull=True,
        )
        return conversation, is_admin, target_membership, employee

    def delete(self, request, pk, member_id):
        conversation, is_admin, target_membership, employee = (
            self._get_requester_and_membership(request, pk, member_id)
        )

        is_self = target_membership.employee == employee
        if not is_self and not is_admin:
            return Response({"detail": "Only group admins can remove members."}, status=403)

        if target_membership.role == MemberRole.OWNER and not is_self:
            return Response({"detail": "The group owner cannot be removed by an admin."}, status=403)

        target_membership.removed_at = timezone.now()
        target_membership.save(update_fields=["removed_at"])

        _broadcast_event(
            conversation,
            {
                "type": "conversation.updated",
                "conversation": ConversationSerializer(conversation, context={"request": request}).data,
            },
        )
        logger.info("member_removed", conversation_id=conversation.pk, employee_id=target_membership.employee.pk)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, pk, member_id):
        conversation, is_admin, target_membership, employee = (
            self._get_requester_and_membership(request, pk, member_id)
        )

        if not is_admin:
            return Response({"detail": "Only admins can change member roles."}, status=403)

        serializer = UpdateMemberRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_membership.role = serializer.validated_data["role"]
        target_membership.save(update_fields=["role"])

        _broadcast_event(
            conversation,
            {
                "type": "conversation.updated",
                "conversation": ConversationSerializer(conversation, context={"request": request}).data,
            },
        )
        return Response(MembershipSerializer(target_membership).data)


class LeaveConversationView(APIView):
    """
    POST /api/conversations/{id}/leave/ — leave a group conversation voluntarily
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)

        if conversation.type == ConversationType.DIRECT:
            return Response({"detail": "You cannot leave a direct message."}, status=400)

        membership = get_object_or_404(
            ConversationMembership,
            conversation=conversation,
            employee=employee,
            removed_at__isnull=True,
        )

        # Owner transfer fallback if owner leaves
        if membership.role == MemberRole.OWNER:
            other_admins = ConversationMembership.objects.filter(
                conversation=conversation,
                role__in=[MemberRole.OWNER, MemberRole.ADMIN],
                removed_at__isnull=True,
            ).exclude(employee=employee)

            if other_admins.exists():
                membership.removed_at = timezone.now()
                membership.save(update_fields=["removed_at"])
            else:
                next_member = ConversationMembership.objects.filter(
                    conversation=conversation,
                    removed_at__isnull=True,
                ).exclude(employee=employee).order_by("joined_at").first()
                if next_member:
                    next_member.role = MemberRole.OWNER
                    next_member.save(update_fields=["role"])
                membership.removed_at = timezone.now()
                membership.save(update_fields=["removed_at"])
        else:
            membership.removed_at = timezone.now()
            membership.save(update_fields=["removed_at"])

        _broadcast_event(
            conversation,
            {
                "type": "conversation.updated",
                "conversation": ConversationSerializer(conversation, context={"request": request}).data,
            },
        )
        logger.info("member_left", conversation_id=conversation.pk, employee_id=employee.pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PresenceView(APIView):
    """
    GET /api/presence/{employee_id}/ — get presence for an employee
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, employee_id):
        import redis as redis_lib
        from django.conf import settings

        employee = get_object_or_404(Employee, pk=employee_id, is_active=True)

        try:
            cache_config = getattr(settings, "CACHES", {}).get("default", {})
            location = cache_config.get("LOCATION")
            if location and str(location).startswith("redis"):
                r = redis_lib.from_url(location)
                presence_key = f"presence:{employee.pk}"
                raw = r.hgetall(presence_key)
                if raw:
                    return Response({
                        "employee_id": employee.pk,
                        "status": raw.get(b"status", b"offline").decode(),
                        "last_seen_at": raw.get(b"last_seen_at", b"").decode() or None,
                    })
        except Exception:
            pass

        try:
            record = employee.presence
            return Response({
                "employee_id": employee.pk,
                "status": record.status,
                "last_seen_at": record.last_seen_at,
            })
        except Exception:
            return Response({
                "employee_id": employee.pk,
                "status": "offline",
                "last_seen_at": None,
            })
