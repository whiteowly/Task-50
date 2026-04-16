# Minimal 6-Test Plan to Push Test Coverage Score Above 90

Goal: add only the highest-impact true no-mock HTTP integration tests needed to cross the 90+ threshold.

## 1) GET /api/search (real integration, site-scoped success)

- Login as `clerk1`.
- Insert one `search_documents` row for site 1 and one for site 2.
- Call `GET /api/search?q=<uniqueTerm>&page=1&pageSize=20`.
- Assert `200`.
- Assert only site 1 row is returned for clerk actor.

## 2) GET /api/search (auth boundary)

- Call `GET /api/search?q=test` without token.
- Assert `401` or `403`.

## 3) POST /api/hr/applications (real integration success)

- Login as `candidate1` (or role allowed by current backend rules).
- Submit complete application payload, including required dynamic fields.
- Assert `200`.
- Assert response includes `id`, `duplicateFlag`, and `attachmentCompleteness`.

## 4) POST /api/hr/applications/:id/attachments (real integration success)

- Use application created in test #3.
- Use returned `uploadToken` (if required by route policy).
- Submit multipart attachment (PDF/PNG, valid size).
- Assert `200`.
- Assert response includes attachment id/classification and updated completeness metadata.

## 5) POST /api/receiving/receipts/:id/documents + GET /api/receiving/receipts/:id/documents (real integration success)

- Login as `clerk1`.
- Create receipt via real endpoint.
- Upload a receipt document through `POST /api/receiving/receipts/:id/documents`.
- Assert `200` and response includes document id.
- List documents via `GET /api/receiving/receipts/:id/documents`.
- Assert `200`, array result, and expected metadata (`batch_no`, `title`, etc.).

## 6) POST /api/receiving/receipts/:id/documents (auth/permission failure)

- Attempt upload with no token OR cross-site actor.
- Assert `401`/`403`.

---

## Placement

- Append these tests to `integration_tests/http_missing_endpoints.test.js`.
- Reuse existing helpers:
  - `startServer()`
  - `login()`
  - `authHeaders()`
  - DB setup/cleanup style already used in integration tests

## Implementation Notes

- Use unique per-test values (`Date.now()`) to avoid collisions.
- Do not mock `pool.execute`/`pool.getConnection` in these new tests.
- Keep assertions non-shallow: verify response body plus key DB side effects where meaningful.

## Why This Works

These 6 tests cover the remaining high-value endpoints currently represented mostly by mocked API tests. Converting them to true no-mock integration coverage should raise true API coverage to roughly 90%+ and move the overall test audit score above 90.
