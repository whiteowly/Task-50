# ForgeOps Manufacturing & Workforce Hub - Static Delivery Acceptance & Architecture Audit

## 1. Verdict
- **Overall conclusion:** **Partial Pass**
- The project is structurally complete, but there are **material Blocker/High requirement-fit defects** around role model consistency and candidate/HR workflow accessibility.

## 2. Scope and Static Verification Boundary
- **Reviewed:** docs/config (`README.md`, `docker-compose.yml`, env examples), backend entry points/middleware/routes/services/schema/seed, frontend router/store/workspace/composables/components/styles, and tests (`unit_tests`, `API_tests`, `integration_tests`, `frontend/tests`).
- **Not reviewed:** runtime execution outcomes, browser behavior in live session, deployment infra behavior, external dispatch integrations.
- **Intentionally not executed:** app startup, Docker, tests, migrations, external services.
- **Manual verification required:** runtime offline LAN operation, production deployment posture, real timing/scheduler outcomes, and live browser UX/accessibility.

## 3. Repository / Requirement Mapping Summary
- **Prompt core goal:** one offline-ready hub with sign-in + role-based workspaces for Admin, Clerk, Planner, HR Recruiter, Interviewer, Candidate; receiving/planning/HR/search/notifications/rules with RBAC/ABAC, immutable audit, encrypted+masked sensitive data.
- **Mapped implementation:**
  - Auth/session/RBAC-ABAC: `backend/src/middleware/auth.js`, `backend/src/routes/auth-routes.js`
  - Receiving/planning/HR/notifications/search/rules/audit: `backend/src/routes/*.js`, `backend/src/services/*.js`
  - Persistence/audit immutability: `backend/schema.sql`, `backend/seed.sql`
  - Frontend role workspaces: `frontend/src/router.js`, `frontend/src/views/WorkspaceView.vue`
  - Static tests: `unit_tests/*.test.js`, `API_tests/*.api.test.js`, `integration_tests/*.test.js`, `frontend/tests/*.test.js`

## 4. Section-by-section Review

### 4.1 Hard Gates

#### 1.1 Documentation and static verifiability
- **Conclusion:** Pass
- **Rationale:** Startup/setup/test instructions and entry points are documented and statically coherent.
- **Evidence:** `README.md:5`, `README.md:148`, `backend/src/server.js:1`, `frontend/src/main.js:1`, `backend/package.json:6`, `frontend/package.json:6`

#### 1.2 Material deviation from Prompt
- **Conclusion:** Fail
- **Rationale:** Prompt requires signed-in role-based workspaces including HR Recruiters and Candidates; implementation has role taxonomy conflicts and route guards that block these core flows.
- **Evidence:** `backend/seed.sql:36`, `backend/scripts/seed-users.js:8`, `backend/src/routes/hr-routes.js:30`, `frontend/src/router.js:11`, `frontend/src/router.js:13`, `frontend/src/router.js:49`, `frontend/src/views/WorkspaceView.vue:40`, `frontend/src/views/WorkspaceView.vue:42`

### 4.2 Delivery Completeness

#### 2.1 Core explicit requirements coverage
- **Conclusion:** Fail
- **Rationale:** Core receiving/planning/notifications/search/rules features exist, but required candidate onboarding and HR recruiter workflow accessibility is materially broken by role mismatches.
- **Evidence:** `backend/src/services/receiving-service.js:14`, `backend/src/services/planning-service.js:43`, `backend/src/services/notification-service.js:96`, `backend/src/services/search-service.js:128`, `backend/src/services/rules-service.js:25`, `backend/src/routes/hr-routes.js:30`, `frontend/src/router.js:49`

#### 2.2 End-to-end 0->1 deliverable
- **Conclusion:** Partial Pass
- **Rationale:** Repository is full-stack and non-trivial, but critical role/workflow gating defects prevent basic end-to-end completion for some required personas.
- **Evidence:** `backend/schema.sql:1`, `backend/seed.sql:1`, `frontend/src/views/WorkspaceView.vue:176`, `README.md:1`, `frontend/src/router.js:44`

### 4.3 Engineering and Architecture Quality

#### 3.1 Structure and decomposition
- **Conclusion:** Pass
- **Rationale:** Clear modular decomposition across routes/services/middleware and frontend views/composables/components.
- **Evidence:** `backend/src/routes/receiving-routes.js:1`, `backend/src/services/receiving-service.js:1`, `backend/src/middleware/auth.js:1`, `frontend/src/composables/useReceivingWorkspace.js:1`, `frontend/src/components/workspace/ReceivingPanel.vue:1`

#### 3.2 Maintainability/extensibility
- **Conclusion:** Partial Pass
- **Rationale:** Codebase is extensible, but role taxonomy drift across seed/backend/frontend/docs/tests is a maintainability and correctness risk.
- **Evidence:** `backend/seed.sql:36`, `backend/src/routes/hr-routes.js:30`, `frontend/src/router.js:11`, `frontend/src/views/WorkspaceView.vue:40`, `README.md:129`

### 4.4 Engineering Details and Professionalism

#### 4.1 Error handling/logging/validation/API detail
- **Conclusion:** Partial Pass
- **Rationale:** Validation and centralized error handling/logging are present, but key API role constraints conflict with seeded roles and documented flows.
- **Evidence:** `backend/src/middleware/error-handler.js:4`, `backend/src/utils/logger.js:22`, `backend/src/services/auth-service.js:132`, `backend/src/routes/hr-routes.js:30`

#### 4.2 Product/service shape
- **Conclusion:** Pass
- **Rationale:** Overall project shape is product-like with substantial API/domain/persistence/test layers.
- **Evidence:** `backend/src/services/planning-service.js:1`, `backend/src/services/notification-service.js:1`, `integration_tests/db_integration.test.js:60`

### 4.5 Prompt Understanding and Requirement Fit

#### 5.1 Business and constraint fit
- **Conclusion:** Fail
- **Rationale:** Explicit persona requirements (HR Recruiter and Candidate workflows post-login) are not consistently operable under current role design and guards.
- **Evidence:** `backend/scripts/seed-users.js:8`, `backend/scripts/seed-users.js:10`, `backend/src/routes/hr-routes.js:30`, `frontend/src/router.js:13`, `frontend/src/router.js:49`, `frontend/src/views/WorkspaceView.vue:269`

### 4.6 Aesthetics (frontend)

#### 6.1 Visual/interaction quality
- **Conclusion:** Partial Pass
- **Rationale:** UI has clear panel separation and interaction controls, but final UX quality is function-first and needs runtime/manual confirmation.
- **Evidence:** `frontend/src/styles.css:39`, `frontend/src/styles.css:125`, `frontend/src/components/workspace/WorkspaceSidebar.vue:25`, `frontend/src/components/workspace/NotificationsPanel.vue:33`
- **Manual verification note:** Browser-based visual/accessibility quality cannot be fully proven statically.

## 5. Issues / Suggestions (Severity-Rated)

### Blocker / High

1) **Severity:** Blocker  
   **Title:** HR role taxonomy mismatch blocks HR recruiter workflows  
   **Conclusion:** Fail  
   **Evidence:** `backend/seed.sql:36`, `backend/scripts/seed-users.js:8`, `backend/src/routes/hr-routes.js:30`, `frontend/src/router.js:11`, `frontend/src/views/WorkspaceView.vue:40`  
   **Impact:** Seeded/permissioned HR users are `HR`, but critical frontend/backend guards require `HR_STAFF`; HR recruiters can be denied access to candidate application and attachment workflows required by Prompt.  
   **Minimum actionable fix:** Standardize one HR role code across schema seed, auth, route guards, router panel maps, and docs/tests (e.g., all `HR` or all `HR_STAFF`).

2) **Severity:** Blocker  
   **Title:** Candidate onboarding workflow is effectively inaccessible  
   **Conclusion:** Fail  
   **Evidence:** `frontend/src/router.js:13`, `frontend/src/router.js:16`, `frontend/src/router.js:49`, `frontend/src/views/WorkspaceView.vue:42`, `frontend/src/views/WorkspaceView.vue:269`, `backend/src/routes/hr-routes.js:30`, `backend/src/routes/hr-routes.js:34`, `backend/scripts/seed-users.js:10`  
   **Impact:** Prompt requires candidate structured application + attachment flow; current role guards restrict candidate to overview and block candidate create/upload API paths.  
   **Minimum actionable fix:** Provide authenticated candidate route/panel and backend permission path for candidate self-service application + upload (or clearly redesign and document supported candidate flow).

3) **Severity:** High  
   **Title:** Frontend role mappings are internally inconsistent (`HR` vs `HR_STAFF`, `CANDIDATE` panel)  
   **Conclusion:** Fail  
   **Evidence:** `frontend/src/router.js:11`, `frontend/src/router.js:13`, `frontend/src/router.js:49`, `frontend/src/views/WorkspaceView.vue:40`, `frontend/src/views/WorkspaceView.vue:42`, `frontend/src/views/WorkspaceView.vue:45`  
   **Impact:** Even if backend role issues were fixed, workspace panel availability still diverges by file, creating unpredictable access and broken UX for required personas.  
   **Minimum actionable fix:** Centralize a single authoritative role-to-panel policy shared by router guard and workspace rendering.

4) **Severity:** High  
   **Title:** Documentation and code disagree on authorized HR roles for candidate upload  
   **Conclusion:** Fail  
   **Evidence:** `README.md:129`, `backend/src/routes/hr-routes.js:34`  
   **Impact:** Reviewers/operators are misled about access model; static verifiability and operational expectations degrade.  
   **Minimum actionable fix:** Align README with implemented role model after role taxonomy normalization.

### Medium

5) **Severity:** Medium  
   **Title:** Public `GET /api/hr/forms/application` bypasses authenticated workspace boundary  
   **Conclusion:** Partial Fail  
   **Evidence:** `backend/src/routes/hr-routes.js:21`, `frontend/src/router.js:34`  
   **Impact:** Opens internal form configuration to unauthenticated callers; not catastrophic but inconsistent with sign-in-centric prompt posture.  
   **Minimum actionable fix:** Require auth (and role constraints as needed) for form schema retrieval.

6) **Severity:** Medium  
   **Title:** Receiving document site isolation depends on role/attribute assumptions  
   **Conclusion:** Suspected Risk  
   **Evidence:** `backend/src/services/receiving-service.js:274`, `backend/src/routes/receiving-routes.js:54`  
   **Impact:** Future role/permission changes could create cross-site document access gaps for non-admins without strict site checks.  
   **Minimum actionable fix:** Enforce site ownership for all non-admin actors independently of role naming/attribute presence.

7) **Severity:** Medium  
   **Title:** High-risk authz paths rely heavily on mocked SQL in API tests  
   **Conclusion:** Partial Fail  
   **Evidence:** `API_tests/security_and_core_flows.api.test.js:521`, `API_tests/authorization_and_isolation.api.test.js:22`, `integration_tests/db_integration.test.js:43`  
   **Impact:** Severe DB/query integration defects can remain undetected while tests pass.  
   **Minimum actionable fix:** Add mandatory DB-backed authz/isolation regression tests for HR/candidate role flows and route guards.

## 6. Security Review Summary

- **Authentication entry points:** **Pass**  
  Login/session/idle timeout/lockout controls exist.  
  Evidence: `backend/src/services/auth-service.js:10`, `backend/src/middleware/auth.js:31`, `backend/src/config.js:48`

- **Route-level authorization:** **Partial Pass**  
  Most sensitive routes are guarded, but role taxonomy inconsistencies materially break intended access boundaries.  
  Evidence: `backend/src/routes/receiving-routes.js:17`, `backend/src/routes/planning-routes.js:16`, `backend/src/routes/hr-routes.js:30`, `backend/seed.sql:36`

- **Object-level authorization:** **Partial Pass**  
  Interviewer assignment/site checks exist, but receiving document scope logic is role-assumption-sensitive.  
  Evidence: `backend/src/routes/hr-routes.js:55`, `backend/src/services/planning-service.js:16`, `backend/src/services/receiving-service.js:274`

- **Function-level authorization:** **Pass**  
  Permission middleware is broadly applied for function-level controls.  
  Evidence: `backend/src/middleware/auth.js:100`, `backend/src/routes/notification-routes.js:34`, `backend/src/routes/rules-routes.js:11`

- **Tenant / user data isolation:** **Partial Pass**  
  Site/user scoping logic exists in receiving/planning/search, with noted role-model caveats.  
  Evidence: `backend/src/services/receiving-service.js:166`, `backend/src/services/planning-service.js:11`, `backend/src/services/search-service.js:27`

- **Admin / internal / debug protection:** **Pass**  
  No unprotected admin/debug mutation endpoints observed in static route map; health endpoint appears intentional.  
  Evidence: `backend/src/app.js:32`

## 7. Tests and Logging Review

- **Unit tests:** **Pass (existence), Partial Pass (risk realism)**  
  Broad unit tests exist for auth, isolation, rules, receiving, HR.  
  Evidence: `unit_tests/auth_and_rbac.test.js:1`, `unit_tests/security_and_isolation.test.js:1`, `unit_tests/rules_engine.test.js:1`

- **API / integration tests:** **Partial Pass**  
  Good breadth, but many API tests mock DB queries and do not robustly catch role taxonomy regressions against real seeded roles.  
  Evidence: `API_tests/security_and_core_flows.api.test.js:521`, `integration_tests/db_integration.test.js:60`

- **Logging categories / observability:** **Pass**  
  Structured logger and centralized error handler are present.  
  Evidence: `backend/src/utils/logger.js:22`, `backend/src/middleware/error-handler.js:21`

- **Sensitive-data leakage risk in logs / responses:** **Pass (static)**  
  Redaction and masking paths are implemented for logger and candidate/audit responses.  
  Evidence: `backend/src/utils/logger.js:1`, `backend/src/services/hr-service.js:390`, `backend/src/services/audit-query-service.js:30`
- **Manual verification note:** Real DB-driver payload shapes and operational log sinks still require runtime verification.

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- Unit tests exist (`node:test`): `unit_tests/*.test.js`. Evidence: `README.md:153`, `unit_tests/auth_and_rbac.test.js:1`
- API tests exist (`node:test` with in-process HTTP): `API_tests/*.api.test.js`. Evidence: `README.md:154`, `API_tests/security_and_core_flows.api.test.js:1`
- Integration tests exist (`node:test` DB-backed): `integration_tests/*.test.js`. Evidence: `README.md:155`, `integration_tests/db_integration.test.js:60`
- Frontend tests exist (`vitest`): `frontend/tests/*.test.js`. Evidence: `README.md:157`, `frontend/tests/security-and-hr-flow.test.js:1`
- Documentation provides commands. Evidence: `README.md:148`, `README.md:247`

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion / Fixture / Mock | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Password >=12 and lockout after 5 failures | `unit_tests/auth_and_rbac.test.js:16`, `unit_tests/auth_and_rbac.test.js:303` | Lock timestamp and short-password rejection asserted | basically covered | Mostly mocked DB behavior | Add DB-backed auth lock/unlock timing test |
| Session idle timeout 30 min | `unit_tests/auth_and_rbac.test.js:242` | stale session revoked via middleware | basically covered | Real DB timestamp edge coverage limited | Add integration test around `/auth/me` idle expiry |
| 401 unauthenticated protection | `API_tests/security_and_core_flows.api.test.js:788` | `/api/search` returns 401 | sufficient | Not mapped to HR forms route | Add explicit test for intended auth policy on `/api/hr/forms/application` |
| 403 route authorization (site/role) | `API_tests/security_and_core_flows.api.test.js:132`, `API_tests/authorization_and_isolation.api.test.js:20` | cross-site clerk/planner denied | basically covered | Real seeded-role taxonomy mismatch not tested | Add DB-backed tests using seeded `HR`/`CANDIDATE` users |
| Object-level interviewer isolation | `API_tests/authorization_and_isolation.api.test.js:97` | assigned candidate 200 / unassigned 403 | sufficient | No real DB assignment change test | Add integration assignment update/recheck case |
| Receiving discrepancy + close constraints | `unit_tests/receiving_planning_hr.test.js:40`, `API_tests/security_and_core_flows.api.test.js:938` | invalid discrepancy blocked; same-site close succeeds | basically covered | Additional malformed discrepancy combinations absent | Add API negatives for mixed discrepancy payloads |
| Putaway mixed-storage/capacity/site scope | `unit_tests/receiving_planning_hr.test.js:124`, `API_tests/security_and_core_flows.api.test.js:225` | same SKU+lot bin chosen; cross-site deny | basically covered | Mostly mocked data | Add integration fixture with real bins/lots |
| 12-week MPS requirement | `unit_tests/security_and_isolation.test.js:187` | 11/13 week payloads rejected | sufficient | None major | Keep |
| Plan adjustments require supervisor approval | `unit_tests/receiving_planning_hr.test.js:197`, `API_tests/security_and_core_flows.api.test.js:1079` | apply snapshot + concurrent [200,409] | basically covered | Cross-site supervisor approval on real DB limited | Add integration cross-site approval test |
| Candidate duplicate detection (name+DOB+SSN4) | `unit_tests/hr_and_transactions.test.js:19`, `API_tests/security_and_core_flows.api.test.js:597` | duplicateFlag behavior asserted | sufficient | Candidate persona route accessibility not tested | Add E2E/API tests as `candidate1` role |
| Attachment size/type/token replay | `unit_tests/hr_and_transactions.test.js:269`, `API_tests/authorization_and_isolation.api.test.js:185` | MIME/size rejects; replay blocked | basically covered | Candidate role path unavailable and untested | Add role-based attachment tests for candidate self-flow |
| Notification DND/frequency | `unit_tests/security_and_isolation.test.js:315`, `API_tests/authorization_and_isolation.api.test.js:385`, `API_tests/security_and_core_flows.api.test.js:899` | HH:mm validation + scheduling assertions | basically covered | Full dispatch lifecycle over time not fully covered | Add integration with `publishEvent` + `/dispatch` timing |
| Search typo/synonym/filter/sort/page | `unit_tests/security_and_isolation.test.js:444`, `API_tests/security_and_core_flows.api.test.js:797` | typo/filter/sort/page assertions | basically covered | Real FULLTEXT behavior not proven | Add DB corpus integration test for fulltext + typo |
| Role taxonomy consistency (HR/HR_STAFF/CANDIDATE) | none comprehensive | N/A | missing | Severe regression currently present | Add integration and frontend-router tests asserting seeded roles can access required panels/APIs |

### 8.3 Security Coverage Audit
- **authentication:** basically covered by unit/API/integration tests, but role-tied persona access expectations are not fully verified.
- **route authorization:** partially covered; severe role-code mismatch defects can still pass because tests often mock session roles directly.
- **object-level authorization:** basically covered for interviewer/site checks, but receiving document role-generalization risk remains.
- **tenant/data isolation:** partially covered; many checks are mocked, leaving potential real DB query regressions.
- **admin/internal protection:** cannot confirm comprehensively without runtime route/config execution, though static route map looks reasonable.

### 8.4 Final Coverage Judgment
- **Partial Pass**
- Major domain and many security failure paths are tested, but uncovered role-taxonomy integration risks are severe enough that tests could still pass while required HR/Candidate workflows remain broken.

## 9. Final Notes
- Conclusions are static-only and evidence-backed; no runtime success claims were made.
- Highest-priority fixes are role-model normalization and restoring candidate/HR workflow accessibility to meet Prompt-critical personas.
