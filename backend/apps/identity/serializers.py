"""
FortiConnect Identity — Serializers

JWT token serializer that enriches the token payload with employee context.
"""
import structlog
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

logger = structlog.get_logger(__name__)


class FortiConnectTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Extends the default JWT serializer to:
    - Allow login with either username ('emp001') OR employee identifier ('EMP001') case-insensitively
    - Add employee_id claim to the token
    - Reject login for inactive employees
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Ensure username field accepts any string format
        self.fields[self.username_field].required = True

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Add custom claims
        token["username"] = user.username
        token["email"] = user.email

        # Add employee_id if profile exists
        try:
            employee = user.employee
            token["employee_id"] = str(employee.employee_id)
            token["display_name"] = employee.display_name
            token["department"] = employee.department
        except Exception:
            token["employee_id"] = None

        return token

    def validate(self, attrs):
        raw_username = attrs.get(self.username_field, "").strip()
        from django.contrib.auth import get_user_model
        from apps.employees.models import Employee

        User = get_user_model()

        # If user entered an employee ID (e.g. 'EMP001' or 'emp001'), find corresponding User
        user_obj = User.objects.filter(username__iexact=raw_username).first()
        if not user_obj:
            emp = Employee.objects.filter(employee_id__iexact=raw_username).select_related("user").first()
            if emp and emp.user:
                attrs[self.username_field] = emp.user.username
        elif user_obj:
            attrs[self.username_field] = user_obj.username

        data = super().validate(attrs)

        user = self.user
        # Reject inactive Django users
        if not user.is_active:
            logger.warning("login_rejected_inactive_user", username=user.username)
            from rest_framework import serializers
            raise serializers.ValidationError(
                {"detail": "This account has been deactivated. Contact your administrator."}
            )

        # Reject if employee profile is inactive
        try:
            employee = user.employee
            if not employee.is_active:
                logger.warning("login_rejected_inactive_employee", username=user.username)
                from rest_framework import serializers
                raise serializers.ValidationError(
                    {"detail": "Your employee account is inactive. Contact HR."}
                )
        except Exception as e:
            if "employee" not in str(e).lower():
                raise

        logger.info("login_success", username=user.username)
        return data

