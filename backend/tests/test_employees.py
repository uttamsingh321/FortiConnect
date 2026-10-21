"""
FortiConnect — Employee Directory Tests

Tests:
1. Authenticated employees can list the directory.
2. Search by name works.
3. Employee detail endpoint works.
4. /me endpoint returns own profile.
5. Inactive employees appear in directory but are marked inactive.
"""
import pytest


@pytest.mark.django_db
class TestEmployeeDirectory:

    def test_can_list_employees(self, alice_client, alice, bob):
        """Authenticated users can list all employees."""
        response = alice_client.get("/api/employees/")
        assert response.status_code == 200
        results = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        assert len(results) >= 2

    def test_search_by_name(self, alice_client, alice, bob):
        """Search by display name returns matching employees."""
        response = alice_client.get("/api/employees/?search=Alice")
        assert response.status_code == 200
        results = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        names = [e["display_name"] for e in results]
        assert any("Alice" in n for n in names)

    def test_search_by_employee_id(self, alice_client, alice):
        """Search by employee_id returns the matching employee."""
        response = alice_client.get("/api/employees/?search=EMP001")
        assert response.status_code == 200
        results = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        assert len(results) >= 1

    def test_employee_detail(self, alice_client, bob):
        """Can retrieve full employee profile by pk."""
        _, bob_emp = bob
        response = alice_client.get(f"/api/employees/{bob_emp.pk}/")
        assert response.status_code == 200
        assert response.data["display_name"] == "Bob Martinez"
        # Password-related fields must not be present
        assert "password" not in response.data
        assert "user" not in response.data

    def test_me_endpoint(self, alice_client, alice):
        """The /me endpoint returns the current user's own profile."""
        _, alice_emp = alice
        response = alice_client.get("/api/employees/me/")
        assert response.status_code == 200
        assert response.data["employee_id"] == "EMP001"

    def test_inactive_employee_visible_in_directory(self, alice_client, inactive_employee):
        """Inactive employees appear in the directory (marked inactive)."""
        _, inactive_emp = inactive_employee
        response = alice_client.get(f"/api/employees/{inactive_emp.pk}/")
        assert response.status_code == 200
        assert response.data["is_active"] is False

    def test_detail_does_not_expose_credentials(self, alice_client, bob):
        """Detail endpoint must not expose passwords or internal secrets."""
        _, bob_emp = bob
        response = alice_client.get(f"/api/employees/{bob_emp.pk}/")
        assert response.status_code == 200
        sensitive = ["password", "token", "secret", "key", "auth"]
        for field in sensitive:
            assert field not in response.data

    def test_anon_cannot_list_employees(self, anon_client):
        response = anon_client.get("/api/employees/")
        assert response.status_code == 401

