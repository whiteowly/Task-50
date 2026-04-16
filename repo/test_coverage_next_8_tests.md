# Next 8 Integration Tests to Push Coverage Score Above 90

Goal: convert high-value mocked HTTP coverage into true no-mock HTTP coverage in `integration_tests/`.

## 1) GET /api/dashboard (ADMIN success)

- Login as `admin`
- Call `GET /api/dashboard`
- Assert `200`
- Assert body has `role: "ADMIN"` and `widgets.activeWorkOrders` + `widgets.candidates` as numbers
- Optional DB cross-check: compare counts from `work_orders` and `candidates`

## 2) GET /api/dashboard (INTERVIEWER restricted)

- Login as `interviewer1`
- Call `GET /api/dashboard`
- Assert `200`
- Assert body has `role: "INTERVIEWER"`
- Assert `widgets.candidates === null` (role-based redaction)

## 3) POST /api/receiving/dock-appointments (success)

- Login as `clerk1`
- Create a unique 30-minute window payload with `siteId: 1`
- Call `POST /api/receiving/dock-appointments`
- Assert `200` and response contains created id
- DB verify row exists with submitted `po_number`, `start_at`, `end_at`

## 4) POST /api/receiving/putaway/recommend (success + isolation)

- SQL setup: insert an inventory location for site 1 with free capacity and matching sku/lot rules
- Login as `clerk1`
- Call `POST /api/receiving/putaway/recommend` with `siteId: 1`
- Assert `200` and response contains `locationId`
- Negative in same test block: call with `siteId: 2` and assert `403`

## 5) POST /api/planning/work-orders/:id/events (validation failure)

- Login as `admin`
- SQL/setup: create plan + work order at site 1
- Call `POST /api/planning/work-orders/:id/events` with `eventType: "DOWNTIME"` and empty `reasonCode`
- Assert `400`
- Assert error includes downtime/reason requirement text

## 6) POST /api/planning/adjustments/:id/approve (success)

- Login as `admin` (or supervisor role with permission)
- Create plan via `/api/planning/mps`
- Create pending adjustment via `/api/planning/plans/:planId/adjustments`
- Call `POST /api/planning/adjustments/:id/approve`
- Assert `200`, response includes approved status/updated plan fields
- DB verify `plan_adjustments.status = 'APPROVED'`

## 7) GET /api/hr/candidates/:id (masking behavior)

- Login as `hr1`
- SQL/setup: insert candidate row with encrypted `dob_enc` and `ssn_last4_enc`
- Call `GET /api/hr/candidates/:id`
- Assert `200`
- Assert returned `dob` and `ssnLast4` are visible for permissioned actor
- Negative variant: login as assigned interviewer/candidate context and assert masked form if applicable

## 8) GET /api/audit + GET /api/notifications (real, non-mocked)

Use one combined test file section with two requests:

- **Part A: audit**
  - Login as `admin`
  - Insert a known audit row containing sensitive keys in `before_value/after_value`
  - Call `GET /api/audit?page=1&pageSize=20`
  - Assert `200`, `total >= 1`, and sensitive values are masked when permission context requires masking

- **Part B: notifications list**
  - Login as `hr1`
  - Insert one notification for that user id
  - Call `GET /api/notifications?page=1&pageSize=20`
  - Assert `200`, `data` array present, and listed rows are scoped to authenticated user

---

## Placement Recommendation

- Add these to `integration_tests/http_missing_endpoints.test.js` OR create `integration_tests/http_deep_no_mock.test.js`.
- Reuse existing helpers (`startServer`, `login`, `integrationPoolLifecycle`).
- Keep test data unique with `Date.now()` suffix to avoid collisions.

## Why These 8

These endpoints are currently represented mostly by mocked HTTP tests and carry high weight for strict "true no-mock" scoring. Converting them to real integration tests should move true no-mock coverage from ~60% toward the 85% target needed for a 90+ audit score.
