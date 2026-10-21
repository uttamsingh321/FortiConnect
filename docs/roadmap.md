# FortiConnect Engineering Roadmap

## Completed Milestones
### Phase 1: Secure Foundation MVP
- [x] Django 6 + DRF backend setup.
- [x] Decoupled Employee model with synthetic HR sync adapter.
- [x] JWT authentication with rate-limited login.
- [x] Employee directory search and listing.
- [x] Direct (1:1) messaging with server-side authorization.
- [x] 43 comprehensive automated tests covering auth, directory, messaging, and permissions.
- [x] Responsive React + TypeScript + Vite frontend.

### Phase 2: Real-Time Collaboration & Presence
- [x] Django Channels WebSocket layer with custom `JWTAuthMiddleware`.
- [x] Real-time message broadcast (`chat.message`).
- [x] Group conversation support with Owner / Admin / Member roles.
- [x] Ephemeral presence in Redis with fallback to PostgreSQL.
- [x] Persistent in-app notifications and WebSocket dispatch.
- [x] Full end-to-end frontend integration for Chat, Groups, and Directory.

## Future Milestones
### Phase 3: Files, Governance & Search
- Secure file sharing via S3-compatible pre-signed URLs.
- Full-text search with PostgreSQL tsvector.
- 5-year retention enforcement policies and legal holds.

### Phase 4: Voice, Video & Meetings
- WebRTC signaling via Channels.
- Selective Forwarding Unit (SFU) integration (LiveKit / Janus).
- Screen sharing & meeting recording compliance.

### Phase 5: Internal AI Assistant
- Permission-aware RAG pipeline.
- Contextual conversation summaries without data leakage.

### Phase 6: Global Deployment & High Scale
- Multi-region read replicas and load-tested WebSocket clusters for 50k peak concurrent users.

