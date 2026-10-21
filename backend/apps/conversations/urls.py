"""
FortiConnect — Conversation URL Configuration
"""
from django.urls import path
from .views import (
    ArchiveConversationView,
    AttachmentDownloadView,
    ConversationDetailView,
    ConversationListCreateView,
    ConversationMemberDetailView,
    ConversationMembersView,
    LeaveConversationView,
    MarkConversationReadView,
    MessageDetailView,
    MessageListCreateView,
    PinMessageView,
    PresenceView,
    ToggleReactionView,
    TransferOwnershipView,
)

urlpatterns = [
    path("conversations/", ConversationListCreateView.as_view(), name="conversation-list"),
    path("conversations/<int:pk>/", ConversationDetailView.as_view(), name="conversation-detail"),
    path("conversations/<int:pk>/archive/", ArchiveConversationView.as_view(), name="conversation-archive"),
    path("conversations/<int:pk>/transfer-ownership/", TransferOwnershipView.as_view(), name="conversation-transfer-ownership"),
    path("conversations/<int:pk>/read/", MarkConversationReadView.as_view(), name="conversation-read"),
    path("conversations/<int:pk>/messages/", MessageListCreateView.as_view(), name="message-list"),
    path("conversations/<int:pk>/pin/<int:message_id>/", PinMessageView.as_view(), name="message-pin"),
    path("conversations/<int:pk>/members/", ConversationMembersView.as_view(), name="conversation-members"),
    path("conversations/<int:pk>/members/<int:member_id>/", ConversationMemberDetailView.as_view(), name="conversation-member-detail"),
    path("conversations/<int:pk>/leave/", LeaveConversationView.as_view(), name="conversation-leave"),
    path("messages/<int:pk>/", MessageDetailView.as_view(), name="message-detail"),
    path("messages/<int:pk>/reactions/", ToggleReactionView.as_view(), name="message-reactions"),
    path("attachments/<int:pk>/download/", AttachmentDownloadView.as_view(), name="attachment-download"),
    path("presence/<int:employee_id>/", PresenceView.as_view(), name="presence"),
]
