"""
FortiConnect — Notification Service

Creates and delivers notifications.
Delivery is non-blocking — WebSocket failure does not prevent persistence.
"""
import structlog
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone

from .models import Notification, NotificationType
from apps.employees.models import Employee

logger = structlog.get_logger(__name__)


def create_notification(
    recipient: Employee,
    notif_type: str,
    payload: dict,
    conversation_id: int = None,
    deliver_ws: bool = True,
) -> Notification:
    """
    Persist a notification and optionally deliver it via WebSocket.
    """
    notification = Notification.objects.create(
        recipient=recipient,
        type=notif_type,
        payload=payload,
        conversation_id=conversation_id,
    )

    if deliver_ws:
        _deliver_via_ws(notification)

    return notification


def _deliver_via_ws(notification: Notification):
    """Send a live notification to the recipient's WebSocket connection."""
    try:
        channel_layer = get_channel_layer()
        user_group = f"user_{notification.recipient.pk}"
        async_to_sync(channel_layer.group_send)(
            user_group,
            {
                "type": "notification.new",
                "notification": {
                    "id": notification.pk,
                    "type": notification.type,
                    "payload": notification.payload,
                    "conversation_id": notification.conversation_id,
                    "created_at": notification.created_at.isoformat(),
                    "is_read": notification.is_read,
                },
            },
        )
    except Exception as e:
        logger.warning("notification_ws_delivery_failed", notification_id=notification.pk, error=str(e))


def notify_new_message(conversation, message, exclude_employee_id: int = None):
    """
    Create new-message notifications for all active members of a conversation,
    excluding the message author.
    """
    from apps.conversations.models import ConversationMembership

    memberships = ConversationMembership.objects.filter(
        conversation=conversation,
        removed_at__isnull=True,
    ).select_related("employee")

    for membership in memberships:
        emp = membership.employee
        if emp.pk == exclude_employee_id or not emp.is_active:
            continue
        try:
            create_notification(
                recipient=emp,
                notif_type=NotificationType.NEW_MESSAGE,
                payload={
                    "conversation_id": conversation.pk,
                    "conversation_name": conversation.name or "Direct Message",
                    "author_id": message.author.pk if message.author else None,
                    "author_name": message.author.display_name if message.author else "Unknown",
                    # Only include a preview if policy permits; truncated to 80 chars
                    "preview": message.content[:80] if not message.is_deleted else "",
                },
                conversation_id=conversation.pk,
            )
        except Exception as e:
            logger.error("notify_new_message_error", employee_id=emp.pk, error=str(e))

