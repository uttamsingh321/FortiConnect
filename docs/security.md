# FortiConnect Security Architecture & Controls

## 1. Authentication & Session Management
- **Stateless Bearer JWTs**: Issued via `rest_framework_simplejwt`.
- **Token Claims**: Contains `user_id`, `employee_id`, and `display_name`.
- **Brute Force Protection**: IP-based rate limiting on `/api/auth/login/` (10 requests/minute).
- **Deactivation Enforcement**: Inactive employees cannot obtain tokens or subscribe to WebSocket channels.

## 2. Server-Side Authorization Invariants
- **Membership Verification**: Non-members attempting to access a conversation URL receive HTTP 404 (preventing ID enumeration).
- **No Client Spoofing**: WebSocket clients cannot specify arbitrary channel layer group names. All subscriptions are verified against database membership records.
- **Role Enforcement**: Only members with role `owner` or `admin` can add/remove members or edit group settings.

## 3. Data Protection
- **No Credentials Exposed**: User passwords, tokens, and internal database keys are explicitly excluded from all serializers.
- **CORS Lock**: Restricted strictly to authorized origins (`http://localhost:5173` in development).
- **Environment Isolation**: Production secrets and database URLs are loaded strictly from `.env` and never checked into Git.

