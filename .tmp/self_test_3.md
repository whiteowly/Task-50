# ForgeOps Manufacturing & Workforce Hub - Static Delivery Acceptance & Architecture Audit

## 1. Verdict
- **Overall conclusion:** **Partial Pass**
- The repository is a substantial full-stack delivery, but several material issues remain, including multiple **High** severity requirement/security defects.

## 2. Scope and Static Verification Boundary
- **Reviewed:** docs/config/manifests, backend route registration/auth/middleware/services/schema/seed, frontend router/store/views/composables/components/styles, unit/API/integration/frontend test files.
- **Not reviewed:** runtime execution behavior, browser UX in live environment, DB runtime behavior under real concurrency/timing, network/disconnected operation in execution.
- **Intentionally not executed:** project startup, Docker, tests, scripts, external integrations.
- **Manual verification required for:** true offline behavior on LAN, scheduler/time-based dispatch in wall-clock scenarios, real MySQL JSON/trigger behavior, end-user UI interaction quality.

## 3. Repository / Requirement Mapping Summary
- **Prompt core goal:** one offline-ready hub for receiving + planning + workforce onboarding with role-based workspaces and strong security/audit controls.
- **Mapped areas:**
  - AuthN/AuthZ/session: `backend/src/middleware/auth.js`, `backend/src/routes/auth-routes.js`
  - Receiving/planning/HR/notifications/search/rules/audit domain logic: `backend/src/services/*.js`
  - Data model/permissions/templates/audit immutability: `backend/schema.sql`, `backend/seed.sql`
  - Role-based Vue workspaces: `frontend/src/router.js`, `frontend/src/views/WorkspaceView.vue`
  - Static test evidence: `unit_tests`, `API_tests`, `integration_tests`, `frontend/tests`

## 4. Section-by-section Review

### 4.1 Hard Gates

#### 1.1 Documentation and static verifiability
- **Conclusion:** Pass
- **Rationale:** Clear startup/setup/test docs and coherent entry points are present and statically consistent.
- **Evidence:** `README.md:5`, `README.md:148`, `backend/src/server.js:1`, `frontend/src/main.js:1`, `backend/package.json:6`, `frontend/package.json:6`
- **Manual verification note:** Runtime correctness remains manual.

#### 1.2 Material deviation from Prompt
- **Conclusion:** Partial Pass
- **Rationale:** Most business flows align, but candidate workflows are exposed via unauthenticated endpoints, weakening the “users sign in and land on role-based workspaces” model.
- **Evidence:** `backend/src/routes/hr-routes.js:32`, `backend/src/routes/hr-routes.js:36`, `frontend/src/router.js:23`

### 4.2 Delivery Completeness

#### 2.1 Core requirements coverage
- **Conclusion:** Partial Pass
- **Rationale:** Core modules are implemented (receiving/planning/HR/search/notifications/rules), but at least one explicit requirement is only partially implemented: rule-version “backtracking recalculation” marks rows pending rather than recalculating scores.
- **Evidence:** `backend/src/services/receiving-service.js:21`, `backend/src/services/planning-service.js:45`, `backend/src/services/hr-service.js:102`, `backend/src/services/notification-service.js:96`, `backend/src/services/search-service.js:128`, `backend/src/services/rules-service.js:157`

#### 2.2 End-to-end 0->1 deliverable
- **Conclusion:** Pass
- **Rationale:** Complete project structure, schema, seeded roles/permissions, API surface, frontend workspaces, and test assets indicate full deliverable rather than snippet/demo.
- **Evidence:** `backend/schema.sql:1`, `backend/seed.sql:1`, `frontend/src/views/WorkspaceView.vue:176`, `README.md:1`, `API_tests/security_and_core_flows.api.test.js:1`

### 4.3 Engineering and Architecture Quality

#### 3.1 Structure and module decomposition
- **Conclusion:** Pass
- **Rationale:** Backend and frontend are modularized with clear responsibilities.
- **Evidence:** `backend/src/routes/receiving-routes.js:1`, `backend/src/services/receiving-service.js:1`, `backend/src/middleware/error-handler.js:4`, `frontend/src/composables/useReceivingWorkspace.js:1`, `frontend/src/components/workspace/ReceivingPanel.vue:1`

#### 3.2 Maintainability/extensibility
- **Conclusion:** Partial Pass
- **Rationale:** Core architecture is extensible, but some security and behavior-critical logic is fragile (in-memory upload token state, type-fragile site comparisons in receiving flow).
- **Evidence:** `backend/src/services/hr-service.js:15`, `backend/src/services/receiving-service.js:62`, `backend/src/routes/receiving-routes.js:19`

### 4.4 Engineering Details and Professionalism

#### 4.1 Error handling/logging/validation/API detail
- **Conclusion:** Partial Pass
- **Rationale:** Good baseline error handling and validation exist; however, audit masking path has unsafe parsing assumptions and repo contains committed static secrets/credentials.
- **Evidence:** `backend/src/middleware/error-handler.js:4`, `backend/src/utils/logger.js:1`, `backend/src/services/audit-query-service.js:65`, `docker-compose.yml:38`, `backend/.env.example:3`

#### 4.2 Product-like organization
- **Conclusion:** Pass
- **Rationale:** Overall shape resembles a real service/application with defined domain modules and persistence model.
- **Evidence:** `backend/src/services/planning-service.js:1`, `backend/src/services/notification-service.js:1`, `integration_tests/db_integration.test.js:60`

### 4.5 Prompt Understanding and Requirement Fit

#### 5.1 Business/semantic fit
- **Conclusion:** Partial Pass
- **Rationale:** Most semantics match Prompt (30-min dock windows, discrepancy close gates, MPS/MRP/work orders, DND/frequency, typo/synonym search), but key constraints are weakened by auth boundary mismatch and incomplete rule-change recalculation.
- **Evidence:** `backend/src/services/receiving-service.js:21`, `backend/src/services/receiving-service.js:176`, `backend/src/services/planning-service.js:171`, `backend/src/services/notification-service.js:15`, `backend/src/services/search-service.js:3`, `backend/src/services/rules-service.js:146`

### 4.6 Aesthetics (frontend-only/full-stack)

#### 6.1 Visual/interaction quality
- **Conclusion:** Partial Pass
- **Rationale:** Functional layout hierarchy, responsive behavior, and interactive controls exist, but visual/interaction polish is basic.
- **Evidence:** `frontend/src/styles.css:39`, `frontend/src/styles.css:125`, `frontend/src/components/workspace/WorkspaceSidebar.vue:28`, `frontend/src/components/workspace/SearchPanel.vue:19`
- **Manual verification note:** Final UX quality/accessibility requires browser review.

## 5. Issues / Suggestions (Severity-Rated)

### High

1) **Severity:** High  
   **Title:** HR candidate creation/upload endpoints are exposed without mandatory authentication  
   **Conclusion:** Fail  
   **Evidence:** `backend/src/routes/hr-routes.js:32`, `backend/src/routes/hr-routes.js:36`, `frontend/src/router.js:23`  
   **Impact:** Weakens role-based signed-in boundary and permits anonymous applicant record creation/upload attempts.  
   **Minimum actionable fix:** Require authenticated candidate/staff context for these endpoints, or explicitly implement a separately documented public-intake mode with strict abuse controls.

2) **Severity:** High  
   **Title:** Audit response masking can fail when JSON columns are returned as strings  
   **Conclusion:** Fail  
   **Evidence:** `backend/src/services/audit-query-service.js:65`, `backend/src/services/audit-query-service.js:66`, `backend/src/services/audit-service.js:22`  
   **Impact:** Sensitive values (DOB/SSN/password/token fields) may be exposed in audit API output for users lacking sensitive permission, depending on DB driver return shape.  
   **Minimum actionable fix:** Normalize and parse JSON payloads before recursive masking; add API tests for masked output with string-form JSON columns.

3) **Severity:** High  
   **Title:** Rule version backtracking does not perform actual score recalculation  
   **Conclusion:** Fail  
   **Evidence:** `backend/src/services/rules-service.js:135`, `backend/src/services/rules-service.js:157`, `backend/src/services/rules-service.js:160`  
   **Impact:** Requirement says backtracking recalculation when rule version changes; implementation only sets `recalculation_pending`, leaving weighted score/GPA/quality points stale.  
   **Minimum actionable fix:** Implement recomputation of affected scores using active rule version weights/policy and persist audited recalculated values.

4) **Severity:** High  
   **Title:** Static secrets and credentials are committed in tracked config/docs  
   **Conclusion:** Fail  
   **Evidence:** `docker-compose.yml:7`, `docker-compose.yml:38`, `docker-compose.yml:39`, `backend/.env.example:3`, `README.md:27`  
   **Impact:** Encourages insecure deployments and credential reuse risk.  
   **Minimum actionable fix:** Remove hardcoded secrets from tracked runtime config, require secret injection, and rotate demo defaults.

### Medium

5) **Severity:** Medium  
   **Title:** Receiving site authorization is type-fragile (`number` vs `string`)  
   **Conclusion:** Partial Fail  
   **Evidence:** `backend/src/routes/receiving-routes.js:19`, `backend/src/routes/receiving-routes.js:29`, `backend/src/services/receiving-service.js:62`, `frontend/src/components/workspace/ReceivingPanel.vue:65`  
   **Impact:** Valid same-site clerk actions can be rejected if `siteId` arrives as string (common from text inputs), causing functional failures in receiving flows.  
   **Minimum actionable fix:** Normalize IDs to numeric comparison (`Number(...)`) consistently in receiving authz checks.

6) **Severity:** Medium  
   **Title:** Candidate upload token replay protection is process-local only  
   **Conclusion:** Partial Fail  
   **Evidence:** `backend/src/services/hr-service.js:15`, `backend/src/services/hr-service.js:191`, `backend/src/services/hr-service.js:248`  
   **Impact:** Restart/multi-process deployment can undermine one-time token guarantees.  
   **Minimum actionable fix:** Persist token state in MySQL with atomic reserve/consume operations.

7) **Severity:** Medium  
   **Title:** Receipt document object-level isolation depends on specific role name  
   **Conclusion:** Suspected Risk  
   **Evidence:** `backend/src/services/receiving-service.js:274`, `backend/src/routes/receiving-routes.js:54`  
   **Impact:** If permissions are later granted to other non-admin roles, cross-site document access may become possible.  
   **Minimum actionable fix:** Apply site checks to all non-admin actors, not only `CLERK`.

8) **Severity:** Medium  
   **Title:** Security-critical API tests are heavily DB-mocked, reducing real integration assurance  
   **Conclusion:** Partial Fail  
   **Evidence:** `API_tests/security_and_core_flows.api.test.js:37`, `API_tests/authorization_and_isolation.api.test.js:22`, `integration_tests/db_integration.test.js:43`  
   **Impact:** Severe DB/query behavior regressions can escape detection while tests pass.  
   **Minimum actionable fix:** Add mandatory DB-backed security regression suite (authz/isolation/audit masking) in default CI path.

## 6. Security Review Summary

- **Authentication entry points:** **Partial Pass**  
  Password/session lock and idle checks are implemented (`backend/src/services/auth-service.js:26`, `backend/src/middleware/auth.js:31`), but HR intake/upload is not auth-required (`backend/src/routes/hr-routes.js:32`).

- **Route-level authorization:** **Partial Pass**  
  Most routes use `requireAuth` + permission middleware (`backend/src/routes/receiving-routes.js:17`, `backend/src/routes/planning-routes.js:16`, `backend/src/routes/audit-routes.js:7`); HR create/upload endpoints are exceptions.

- **Object-level authorization:** **Partial Pass**  
  Interviewer assignment and site-scoped planning checks exist (`backend/src/routes/hr-routes.js:71`, `backend/src/services/planning-service.js:25`), but receiving document site checks are role-fragile (`backend/src/services/receiving-service.js:274`).

- **Function-level authorization:** **Pass**  
  Sensitive mutation functions are generally permission-gated (`backend/src/middleware/auth.js:100`, `backend/src/routes/rules-routes.js:11`, `backend/src/routes/notification-routes.js:34`).

- **Tenant / user isolation:** **Partial Pass**  
  Search and key business actions are scoped by site/assignment (`backend/src/services/search-service.js:36`, `backend/src/services/receiving-service.js:166`, `backend/src/services/planning-service.js:11`), with caveats noted above.

- **Admin / internal / debug protection:** **Pass**  
  Static route review shows no obvious unguarded admin/debug mutation endpoints; public health endpoint appears intentional (`backend/src/app.js:32`).

## 7. Tests and Logging Review

- **Unit tests:** **Pass (existence), Partial Pass (depth/realism)**  
  Broad service/security coverage exists in unit tests.  
  Evidence: `unit_tests/auth_and_rbac.test.js:1`, `unit_tests/security_and_isolation.test.js:1`, `unit_tests/hr_and_transactions.test.js:1`

- **API / integration tests:** **Partial Pass**  
  Strong breadth exists, but many tests mock DB behavior; full DB integration is optional by env and not exhaustive for all high-risk paths.  
  Evidence: `API_tests/security_and_core_flows.api.test.js:37`, `integration_tests/db_integration.test.js:11`, `integration_tests/db_integration.test.js:43`

- **Logging categories / observability:** **Pass**  
  Structured logger categories and centralized error handling are implemented.  
  Evidence: `backend/src/utils/logger.js:22`, `backend/src/middleware/error-handler.js:21`

- **Sensitive-data leakage risk in logs / responses:** **Partial Pass**  
  Logger redaction is present (`backend/src/utils/logger.js:1`), but audit response masking has a high-risk parse-path gap (`backend/src/services/audit-query-service.js:65`).

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- **Unit tests:** present (`unit_tests/*.test.js`) using Node test runner.  
  Evidence: `README.md:153`, `unit_tests/auth_and_rbac.test.js:1`
- **API tests:** present (`API_tests/*.api.test.js`) using Node test + in-process HTTP server.  
  Evidence: `README.md:154`, `API_tests/security_and_core_flows.api.test.js:1`
- **Integration tests:** present (`integration_tests/*.test.js`) with DB preflight and integration scenarios.  
  Evidence: `README.md:155`, `integration_tests/db_smoke.test.js:38`, `integration_tests/db_integration.test.js:60`
- **Frontend tests:** present via Vitest.  
  Evidence: `README.md:157`, `frontend/tests/security-and-hr-flow.test.js:1`
- **Documented test commands:** present for OS variants.  
  Evidence: `README.md:148`, `README.md:247`

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion / Fixture / Mock | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Password policy + lockout | `unit_tests/auth_and_rbac.test.js:16`, `unit_tests/auth_and_rbac.test.js:303` | 5th failure lock + short password reject | basically covered | Mostly mocked DB; limited real timing checks | Add DB-backed lock/unlock boundary test |
| Session idle timeout | `unit_tests/auth_and_rbac.test.js:242` | Stale session revoked, user unset | basically covered | Real DB timestamp/timezone path unverified | Add integration test with real session row timestamps |
| Unauthenticated 401 on protected route | `API_tests/security_and_core_flows.api.test.js:788` | `/api/search` returns 401 unauth | sufficient | Does not enforce expected auth policy for HR submit/upload | Add policy tests for `/api/hr/applications*` |
| Route-level authorization (403) | `API_tests/security_and_core_flows.api.test.js:132`, `API_tests/authorization_and_isolation.api.test.js:20` | Cross-site clerk/planner denied | sufficient | DB-backed authz invariants still limited | Add non-mocked integration authorization suite |
| Object-level interviewer isolation | `API_tests/authorization_and_isolation.api.test.js:97` | Assigned 200, unassigned 403 | sufficient | No DB-backed assignment mutation race test | Add integration test for assignment changes |
| Receiving discrepancy/close gating | `unit_tests/receiving_planning_hr.test.js:40`, `API_tests/security_and_core_flows.api.test.js:938` | Invalid discrepancy blocked; valid close succeeds | basically covered | Missing API tests for malformed discrepancy combinations | Add additional negative API cases |
| Putaway site/bincapacity/mixed rule | `API_tests/security_and_core_flows.api.test.js:225`, `unit_tests/receiving_planning_hr.test.js:124` | Cross-site deny + same SKU/lot selection logic | basically covered | Mostly mocked DB rows | Add DB-backed receiving fixture tests |
| 12-week MPS constraint | `unit_tests/security_and_isolation.test.js:187` | Rejects non-12-week payload | sufficient | None major | Keep |
| Plan adjustment supervisor approval | `API_tests/security_and_core_flows.api.test.js:1079`, `unit_tests/receiving_planning_hr.test.js:197` | Concurrent approval gives [200,409]; snapshot applied | basically covered | Cross-site approval real DB path limited | Add DB integration case |
| Candidate duplicate match (name+DOB+SSN4) | `unit_tests/hr_and_transactions.test.js:19`, `API_tests/security_and_core_flows.api.test.js:597` | Repeat submission toggles duplicate flag | sufficient | Name normalization policy (case/space) unclear | Add normalization policy tests |
| Attachment constraints/token replay | `unit_tests/hr_and_transactions.test.js:269`, `API_tests/authorization_and_isolation.api.test.js:185` | MIME/size reject + replay 403 | basically covered | Token durability across restart/processes not covered | Add persistent-token integration tests |
| Notifications frequency/DND validation | `API_tests/authorization_and_isolation.api.test.js:385`, `API_tests/security_and_core_flows.api.test.js:899` | Valid windows accepted, invalid format rejected | basically covered | End-to-end delayed dispatch lifecycle not fully exercised | Add timeline integration with `/dispatch` |
| Search typo/synonym/filter/scope | `unit_tests/security_and_isolation.test.js:444`, `API_tests/security_and_core_flows.api.test.js:797` | Typo/filter/sort/paging + clerk scope assertions | basically covered | Real FULLTEXT behavior in DB not validated | Add DB corpus integration test |
| Sensitive masking in candidate and audit responses | `API_tests/authorization_and_isolation.api.test.js:291`, `API_tests/security_and_core_flows.api.test.js:1665` | Candidate masking by permission; audit masking checked with object payload | insufficient | Missing test for audit JSON-string payload masking path | Add API test where audit JSON columns return serialized strings |

### 8.3 Security Coverage Audit
- **Authentication:** **Basically covered** by unit/API/integration tests (`unit_tests/auth_and_rbac.test.js:16`, `integration_tests/db_integration.test.js:60`), but severe policy gap remains for unauthenticated HR intake/upload.
- **Route authorization:** **Basically covered** (`API_tests/security_and_core_flows.api.test.js:132`, `API_tests/authorization_and_isolation.api.test.js:20`), yet critical unauthenticated HR endpoints remain allowed by design.
- **Object-level authorization:** **Basically covered** for interviewer/site checks (`API_tests/authorization_and_isolation.api.test.js:97`, `API_tests/security_and_core_flows.api.test.js:225`), with insufficient coverage for receipt document role-generalized site isolation.
- **Tenant/data isolation:** **Partially covered** via search and site scoping tests (`API_tests/authorization_and_isolation.api.test.js:253`, `unit_tests/security_and_isolation.test.js:225`); heavy mocking means severe query regressions may still pass.
- **Admin/internal protection:** **Cannot Confirm Statistically** (complete runtime assurance) - no obvious unguarded admin/debug routes in static map, but runtime configuration exposure not executed.

### 8.4 Final Coverage Judgment
- **Partial Pass**
- Major flows and many security failure paths are represented in tests, but coverage remains vulnerable to severe defects due to extensive SQL mocking and missing high-risk assertions (notably audit masking string-path and real DB authorization/isolation invariants).

## 9. Final Notes
- All findings are static and evidence-traceable; no runtime execution claims are made.
- Root-cause issues were consolidated to avoid repetitive symptom reporting.
- Highest-priority acceptance risks are: unauthenticated HR endpoints, audit masking parse gap, missing actual rule backtracking recalculation, and committed static secrets.
