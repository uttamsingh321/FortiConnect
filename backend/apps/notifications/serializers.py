"""
FortiConnect — Notification Serializers
"""
from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "type", "payload", "conversation_id", "is_read", "created_at", "read_at"]
        read_only_fields = fields

