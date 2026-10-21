"""
FortiConnect — Test Fixtures and Helpers

Provides shared fixtures for all test modules.
"""
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.employees.models import Employee, EmploymentStatus
from apps.conversations.models import Conversation, ConversationMembership, ConversationType, MemberRole


def make_employee(employee_id, display_name, email, department="Engineering",
                  is_active=True, status=EmploymentStatus.ACTIVE):
    """Helper to create a User + Employee pair."""
    username = employee_id.lower()
    user = User.objects.create_user(
        username=username,
        email=email,
        password="TestPass123!",
        is_active=is_active,
    )
    employee = Employee.objects.create(
        employee_id=employee_id,
        user=user,
        display_name=display_name,
        email=email,
        department=department,
        is_active=is_active,
        employment_status=status,
    )
    return user, employee


def get_tokens_for_user(user):
    """Return JWT access token string for a user."""
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token)


def auth_client(user):
    """Return an authenticated APIClient for a user."""
    client = APIClient()
    token = get_tokens_for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def alice(db):
    user, employee = make_employee("EMP001", "Alice Chen", "alice@test.dev")
    return user, employee


@pytest.fixture
def bob(db):
    user, employee = make_employee("EMP002", "Bob Martinez", "bob@test.dev")
    return user, employee


@pytest.fixture
def carol(db):
    user, employee = make_employee("EMP003", "Carol Williams", "carol@test.dev", department="Product")
    return user, employee


@pytest.fixture
def inactive_employee(db):
    user, employee = make_employee(
        "EMP099", "Inactive User", "inactive@test.dev",
        is_active=False, status=EmploymentStatus.INACTIVE
    )
    return user, employee


@pytest.fixture
def alice_client(alice):
    user, _ = alice
    return auth_client(user)


@pytest.fixture
def bob_client(bob):
    user, _ = bob
    return auth_client(user)


@pytest.fixture
def carol_client(carol):
    user, _ = carol
    return auth_client(user)


@pytest.fixture
def anon_client():
    return APIClient()


@pytest.fixture
def direct_conversation(alice, bob, db):
    """Create a DM between Alice and Bob."""
    _, alice_emp = alice
    _, bob_emp = bob
    conv = Conversation.objects.create(type=ConversationType.DIRECT)
    ConversationMembership.objects.create(conversation=conv, employee=alice_emp, role=MemberRole.MEMBER)
    ConversationMembership.objects.create(conversation=conv, employee=bob_emp, role=MemberRole.MEMBER)
    return conv


@pytest.fixture
def group_conversation(alice, bob, carol, db):
    """Create a group with Alice as owner, Bob and Carol as members."""
    _, alice_emp = alice
    _, bob_emp = bob
    _, carol_emp = carol
    conv = Conversation.objects.create(
        type=ConversationType.GROUP,
        name="Test Group",
        created_by=alice_emp,
    )
    ConversationMembership.objects.create(conversation=conv, employee=alice_emp, role=MemberRole.OWNER)
    ConversationMembership.objects.create(conversation=conv, employee=bob_emp, role=MemberRole.MEMBER)
    ConversationMembership.objects.create(conversation=conv, employee=carol_emp, role=MemberRole.MEMBER)
    return conv

