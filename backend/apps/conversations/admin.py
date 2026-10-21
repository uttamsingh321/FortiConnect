from django.contrib import admin
from .models import Conversation, ConversationMembership, Message, PresenceRecord


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ["id", "type", "name", "created_by", "is_archived", "created_at"]
    list_filter = ["type", "is_archived"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(ConversationMembership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ["conversation", "employee", "role", "joined_at", "removed_at"]
    list_filter = ["role"]
    raw_id_fields = ["conversation", "employee"]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ["id", "conversation", "author", "created_at", "deleted_at"]
    list_filter = ["deleted_at"]
    readonly_fields = ["created_at", "edited_at"]
    raw_id_fields = ["conversation", "author"]


@admin.register(PresenceRecord)
class PresenceRecordAdmin(admin.ModelAdmin):
    list_display = ["employee", "status", "last_seen_at"]
    list_filter = ["status"]

