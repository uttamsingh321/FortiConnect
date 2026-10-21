"""
FortiConnect — Conversation URL Configuration
"""
from django.urls import path
from .views import (
    ConversationDetailView,
    ConversationListCreateView,
    ConversationMemberDetailView,
    ConversationMembersView,
    LeaveConversationView,
    MessageDetailView,
    MessageListCreateView,
    PresenceView,
)

urlpatterns = [
    path("conversations/", ConversationListCreateView.as_view(), name="conversation-list"),
    path("conversations/<int:pk>/", ConversationDetailView.as_view(), name="conversation-detail"),
    path("conversations/<int:pk>/messages/", MessageListCreateView.as_view(), name="message-list"),
    path("conversations/<int:pk>/members/", ConversationMembersView.as_view(), name="conversation-members"),
    path("conversations/<int:pk>/members/<int:member_id>/", ConversationMemberDetailView.as_view(), name="conversation-member-detail"),
    path("conversations/<int:pk>/leave/", LeaveConversationView.as_view(), name="conversation-leave"),
    path("messages/<int:pk>/", MessageDetailView.as_view(), name="message-detail"),
    path("presence/<int:employee_id>/", PresenceView.as_view(), name="presence"),
]

