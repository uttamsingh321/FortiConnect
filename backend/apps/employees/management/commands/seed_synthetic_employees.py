"""
Management command: seed_synthetic_employees

Creates synthetic employee records and corresponding Django auth users
for development. Uses the SyntheticHRSyncService.

Usage:
    python manage.py seed_synthetic_employees
    python manage.py seed_synthetic_employees --reset
"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.employees.hr_service import SyntheticHRSyncService
from apps.employees.models import Employee


class Command(BaseCommand):
    help = "Seed the database with synthetic employee records for development."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete all existing synthetic employees before seeding.",
        )

    def handle(self, *args, **options):
        if options["reset"]:
            count = Employee.objects.filter(employee_id__startswith="EMP").delete()
            self.stdout.write(self.style.WARNING(f"Deleted synthetic employees."))

        service = SyntheticHRSyncService()
        counts = service.sync_all()
        self.stdout.write(self.style.SUCCESS(
            f"HR sync complete: {counts['created']} created, {counts['updated']} updated, "
            f"{counts['errors']} errors."
        ))

        # Create Django auth users for each synthetic employee
        created_users = 0
        for record in service.SYNTHETIC_EMPLOYEES:
            try:
                employee = Employee.objects.get(employee_id=record.employee_id)
                if employee.user is None:
                    username = record.employee_id.lower()
                    user, user_created = User.objects.get_or_create(
                        username=username,
                        defaults={
                            "email": record.email,
                            "first_name": record.display_name.split()[0],
                            "last_name": " ".join(record.display_name.split()[1:]),
                            "is_active": record.is_active,
                        }
                    )
                    if user_created:
                        # Development password: employee_id lowercase + "Pass123!"
                        user.set_password(f"{username}Pass123!")
                        user.save()
                        created_users += 1

                    employee.user = user
                    employee.save(update_fields=["user"])
            except Exception as e:
                self.stderr.write(f"Error creating user for {record.employee_id}: {e}")

        self.stdout.write(self.style.SUCCESS(
            f"Created {created_users} Django auth users for synthetic employees."
        ))
        self.stdout.write("")
        self.stdout.write("Development login credentials:")
        self.stdout.write("  Username: emp001, emp002, ... emp012")
        self.stdout.write("  Password: emp001Pass123!, emp002Pass123!, ...")
        self.stdout.write("  (emp011 is inactive and cannot log in)")

