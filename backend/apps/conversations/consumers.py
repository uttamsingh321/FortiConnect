"""
FortiConnect — WebSocket Consumer

Handles authenticated WebSocket connections for real-time messaging
and presence updates.

Security invariants:
- Connection is rejected if the user is not authenticated.
- Group name is derived server-side from a validated conversation ID.
- Client cannot supply arbitrary channel group names.
- Membership is re-checked on every subscribe action.
- Messages are never trusted from the client without validation.
- Reconnection triggers a fresh membership check.
"""
import json
from datetime import datetime, timezone as dt_timezone

import structlog
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone

logger = structlog.get_logger(__name__)

# Maximum incoming message payload size (bytes)
MAX_PAYLOAD_SIZE = 8192

# Presence TTL in seconds (heartbeat keeps it alive)
PRESENCE_TTL = 90


class ChatConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer that manages:
    - Authentication (enforced via JWTAuthMiddleware in ASGI routing)
    - Conversation subscription / unsubscription
    - Real-time message delivery
    - Presence heartbeat
    """

    async def connect(self):
        user = self.scope.get("user")

        if not user or not user.is_authenticated:
            logger.warning("ws_rejected_unauthenticated")
            await self.close(code=4001)
            return

        self.user = user
        self.subscribed_groups = set()

        try:
            self.employee = await self._get_employee(user)
        except Exception:
            logger.warning("ws_rejected_no_employee", user_id=user.pk)
            await self.close(code=4003)
            return

        if not self.employee.is_active:
            logger.warning("ws_rejected_inactive_employee", user_id=user.pk)
            await self.close(code=4003)
            return

        await self.accept()
        await self._set_presence("online")

        logger.info("ws_connected", user_id=user.pk, employee_id=self.employee.pk)

        # Notify the client of successful connection
        await self.send(json.dumps({"type": "connection.established", "employee_id": self.employee.pk}))

    async def disconnect(self, close_code):
        # Leave all subscribed channel groups
        for group_name in list(self.subscribed_groups):
            await self.channel_layer.group_discard(group_name, self.channel_name)

        if hasattr(self, "employee"):
            await self._set_presence("offline")
            logger.info("ws_disconnected", employee_id=self.employee.pk, code=close_code)

    async def receive(self, text_data=None, bytes_data=None):
        # Enforce maximum payload size
        if text_data and len(text_data) > MAX_PAYLOAD_SIZE:
            await self._send_error("Payload too large.")
            return

        try:
            data = json.loads(text_data or "{}")
        except (json.JSONDecodeError, ValueError):
            await self._send_error("Invalid JSON payload.")
            return

        msg_type = data.get("type")

        if msg_type == "subscribe":
            await self._handle_subscribe(data)
        elif msg_type == "unsubscribe":
            await self._handle_unsubscribe(data)
        elif msg_type == "heartbeat":
            await self._handle_heartbeat()
        elif msg_type == "typing.start" or msg_type == "typing.stop":
            await self._handle_typing(data, msg_type)
        elif msg_type.startswith("call."):
            await self._handle_call_signal(data)
        else:
            await self._send_error(f"Unknown message type: {msg_type}")

    async def _handle_subscribe(self, data):
        """Subscribe to real-time updates for a conversation."""
        conversation_id = data.get("conversation_id")
        if not isinstance(conversation_id, int):
            await self._send_error("conversation_id must be an integer.")
            return

        # Server-side membership check — never trust the client
        is_member = await self._check_membership(conversation_id)
        if not is_member:
            await self._send_error("Not a member of that conversation.", code="not_member")
            return

        group_name = f"conversation_{conversation_id}"
        if group_name not in self.subscribed_groups:
            await self.channel_layer.group_add(group_name, self.channel_name)
            self.subscribed_groups.add(group_name)

        await self.send(json.dumps({
            "type": "subscribed",
            "conversation_id": conversation_id,
        }))

    async def _handle_unsubscribe(self, data):
        conversation_id = data.get("conversation_id")
        if not isinstance(conversation_id, int):
            return
        group_name = f"conversation_{conversation_id}"
        if group_name in self.subscribed_groups:
            await self.channel_layer.group_discard(group_name, self.channel_name)
            self.subscribed_groups.discard(group_name)

    async def _handle_heartbeat(self):
        """Refresh presence TTL."""
        await self._set_presence("online")
        await self.send(json.dumps({"type": "heartbeat.ack"}))

    async def _handle_typing(self, data, msg_type):
        """Broadcast typing indicator to conversation members."""
        conversation_id = data.get("conversation_id")
        if not isinstance(conversation_id, int):
            return

        group_name = f"conversation_{conversation_id}"
        if group_name not in self.subscribed_groups:
            return  # Must be subscribed to broadcast

        await self.channel_layer.group_send(
            group_name,
            {
                "type": "chat.typing",
                "employee_id": self.employee.pk,
                "display_name": self.employee.display_name,
                "is_typing": msg_type == "typing.start",
                "conversation_id": conversation_id,
            },
        )

    async def _handle_call_signal(self, data):
        """Relay WebRTC signaling messages (offer, answer, ice-candidate, end) to conversation participants."""
        conversation_id = data.get("conversation_id")
        if not isinstance(conversation_id, int):
            return

        group_name = f"conversation_{conversation_id}"
        if group_name not in self.subscribed_groups:
            # Auto-check membership
            is_member = await self._check_membership(conversation_id)
            if not is_member:
                return

        # Broadcast signal to other members in this conversation
        await self.channel_layer.group_send(
            group_name,
            {
                "type": "call.signal",
                "sender_id": self.employee.pk,
                "sender_name": self.employee.display_name,
                "signal_data": data,
                "conversation_id": conversation_id,
            },
        )

    # -----------------------------------------------------------------------
    # Channel layer event handlers (called by channel layer group_send)
    # -----------------------------------------------------------------------

    async def call_signal(self, event):
        """Deliver WebRTC signaling events, excluding the sender itself."""
        if event.get("sender_id") == self.employee.pk:
            return
        await self.send(json.dumps({
            "type": event["signal_data"].get("type"),
            "sender_id": event["sender_id"],
            "sender_name": event["sender_name"],
            "payload": event["signal_data"].get("payload"),
            "call_type": event["signal_data"].get("call_type", "video"),
            "conversation_id": event["conversation_id"],
        }))

    async def chat_message(self, event):
        """Deliver a new message to this WebSocket client."""
        await self.send(json.dumps({
            "type": "message.new",
            "message": event["message"],
        }))

    async def chat_typing(self, event):
        """Forward a typing indicator to this client."""
        await self.send(json.dumps({
            "type": event["type"],
            "employee_id": event["employee_id"],
            "display_name": event["display_name"],
            "is_typing": event["is_typing"],
            "conversation_id": event["conversation_id"],
        }))

    async def presence_update(self, event):
        """Deliver a presence update to this client."""
        await self.send(json.dumps({
            "type": "presence.update",
            "employee_id": event["employee_id"],
            "status": event["status"],
        }))

    async def notification_new(self, event):
        """Deliver a new notification to this client."""
        await self.send(json.dumps({
            "type": "notification.new",
            "notification": event["notification"],
        }))

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    async def _send_error(self, message: str, code: str = "error"):
        await self.send(json.dumps({"type": "error", "code": code, "message": message}))

    @database_sync_to_async
    def _get_employee(self, user):
        return user.employee

    @database_sync_to_async
    def _check_membership(self, conversation_id: int) -> bool:
        from .models import ConversationMembership
        return ConversationMembership.objects.filter(
            conversation_id=conversation_id,
            employee=self.employee,
            removed_at__isnull=True,
        ).exists()

    async def _set_presence(self, status: str):
        """Update presence in Redis."""
        try:
            import redis as redis_lib
            from django.conf import settings

            r = redis_lib.from_url(
                settings.CACHES["default"]["LOCATION"],
                decode_responses=False,
            )
            presence_key = f"presence:{self.employee.pk}"
            now = datetime.now(dt_timezone.utc).isoformat()
            r.hset(presence_key, mapping={
                "status": status,
                "last_seen_at": now,
            })
            if status == "online":
                r.expire(presence_key, PRESENCE_TTL)
            else:
                r.expire(presence_key, 86400)  # Keep offline record for 24h

            # Also update DB presence record
            await self._update_db_presence(status, now)
        except Exception as e:
            logger.warning("presence_redis_error", error=str(e))

    @database_sync_to_async
    def _update_db_presence(self, status: str, last_seen_at: str):
        from .models import PresenceRecord
        from django.utils import timezone
        PresenceRecord.objects.update_or_create(
            employee=self.employee,
            defaults={
                "status": status,
                "last_seen_at": timezone.now(),
            },
        )

