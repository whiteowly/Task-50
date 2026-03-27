# ForgeOps Manufacturing & Workforce Hub

Offline-ready full-stack site for inbound receiving, production planning, and workforce onboarding.

## Stack

- Frontend: Vue 3 + Pinia + Vue Router (Vite)
- Backend: Koa REST APIs
- Database: MySQL
- Auth: JWT + server-side session table with idle timeout

## Implemented Modules

- Authentication and role-based workspace routing
- RBAC and ABAC middleware controls
- Dock scheduling in 30-minute windows with conflict checks
- PO receiving, inspection discrepancy handling, and receipt close validation
- Putaway recommendations with capacity and SKU+lot mixed-storage rule
- 12-week MPS and MRP calculation endpoint
- Work orders, event logging, plan adjustments, and supervisor approvals
- Candidate application intake, duplicate detection, and attachment classification
- Notification subscriptions, digests, DND handling, and in-app dispatch queue
- Offline connector message export queue with retry metadata
- Search endpoint with synonym expansion + metadata filters
- Immutable audit logging for create/update/approve actions
- Sensitive data encryption at rest and masked retrieval
- Versioned scoring rules and weighted GPA scoring with recalc backtracking flags

## Setup

1. Create a MySQL database named `forgeops`.
2. Apply `backend/schema.sql`, then `backend/seed.sql`.
3. Install backend deps:

```bash
cd backend
npm install
npm run start
```

4. Seed demo users:

```bash
node scripts/seed-users.js
```

5. Install frontend deps and run:

```bash
cd ../frontend
npm install
npm run dev
```

Default backend URL is `http://localhost:4000`.
