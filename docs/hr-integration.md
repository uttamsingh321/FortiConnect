# HR / XHR System Integration Specification

## 1. Overview
The company's internal HR/XHR system is the authoritative source for employee employment status, names, and departments.
FortiConnect maintains an explicit, one-way boundary:
`HR / XHR System ---> HRSyncService ---> Employee Model`

## 2. Security Boundaries
- **No Password Syncing**: FortiConnect **NEVER** imports or stores HR system passwords.
- **Stable ID Mapping**: Employees are uniquely mapped via `employee_id` (e.g. `EMP001`).
- **Account Deactivation**: When an employee is deactivated in HR, the synchronization service sets `is_active=False` in FortiConnect, immediately cutting access to login and messaging.

## 3. Outstanding Questions for HR Administrator
1. What protocol is supported? (REST API, Webhooks, LDAP, SCIM, OIDC, SAML 2.0?)
2. What authentication mechanism should FortiConnect use to poll the HR API? (mTLS, API Key, OAuth2 Client Credentials?)
3. What is the frequency/trigger for delta updates?
4. If authentication cannot be delegated to HR, can we deploy an enterprise Identity Provider (e.g., Keycloak)?

