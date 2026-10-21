"""
FortiConnect — Root URL Configuration
"""
from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenRefreshView

from apps.identity.views import FortiConnectTokenObtainPairView, LogoutView, HealthCheckView

urlpatterns = [
    # Admin
    path("admin/", admin.site.urls),

    # Health check (public)
    path("api/health/", HealthCheckView.as_view(), name="health"),

    # Authentication
    path("api/auth/login/", FortiConnectTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/logout/", LogoutView.as_view(), name="logout"),

    # Application APIs
    path("api/", include("apps.employees.urls")),
    path("api/", include("apps.conversations.urls")),
    path("api/", include("apps.notifications.urls")),
]

