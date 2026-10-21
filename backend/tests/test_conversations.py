"""
FortiConnect — Conversation Authorization Tests

Critical security tests:
1. Non-members cannot access private conversations (returns 404, not 403).
2. Members can access their conversations.
3. Non-members cannot send messages to a conversation they don't belong to.
4. Changing the conversation ID does not bypass membership.
5. Inactive employees cannot send messages.
6. Group admin restrictions are enforced.
7. Removed members lose access.
8. Only the message author can edit/delete their message.
"""
import pytest
from apps.conversations.models import Message, ConversationType, MemberRole, ConversationMembership
from django.utils import timezone


@pytest.mark.django_db
class TestConversationAccess:

    def test_member_can_list_own_conversations(self, alice_client, direct_conversation):
        response = alice_client.get("/api/conversations/")
        assert response.status_code == 200
        ids = [c["id"] for c in response.data]
        assert direct_conversation.pk in ids

    def test_non_member_cannot_see_conversation(self, carol_client, direct_conversation):
        """Carol is not a member of the Alice-Bob DM — must get 404."""
        response = carol_client.get(f"/api/conversations/{direct_conversation.pk}/")
        assert response.status_code == 404

    def test_non_member_cannot_read_messages(self, carol_client, direct_conversation):
        """Carol cannot read Alice & Bob's messages."""
        response = carol_client.get(f"/api/conversations/{direct_conversation.pk}/messages/")
        assert response.status_code == 404

    def test_member_can_send_message(self, alice_client, direct_conversation):
        response = alice_client.post(
            f"/api/conversations/{direct_conversation.pk}/messages/",
            {"content": "Hello Bob!"},
        )
        assert response.status_code == 201
        assert response.data["content"] == "Hello Bob!"

    def test_non_member_cannot_send_message(self, carol_client, direct_conversation):
        """Carol cannot post to Alice & Bob's DM."""
        response = carol_client.post(
            f"/api/conversations/{direct_conversation.pk}/messages/",
            {"content": "I snuck in!"},
        )
        assert response.status_code == 404

    def test_changing_conversation_id_does_not_bypass_auth(self, carol_client, direct_conversation, group_conversation):
        """Carol is in the group but not the DM — DM access must still be denied."""
        # Verify Carol is in the group
        response_group = carol_client.get(f"/api/conversations/{group_conversation.pk}/")
        assert response_group.status_code == 200

        # Carol must NOT be able to access the DM by providing the DM id
        response_dm = carol_client.get(f"/api/conversations/{direct_conversation.pk}/messages/")
        assert response_dm.status_code == 404

    def test_empty_message_rejected(self, alice_client, direct_conversation):
        response = alice_client.post(
            f"/api/conversations/{direct_conversation.pk}/messages/",
            {"content": ""},
        )
        assert response.status_code == 400

    def test_oversized_message_rejected(self, alice_client, direct_conversation):
        response = alice_client.post(
            f"/api/conversations/{direct_conversation.pk}/messages/",
            {"content": "x" * 4001},
        )
        assert response.status_code == 400

    def test_message_list_is_scoped_to_member(self, alice_client, bob_client, direct_conversation):
        """Both Alice and Bob can read the same DM."""
        alice_client.post(
            f"/api/conversations/{direct_conversation.pk}/messages/",
            {"content": "Hi from Alice"},
        )
        response_alice = alice_client.get(f"/api/conversations/{direct_conversation.pk}/messages/")
        response_bob = bob_client.get(f"/api/conversations/{direct_conversation.pk}/messages/")
        assert response_alice.status_code == 200
        assert response_bob.status_code == 200

    def test_inactive_employee_cannot_send_message(self, inactive_employee, direct_conversation, db):
        """Inactive employee's JWT works but sending message is blocked."""
        from rest_framework.test import APIClient
        from tests.conftest import auth_client, make_employee
        from apps.conversations.models import ConversationMembership, MemberRole

        user, emp = inactive_employee
        # Force-add to conversation to test the send check separately from membership
        ConversationMembership.objects.create(
            conversation=direct_conversation, employee=emp, role=MemberRole.MEMBER
        )
        # Inactive user may still have a valid token (not expired yet)
        client = auth_client(user)
        response = client.post(
            f"/api/conversations/{direct_conversation.pk}/messages/",
            {"content": "I am inactive!"},
        )
        # Either 401 (if login is blocked) or 403 (inactive check)
        assert response.status_code in [401, 403, 404]


@pytest.mark.django_db
class TestGroupConversations:

    def test_create_group_conversation(self, alice_client, alice, bob):
        _, alice_emp = alice
        _, bob_emp = bob
        response = alice_client.post(
            "/api/conversations/",
            {
                "type": "group",
                "name": "Engineering Chat",
                "member_ids": [bob_emp.pk],
            },
            format="json",
        )
        assert response.status_code == 201
        assert response.data["name"] == "Engineering Chat"

    def test_non_admin_cannot_add_member(self, bob_client, group_conversation, db):
        """Bob (member) cannot add a new member to the group."""
        from apps.employees.models import Employee
        _, new_emp = __import__("tests.conftest", fromlist=["make_employee"]).make_employee(
            "EMP999", "New Person", "new@test.dev"
        )
        response = bob_client.post(
            f"/api/conversations/{group_conversation.pk}/members/",
            {"employee_id": new_emp.pk},
        )
        assert response.status_code == 403

    def test_admin_can_add_member(self, alice_client, group_conversation, db):
        """Alice (owner) can add a new member."""
        from tests.conftest import make_employee
        _, new_emp = make_employee("EMP998", "New Person 2", "new2@test.dev")
        response = alice_client.post(
            f"/api/conversations/{group_conversation.pk}/members/",
            {"employee_id": new_emp.pk},
        )
        assert response.status_code == 201

    def test_member_can_leave_group(self, bob_client, group_conversation):
        """Bob can leave the group."""
        response = bob_client.post(f"/api/conversations/{group_conversation.pk}/leave/")
        assert response.status_code == 204

    def test_removed_member_loses_access(self, alice_client, bob_client, group_conversation):
        """After Bob is removed, he cannot read messages."""
        # Alice removes Bob (find Bob's membership)
        members_response = alice_client.get(f"/api/conversations/{group_conversation.pk}/members/")
        assert members_response.status_code == 200
        bob_membership = next(
            m for m in members_response.data if m["employee"]["display_name"] == "Bob Martinez"
        )
        remove_response = alice_client.delete(
            f"/api/conversations/{group_conversation.pk}/members/{bob_membership['id']}/"
        )
        assert remove_response.status_code == 204

        # Bob should now get 404
        response = bob_client.get(f"/api/conversations/{group_conversation.pk}/messages/")
        assert response.status_code == 404

    def test_cannot_create_dm_with_self(self, alice_client, alice):
        _, alice_emp = alice
        response = alice_client.post(
            "/api/conversations/",
            {"type": "direct", "participant_employee_id": alice_emp.pk},
        )
        assert response.status_code == 400

    def test_duplicate_dm_returns_existing(self, alice_client, direct_conversation, bob):
        """Creating a DM with Bob when one already exists returns the existing one."""
        _, bob_emp = bob
        response = alice_client.post(
            "/api/conversations/",
            {"type": "direct", "participant_employee_id": bob_emp.pk},
        )
        # 200 = returned existing, not a new one
        assert response.status_code == 200
        assert response.data["id"] == direct_conversation.pk


@pytest.mark.django_db
class TestMessageEditDelete:

    def test_author_can_edit_message(self, alice_client, alice, direct_conversation):
        _, alice_emp = alice
        # Send a message as Alice
        msg_response = alice_client.post(
            f"/api/conversations/{direct_conversation.pk}/messages/",
            {"content": "Original content"},
        )
        msg_id = msg_response.data["id"]

        edit_response = alice_client.patch(f"/api/messages/{msg_id}/", {"content": "Edited content"})
        assert edit_response.status_code == 200
        assert edit_response.data["content"] == "Edited content"
        assert edit_response.data["edited_at"] is not None

    def test_non_author_cannot_edit_message(self, alice_client, bob_client, direct_conversation):
        """Bob cannot edit Alice's message."""
        msg_response = alice_client.post(
            f"/api/conversations/{direct_conversation.pk}/messages/",
            {"content": "Alice's message"},
        )
        msg_id = msg_response.data["id"]
        edit_response = bob_client.patch(f"/api/messages/{msg_id}/", {"content": "Bob edits!"})
        assert edit_response.status_code in [403, 404]

    def test_author_can_delete_message(self, alice_client, direct_conversation):
        msg_response = alice_client.post(
            f"/api/conversations/{direct_conversation.pk}/messages/",
            {"content": "To be deleted"},
        )
        msg_id = msg_response.data["id"]
        del_response = alice_client.delete(f"/api/messages/{msg_id}/")
        assert del_response.status_code == 204

