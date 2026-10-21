"""
FortiConnect — Conversation & Messaging Views

Authorization invariants:
- Every queryset is scoped to the requesting employee's active memberships.
- Conversation retrieval by ID always re-checks membership before returning data.
- Non-members receive HTTP 404 (not 403) to avoid revealing conversation existence.
- Message send is blocked if the author is not an active member.
- Group admin actions (add/remove/role) require OWNER or ADMIN role.
"""
import structlog
from django.db import transaction
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
    Conversation, ConversationMembership, ConversationType, MemberRole, Message
)
from .permissions import IsConversationAdmin
from .serializers import (
    AddMemberSerializer,
    ConversationSerializer,
    CreateDirectConversationSerializer,
    CreateGroupConversationSerializer,
    MembershipSerializer,
    MessageSerializer,
    SendMessageSerializer,
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


def _broadcast_message(conversation: Conversation, message_data: dict):
    """Broadcast a new message to all connected WebSocket clients."""
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            conversation.channel_group_name,
            {
                "type": "chat.message",
                "message": message_data,
            },
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
        conversations = (
            Conversation.objects
            .filter(
                memberships__employee=employee,
                memberships__removed_at__isnull=True,
                is_archived=False,
            )
            .prefetch_related("memberships__employee")
            .order_by("-updated_at")
            .distinct()
        )
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
    PATCH  /api/conversations/{id}/   — update group name/description (admins only)
    DELETE /api/conversations/{id}/   — archive conversation (admins only)
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

        if "name" in request.data:
            name = str(request.data["name"]).strip()
            if not name or len(name) > 100:
                return Response({"detail": "Group name must be 1–100 characters."}, status=400)
            conversation.name = name

        if "description" in request.data:
            conversation.description = str(request.data["description"])[:500]

        conversation.save()
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
        conversation.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MessageListCreateView(APIView):
    """
    GET  /api/conversations/{id}/messages/  — paginated message history (members only)
    POST /api/conversations/{id}/messages/  — send a message (members only)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)

        messages = (
            Message.objects
            .filter(conversation=conversation)
            .select_related("author")
            .order_by("-created_at")
        )

        # Simple cursor pagination via ?before_id=<message_id>
        before_id = request.query_params.get("before_id")
        if before_id:
            try:
                messages = messages.filter(pk__lt=int(before_id))
            except ValueError:
                return Response({"detail": "Invalid before_id."}, status=400)

        limit = min(int(request.query_params.get("limit", 50)), 100)
        messages = list(messages[:limit])
        messages.reverse()  # Oldest-first for display

        return Response(MessageSerializer(messages, many=True).data)

    def post(self, request, pk):
        employee = _get_employee_or_403(request.user)
        conversation = _get_conversation_for_member(pk, employee)

        # Verify the employee is an active member (not removed)
        membership = ConversationMembership.objects.filter(
            conversation=conversation,
            employee=employee,
            removed_at__isnull=True,
        ).first()
        if not membership:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        # Verify the employee can message (not inactive)
        if not employee.is_available_for_messaging:
            return Response(
                {"detail": "Your account is inactive and cannot send messages."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        message = Message.objects.create(
            conversation=conversation,
            author=employee,
            content=serializer.validated_data["content"],
        )

        # Update conversation timestamp
        conversation.updated_at = message.created_at
        conversation.save(update_fields=["updated_at"])

        message_data = MessageSerializer(message).data

        # Broadcast via WebSocket (non-blocking, best-effort)
        _broadcast_message(conversation, message_data)

        logger.info(
            "message_sent",
            message_id=message.pk,
            conversation_id=conversation.pk,
            author_id=employee.pk,
        )

        return Response(message_data, status=status.HTTP_201_CREATED)


class MessageDetailView(APIView):
    """
    PATCH  /api/messages/{id}/  — edit own message
    DELETE /api/messages/{id}/  — soft-delete own message
    """
    permission_classes = [IsAuthenticated]

    def _get_own_message(self, request, pk):
        employee = _get_employee_or_403(request.user)
        message = get_object_or_404(Message, pk=pk)

        # Verify membership in the conversation
        membership = ConversationMembership.objects.filter(
            conversation=message.conversation,
            employee=employee,
            removed_at__isnull=True,
        ).first()
        if not membership:
            from django.http import Http404
            raise Http404

        # Only author can edit/delete
        if message.author != employee:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only edit or delete your own messages.")

        return message

    def patch(self, request, pk):
        message = self._get_own_message(request, pk)
        if message.is_deleted:
            return Response({"detail": "Cannot edit a deleted message."}, status=400)

        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        message.content = serializer.validated_data["content"]
        message.edited_at = timezone.now()
        message.save(update_fields=["content", "edited_at"])

        return Response(MessageSerializer(message).data)

    def delete(self, request, pk):
        message = self._get_own_message(request, pk)
        message.deleted_at = timezone.now()
        message.save(update_fields=["deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConversationMembersView(APIView):
    """
    GET    /api/conversations/{id}/members/             — list members
    POST   /api/conversations/{id}/members/             — add member (admin only)
    DELETE /api/conversations/{id}/members/{member_id}/ — remove member (admin only)
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
            # Re-add a previously removed member
            membership.removed_at = None
            membership.save(update_fields=["removed_at"])

        logger.info("member_added", conversation_id=conversation.pk, employee_id=new_employee.pk)
        return Response(MembershipSerializer(membership).data, status=status.HTTP_201_CREATED)


class ConversationMemberDetailView(APIView):
    """
    DELETE /api/conversations/{id}/members/{member_id}/ — remove member (admin only)
    PATCH  /api/conversations/{id}/members/{member_id}/ — update role (admin only)
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

        # Members can remove themselves; admins can remove anyone except owners
        is_self = target_membership.employee == employee
        if not is_self and not is_admin:
            return Response({"detail": "Only group admins can remove members."}, status=403)

        if target_membership.role == MemberRole.OWNER and not is_self:
            return Response({"detail": "The group owner cannot be removed by an admin."}, status=403)

        target_membership.removed_at = timezone.now()
        target_membership.save(update_fields=["removed_at"])

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
        return Response(MembershipSerializer(target_membership).data)


class LeaveConversationView(APIView):
    """
    POST /api/conversations/{id}/leave/ — leave a group conversation
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

        # Owner transfer required if owner is leaving and others remain
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
                # Promote the oldest member to owner
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

        # Read from Redis first
        try:
            r = redis_lib.from_url(settings.CACHES["default"]["LOCATION"])
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

        # Fallback to DB
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

