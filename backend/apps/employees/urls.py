"""
FortiConnect — Employee URL Configuration
"""
from django.urls import path
from .views import EmployeeDetailView, EmployeeListView, EmployeeMeView

urlpatterns = [
    path("employees/", EmployeeListView.as_view(), name="employee-list"),
    path("employees/me/", EmployeeMeView.as_view(), name="employee-me"),
    path("employees/<int:pk>/", EmployeeDetailView.as_view(), name="employee-detail"),
]

