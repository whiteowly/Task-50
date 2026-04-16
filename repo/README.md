# ForgeOps Manufacturing & Workforce Hub

Project type: **fullstack**.

Offline-ready fullstack platform for inbound receiving, production planning, and workforce onboarding.

## Startup (Docker-only)

From this `repo` directory, start the full stack with Docker Compose:

```bash
docker-compose up
```

If your Docker installation uses the v2 plugin command, this is equivalent:

```bash
docker compose up
```

No host runtime installation is required. The compose stack provisions schema/seed data and runs services in containers.

## Access

- Frontend UI: `http://localhost:5173`
- Backend API base: `http://localhost:4000/api`
- Health endpoint: `http://localhost:4000/api/health`

## Verification

Use both API-level and UI-level verification after `docker-compose up`.

1. API health check:

```bash
curl http://localhost:4000/api/health
```

Expected result:

```json
{"ok":true}
```

2. Web flow check:
- Open `http://localhost:5173`
- Confirm the login page is shown
- Sign in with one of the demo accounts below
- Confirm workspace loads and role label appears in the header

## Demo Credentials (All Roles)

Authentication is required.

| Role | Username | Password |
|---|---|---|
| ADMIN | `admin` | `AdminPassw0rd!` |
| CLERK | `clerk1` | `ClerkPassw0rd!` |
| PLANNER | `planner1` | `PlannerPassw0rd!` |
| HR | `hr1` | `HrRecruitPassw0rd!` |
| INTERVIEWER | `interviewer1` | `InterviewerPass!` |
| CANDIDATE | `candidate1` | `CandidatePassw0rd!` |

## Tech Stack

- Frontend: Vue 3, Pinia, Vue Router (served by Nginx)
- Backend: Koa REST API
- Database: MySQL 8.4
- Auth: JWT plus server-side session table with idle timeout
- Orchestration: Docker Compose

## Architecture Overview

- `frontend/`: UI application and end-user workflows
- `backend/`: API routes, middleware, domain services, persistence access
- `backend/schema.sql`, `backend/seed.sql`: schema and baseline seed data loaded by Compose DB init
- `unit_tests/`, `API_tests/`, `integration_tests/`, `frontend/tests/`: backend and frontend test suites

## Core Modules

- Authentication with RBAC/ABAC enforcement
- Receiving: dock windows, receipts, discrepancy controls, close validation, document uploads
- Planning: MPS/MRP, work orders, adjustment approvals
- HR: application intake, duplicate detection, attachment completeness/classification
- Notifications: subscriptions, DND scheduling, offline connector queue and retry policy
- Search and immutable audit trail with sensitive-data masking
- Versioned scoring rules and recalculation workflow

## Testing (Docker-only)

Run the unified test pipeline inside containers:

Linux/macOS/Git Bash:

```bash
./run_tests.sh
```

Windows PowerShell:

```powershell
.\run_tests.ps1
```

Notes:
- `run_tests.sh` executes unit, API, integration, frontend tests, and frontend build in Docker (`test-runner` service).
- `run_tests.ps1` provides the Windows-compatible wrapper for the same containerized flow.

## Security and Roles

- Sensitive candidate fields are masked unless explicit `SENSITIVE_DATA_VIEW` permission is present.
- Audit logs are immutable and role-scoped for read access.
- Candidate upload tokens are short-lived and single-use.
- API authorization is enforced through role and attribute checks.
