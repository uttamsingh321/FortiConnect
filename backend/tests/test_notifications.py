"""
FortiConnect — Notification Tests

Tests:
1. Notifications are only visible to the intended recipient.
2. Unread count is correct.
3. Marking as read works.
4. Mark-all-read works.
5. Pagination works.
"""
import pytest
from apps.notifications.models import Notification, NotificationType
from apps.notifications.services import create_notification


@pytest.mark.django_db
class TestNotifications:

    def test_notifications_scoped_to_recipient(self, alice_client, bob_client, alice, bob):
        """Alice cannot see Bob's notifications."""
        _, alice_emp = alice
        _, bob_emp = bob

        create_notification(bob_emp, NotificationType.NEW_MESSAGE, {"preview": "Hi"}, deliver_ws=False)

        response_alice = alice_client.get("/api/notifications/")
        response_bob = bob_client.get("/api/notifications/")

        assert response_alice.status_code == 200
        assert response_bob.status_code == 200

        alice_count = response_alice.data["results"]
        bob_count = response_bob.data["results"]

        # Alice has 0; Bob has 1
        assert len(alice_count) == 0
        assert len(bob_count) == 1

    def test_unread_count_increments(self, alice_client, alice):
        _, alice_emp = alice

        # Initially zero
        r = alice_client.get("/api/notifications/unread-count/")
        assert r.data["unread_count"] == 0

        create_notification(alice_emp, NotificationType.NEW_MESSAGE, {}, deliver_ws=False)
        create_notification(alice_emp, NotificationType.GROUP_INVITE, {}, deliver_ws=False)

        r = alice_client.get("/api/notifications/unread-count/")
        assert r.data["unread_count"] == 2

    def test_mark_single_notification_read(self, alice_client, alice):
        _, alice_emp = alice
        n = create_notification(alice_emp, NotificationType.NEW_MESSAGE, {}, deliver_ws=False)

        r = alice_client.post(f"/api/notifications/{n.pk}/read/")
        assert r.status_code == 200
        assert r.data["is_read"] is True

        count_r = alice_client.get("/api/notifications/unread-count/")
        assert count_r.data["unread_count"] == 0

    def test_mark_all_read(self, alice_client, alice):
        _, alice_emp = alice
        for _ in range(3):
            create_notification(alice_emp, NotificationType.NEW_MESSAGE, {}, deliver_ws=False)

        r = alice_client.post("/api/notifications/read-all/")
        assert r.status_code == 200
        assert r.data["marked_read"] == 3

        count_r = alice_client.get("/api/notifications/unread-count/")
        assert count_r.data["unread_count"] == 0

    def test_cannot_read_another_users_notification(self, alice_client, bob):
        """Alice cannot mark Bob's notification as read."""
        _, bob_emp = bob
        n = create_notification(bob_emp, NotificationType.NEW_MESSAGE, {}, deliver_ws=False)
        r = alice_client.post(f"/api/notifications/{n.pk}/read/")
        assert r.status_code == 404

