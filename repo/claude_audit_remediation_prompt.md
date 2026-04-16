# Claude Code Prompt: Test Coverage Remediation to 90+ (Strict, Coverage-Only)

You are acting as a strict backend test engineer in this repository.

Your only objective is to raise the Test Coverage Audit score to 90+.

Do not modify README or documentation unless absolutely required for test execution.
Focus only on backend/API/integration test coverage quality and sufficiency.

## Hard Constraints

- Prefer true no-mock HTTP tests.
- New endpoint-coverage tests must run through:
  - real app bootstrap
  - real HTTP layer
  - real middleware/auth/permissions
  - real services
  - real DB interactions
- Do not use `pool.execute = async ...` or `pool.getConnection = async ...` in new integration endpoint-coverage tests.
- Do not mock controllers/services/providers in execution path.
- Keep changes minimal and scoped to tests (and tiny helper code only if unavoidable).

## Current Required Gaps (Must Be Covered via HTTP)

Add true integration HTTP tests for these currently uncovered endpoints:

1. `POST /api/auth/users`
2. `GET /api/planning/mps/:planId/mrp`
3. `POST /api/planning/work-orders`
4. `POST /api/planning/plans/:planId/adjustments`
5. `POST /api/notifications/events`
6. `POST /api/notifications/dispatch`
7. `POST /api/rules/versions`
8. `POST /api/rules/score`
9. `POST /api/rules/versions/:id/recalculate`
10. `GET /api/hr/forms/application`

## Coverage/Quality Targets

- HTTP endpoint coverage: >= 95%
- True no-mock HTTP endpoint coverage: >= 85%
- Each endpoint above must have:
  - method + exact path tested
  - request input assertions (body/query/params relevance)
  - response body assertions (not only status)
  - at least one meaningful permission/failure case for critical routes

## Primary Files To Edit

- `integration_tests/db_integration.test.js` (preferred)
- If needed, add focused files under `integration_tests/` (e.g. `integration_tests/http_missing_endpoints.test.js`)
- Reuse existing helpers/patterns:
  - `startServer()`
  - `login()`
  - DB preflight/lifecycle handling patterns

Avoid touching existing mocked API tests unless needed to prevent duplication/confusion.

## Implementation Order (Do Exactly This)

1. Inspect route definitions in:
   - `backend/src/app.js`
   - `backend/src/routes/*.js`
2. Add integration HTTP tests for the 10 missing endpoints.
3. For each test:
   - login with seeded role that should pass
   - perform HTTP request
   - assert response structure/content
   - verify DB side effects where meaningful (created row, status change, audit log, etc.)
4. Add negative tests for auth/permission boundaries on sensitive routes.
5. Keep test data isolated:
   - use unique IDs/names per run (`Date.now()` suffix)
   - clean up only when necessary
6. Run targeted integration tests, then full suite.

## Commands to Run

Use these in order while iterating:

1. Targeted integration test file(s):
   - `node --test --test-concurrency=1 integration_tests/db_integration.test.js`
   - or your new integration file if you create one
2. Full project verification:
   - `./run_tests.sh`

Fix until green.

## What Done Looks Like

Your final response must include:

1. Files changed
2. Endpoint-by-endpoint mapping (all 33 endpoints) with classification:
   - true no-mock HTTP
   - HTTP with mocking
   - non-HTTP only
3. Coverage totals:
   - total endpoints
   - endpoints with HTTP tests
   - endpoints with true no-mock HTTP tests
   - percentages
4. Explicit statement that all 10 previously uncovered endpoints are now HTTP-covered
5. Remaining risks (if any)

If blocked from reaching 90+, provide:
- exact blocker
- smallest concrete follow-up patch to remove blocker
