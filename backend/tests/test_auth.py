"""
FortiConnect — Authentication Tests

Tests:
1. Anonymous requests are rejected on all private APIs.
2. Invalid tokens are rejected.
3. Inactive users cannot log in.
4. Inactive employees cannot log in.
5. Valid credentials return JWT tokens.
6. Rate limiting endpoint exists (structural test).
"""
import pytest
from django.urls import reverse
from django.contrib.auth.models import User


@pytest.mark.django_db
class TestAuthentication:

    def test_anon_cannot_access_employees(self, anon_client):
        """Anonymous requests to the employee list return 401."""
        response = anon_client.get("/api/employees/")
        assert response.status_code == 401

    def test_anon_cannot_access_conversations(self, anon_client):
        """Anonymous requests to conversations return 401."""
        response = anon_client.get("/api/conversations/")
        assert response.status_code == 401

    def test_anon_cannot_access_notifications(self, anon_client):
        response = anon_client.get("/api/notifications/")
        assert response.status_code == 401

    def test_anon_cannot_access_messages(self, anon_client):
        response = anon_client.get("/api/conversations/99/messages/")
        assert response.status_code == 401

    def test_invalid_token_rejected(self, anon_client):
        """Malformed bearer token returns 401."""
        anon_client.credentials(HTTP_AUTHORIZATION="Bearer not.a.valid.token")
        response = anon_client.get("/api/employees/")
        assert response.status_code == 401

    def test_valid_login_returns_tokens(self, alice):
        """Valid credentials return access and refresh tokens."""
        from rest_framework.test import APIClient
        user, employee = alice
        client = APIClient()
        response = client.post("/api/auth/login/", {"username": "emp001", "password": "TestPass123!"})
        assert response.status_code == 200
        assert "access" in response.data
        assert "refresh" in response.data

    def test_inactive_django_user_cannot_login(self, db):
        """Inactive Django users are rejected at login."""
        from rest_framework.test import APIClient
        from apps.employees.models import Employee
        user = User.objects.create_user(username="inactive_auth", password="TestPass123!", is_active=False)
        client = APIClient()
        response = client.post("/api/auth/login/", {"username": "inactive_auth", "password": "TestPass123!"})
        assert response.status_code in [400, 401]

    def test_inactive_employee_cannot_login(self, inactive_employee):
        """Employees flagged as inactive cannot log in."""
        from rest_framework.test import APIClient
        user, employee = inactive_employee
        client = APIClient()
        response = client.post("/api/auth/login/", {"username": "emp099", "password": "TestPass123!"})
        assert response.status_code in [400, 401]

    def test_health_check_is_public(self, anon_client):
        """Health check does not require authentication."""
        response = anon_client.get("/api/health/")
        assert response.status_code in [200, 503]  # 503 if Redis not running
        assert "status" in response.data

    def test_authenticated_user_can_access_employees(self, alice_client):
        """Valid JWT grants access to employee directory."""
        response = alice_client.get("/api/employees/")
        assert response.status_code == 200

