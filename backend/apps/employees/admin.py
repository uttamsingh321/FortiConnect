from django.contrib import admin
from django.contrib.auth.models import User
from .models import Employee


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ["display_name", "employee_id", "department", "title", "employment_status", "is_active", "updated_at"]
    list_filter = ["is_active", "employment_status", "department"]
    search_fields = ["display_name", "employee_id", "email", "department"]
    readonly_fields = ["created_at", "updated_at", "last_synced_at"]
    ordering = ["display_name"]

    fieldsets = [
        ("Identity", {"fields": ["employee_id", "user", "is_active", "employment_status"]}),
        ("Profile", {"fields": ["display_name", "email", "department", "title", "phone", "location", "bio"]}),
        ("Timestamps", {"fields": ["created_at", "updated_at", "last_synced_at"]}),
    ]

