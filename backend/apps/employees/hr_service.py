"""
FortiConnect — HR/XHR Integration Service Layer

This module defines the interface for synchronizing employee data from the
company HR/XHR system. The concrete implementation is a stub using local
synthetic data until the real HR system integration is approved and configured.

Integration boundary design principles:
- This service is the ONLY place that communicates with the HR system.
- Employee data flows in one direction: HR system → FortiConnect.
- Authentication credentials are NEVER copied from the HR system.
- Employee IDs from the HR system are stored as-is in Employee.employee_id.

To implement a real HR integration, subclass HRSyncService and override
the abstract methods, then register the concrete class in settings.
"""
import abc
import structlog
from typing import Any

logger = structlog.get_logger(__name__)


class HREmployeeRecord:
    """Data transfer object for an employee record from the HR system."""

    def __init__(
        self,
        employee_id: str,
        display_name: str,
        email: str,
        department: str = "",
        title: str = "",
        phone: str = "",
        location: str = "",
        is_active: bool = True,
        employment_status: str = "active",
    ):
        self.employee_id = employee_id
        self.display_name = display_name
        self.email = email
        self.department = department
        self.title = title
        self.phone = phone
        self.location = location
        self.is_active = is_active
        self.employment_status = employment_status


class HRSyncService(abc.ABC):
    """
    Abstract base class for HR/XHR employee synchronization.

    Required HR/XHR API capabilities (to be determined with sysadmin):
    - List all active employees (or delta since last sync)
    - Retrieve a single employee by stable ID
    - Receive change notifications (webhook or polling)
    - Authentication: API key, OAuth2 client credentials, or similar

    Questions for HR system administrator:
    1. What authentication method is supported? (API key, OAuth2, SAML, OIDC?)
    2. What is the stable employee identifier format?
    3. Is there a REST or SOAP API? What is the base URL?
    4. Is there an OpenID Connect discovery document?
    5. What fields are available per employee?
    6. Are change-notification webhooks supported?
    7. What are the data retention and export policies?
    8. Are there data residency or access control requirements?
    """

    @abc.abstractmethod
    def list_employees(self) -> list[HREmployeeRecord]:
        """Return all employee records from the HR system."""
        ...

    @abc.abstractmethod
    def get_employee(self, employee_id: str) -> HREmployeeRecord | None:
        """Return a single employee record by HR ID, or None if not found."""
        ...

    def sync_all(self) -> dict[str, int]:
        """
        Synchronize all employees from HR into FortiConnect.
        Returns counts: created, updated, deactivated, errors.
        """
        from .models import Employee, EmploymentStatus

        records = self.list_employees()
        counts = {"created": 0, "updated": 0, "deactivated": 0, "errors": 0}

        seen_ids = set()
        for record in records:
            seen_ids.add(record.employee_id)
            try:
                employee, created = Employee.objects.update_or_create(
                    employee_id=record.employee_id,
                    defaults={
                        "display_name": record.display_name,
                        "email": record.email,
                        "department": record.department,
                        "title": record.title,
                        "phone": record.phone,
                        "location": record.location,
                        "is_active": record.is_active,
                        "employment_status": record.employment_status,
                    },
                )
                if created:
                    counts["created"] += 1
                else:
                    counts["updated"] += 1
            except Exception as e:
                logger.error("hr_sync_employee_error", employee_id=record.employee_id, error=str(e))
                counts["errors"] += 1

        logger.info("hr_sync_complete", **counts)
        return counts


class SyntheticHRSyncService(HRSyncService):
    """
    Development stub that returns synthetic employee records.
    NEVER used in production.
    """

    SYNTHETIC_EMPLOYEES = [
        HREmployeeRecord("EMP001", "Alice Chen", "alice.chen@forticonnect.dev", "Engineering", "Senior Engineer", "+1-555-0101", "New York", True, "active"),
        HREmployeeRecord("EMP002", "Bob Martinez", "bob.martinez@forticonnect.dev", "Engineering", "Staff Engineer", "+1-555-0102", "San Francisco", True, "active"),
        HREmployeeRecord("EMP003", "Carol Williams", "carol.williams@forticonnect.dev", "Product", "Product Manager", "+1-555-0103", "Austin", True, "active"),
        HREmployeeRecord("EMP004", "David Kim", "david.kim@forticonnect.dev", "Design", "UX Designer", "+1-555-0104", "Seattle", True, "active"),
        HREmployeeRecord("EMP005", "Eva Patel", "eva.patel@forticonnect.dev", "Security", "Security Engineer", "+1-555-0105", "London", True, "active"),
        HREmployeeRecord("EMP006", "Frank Zhang", "frank.zhang@forticonnect.dev", "HR", "HR Manager", "+1-555-0106", "Chicago", True, "active"),
        HREmployeeRecord("EMP007", "Grace Okafor", "grace.okafor@forticonnect.dev", "Finance", "Finance Analyst", "+1-555-0107", "Lagos", True, "active"),
        HREmployeeRecord("EMP008", "Henry Schmidt", "henry.schmidt@forticonnect.dev", "Engineering", "Backend Engineer", "+1-555-0108", "Berlin", True, "active"),
        HREmployeeRecord("EMP009", "Iris Tanaka", "iris.tanaka@forticonnect.dev", "Marketing", "Marketing Lead", "+1-555-0109", "Tokyo", True, "active"),
        HREmployeeRecord("EMP010", "James O'Brien", "james.obrien@forticonnect.dev", "Engineering", "DevOps Engineer", "+1-555-0110", "Dublin", True, "active"),
        HREmployeeRecord("EMP011", "Karen Johansson", "karen.johansson@forticonnect.dev", "Legal", "Legal Counsel", "+1-555-0111", "Stockholm", False, "inactive"),
        HREmployeeRecord("EMP012", "Leo Nguyen", "leo.nguyen@forticonnect.dev", "Engineering", "Frontend Engineer", "+1-555-0112", "Ho Chi Minh City", True, "active"),
    ]

    def list_employees(self) -> list[HREmployeeRecord]:
        return self.SYNTHETIC_EMPLOYEES

    def get_employee(self, employee_id: str) -> HREmployeeRecord | None:
        for emp in self.SYNTHETIC_EMPLOYEES:
            if emp.employee_id == employee_id:
                return emp
        return None

