# FortiConnect Architecture Documentation

## 1. System Overview
FortiConnect is built as a **modular monolith** with clean, decoupled domain boundaries.

```
                           +------------------------+
                           |  React + Vite Frontend |
                           +-----------+------------+
                                       |
                 HTTP REST (JWT)       |       WebSockets (JWT query param)
                 /api/...              |       /ws/chat/?token=...
                                       v
                           +------------------------+
                           |   ASGI / Daphne Server |
                           +-----------+------------+
                                       |
          +----------------------------+----------------------------+
          |                                                         |
          v                                                         v
+--------------------+                                    +--------------------+
| Django REST App    |                                    | Django Channels    |
| (Modular Monolith) |                                    | (Consumers)        |
+---------+----------+                                    +---------+----------+
          |                                                         |
          +----------------------------+----------------------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
         +--------------------+                  +--------------------+
         | PostgreSQL         |                  | Redis              |
         | Durable Data Store |                  | Channel Layer &    |
         | (Auth, Messages,   |                  | Ephemeral Presence |
         | Directory, Notifs) |                  +--------------------+
         +--------------------+
```

## 2. Core Domains & Module Boundaries

### Identity & Authentication (`apps.identity`)
- Decoupled from direct HR credentials.
- Issues standard JSON Web Tokens (access: 60m, refresh: 7d).
- Rate limits authentication endpoints (10/min per IP via cache).
- Supplies `JWTAuthMiddleware` for WebSocket authentication over Django Channels.

### Employee Directory (`apps.employees`)
- Authoritative local cache of employee profile data.
- Linked to HR/XHR via stable `employee_id` field.
- Implements `HRSyncService` boundary for future one-way synchronization.
- Sensitive credentials or internal HR database fields are never stored or exposed.

### Conversations & Messaging (`apps.conversations`)
- Direct (1:1) and Group conversations.
- Strict server-side authorization: all querysets require explicit active membership in `ConversationMembership`.
- Messages are durably stored in PostgreSQL. WebSocket delivery is an optimistic real-time broadcast.
- Soft-deletion and message editing audit trails.

### Notifications (`apps.notifications`)
- In-app notification center for new messages, group invites, and member changes.
- Scoped strictly to the recipient employee.
- Supports unread counts, mark-single-read, and mark-all-read.

## 3. High-Scale Target Mapping (Future Evolution)
- **1,000,000 Users**: Horizontal read replicas on PostgreSQL, sharded message partitions by conversation ID.
- **50,000 Concurrent WebSockets**: Horizontally scaled Daphne worker nodes coordinated by distributed Redis Cluster.

