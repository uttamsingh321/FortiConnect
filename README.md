# FortiConnect

A secure, company-hosted global communication platform for employees.

## Features
- **Secure Authentication**: JWT with brute-force rate-limiting and session revocation.
- **Employee Directory**: Synced via HR integration boundary, searchable with granular privacy controls.
- **Direct & Group Conversations**: Server-enforced role access controls (Owner, Admin, Member).
- **Real-Time Collaboration**: Powered by Django Channels (WebSockets) & Redis.
- **In-App Notifications**: Real-time persistent notifications with unread counts.
- **Clean Architecture**: Modular monolith designed to scale to 1M registered users.

---

## Prerequisites
- **Python**: 3.12+ (tested on Python 3.14)
- **Node.js**: v20+ & npm 10+
- **PostgreSQL**: 16+ (installed and running locally)
- **Redis**: 7+ (for WebSockets & presence)

---

## Getting Started

### 1. Database Setup
Run the initialization script using `psql`:
```bash
psql -U postgres -f scripts/init_db.sql
```
This creates:
- User: `forticonnect_user` (password: `forticonnect_pass`)
- Databases: `forticonnect_dev`, `forticonnect_test`

### 2. Backend Setup
```bash
cd backend
pip install -r requirements-dev.txt

# Copy environment template if not present
cp .env.example .env

# Apply migrations
python manage.py migrate

# Seed synthetic development employees
python manage.py seed_synthetic_employees

# Run the backend server (with WebSockets via Daphne/ASGI)
python manage.py runserver
```

Development Accounts:
- `emp001` to `emp012`
- Passwords: `<username>Pass123!` (e.g. `emp001Pass123!`)
- Note: `emp011` is inactive and used to verify login rejection rules.

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Running Automated Tests
Run the backend test suite:
```bash
cd backend
python -m pytest tests/ -v
```
All 43 unit and security integration tests execute in <2 seconds.

---

## Documentation
- [Architecture & Domain Boundaries](docs/architecture.md)
- [Security Controls & Authorization](docs/security.md)
- [HR / XHR Integration Guide](docs/hr-integration.md)
- [Roadmap & Future Phases](docs/roadmap.md)
