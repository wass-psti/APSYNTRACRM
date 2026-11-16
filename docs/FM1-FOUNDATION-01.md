# FM1-FOUNDATION-01 — CRM-native module foundation

Date: 16 November 2026

Repository: `wass-psti/APSYNTRACRM`

Branch: `feat/fm1-crm-foundation-01`

Native DOM compatibility follow-up: `fix/fm1-native-dom-mount-05`

## Delivered

- Added the FM1 Ticketing route to the existing APSYNTRA CRM sidebar and hash router.
- Added a lazily loaded native ES Module feature under `frontend/fm1/`.
- Added a reusable native DOM-rendered FM1 workspace controller with delegated click/submit handling and explicit mount/unmount lifecycle.
- Added a responsive, mobile-first FM1 workspace with Overview, Tickets, Duty, Approvals, Assets & I/O, Preventive, Engineering, Commercial, Reports and Administration sections.
- Added an FM1 intake form with HTML5 Constraint Validation and dependency-free JavaScript schema validation.
- Added IndexedDB persistence for explicitly local intake drafts, scoped to the current CRM user and workspace.
- Added pure SLA calendar/deadline preview functions for P1–P4, including continuous P1/P2 elapsed time, Asia/Manila P3/P4 weekday support windows, synthetic holiday fixtures, permitted hold unions and preview-only result labeling.
- Added optional Vite development/build scripts without changing the GitHub Pages production entry point; CSS bundle generation is included in the production build hook.
- Added Playwright acceptance through both Vite and an unbundled static HTTP server, plus axe-core WCAG 2.2 AA checks for desktop, mobile, form validation, same-document workspace switching and IndexedDB draft lifecycle.
- Added scoped ESLint and Prettier tooling for the FM1 feature and its test files.
- Added the FM1 stylesheet to the existing generated 47-source CSS bundle, preserving the single blocking stylesheet request.

## Contract and data boundaries

The FDS states that the source agreement is offered and must not be treated as executed or active until acceptance and readiness evidence are recorded. The UI therefore displays **Awaiting acceptance** and does not activate live contractual clocks or service guarantees.

Local intake drafts are labeled `LOCAL-DRAFT`, have `serverTicketId: null` and `submissionState: NOT_SUBMITTED`. They are scoped to the signed CRM user and workspace. They are not tickets, service receipts or operational records. They do not notify duty staff and do not start an SLA clock.

SLA calculations in this frontend are testable preview functions only. The authoritative calculation, breach events, deadline worker, server receipt timestamp, ticket numbering, audit log and notifications must be implemented in the existing Supabase backend before live use.

The 2027 Philippine holiday calendar remains unconfigured. The empty holiday list is used only for deterministic synthetic acceptance fixtures; it is not a declaration that the service calendar has no holidays.

## Architecture decisions

- Production remains the existing static GitHub Pages SPA.
- Vite is an optional local development/build tool; it does not replace the production deployment pipeline.
- No new runtime dependencies are required by the FM1 browser modules. Intake validation combines native HTML5 Constraint Validation with a dependency-free JavaScript schema validator. Vite, Playwright, axe-core, ESLint and Prettier are development/test dependencies.
- Floating UI, TanStack Table/Virtual, date-fns/date-fns-tz, Chart.js, DOMPurify, Lucide and Vitest are deferred until their respective FM1 modules need them. The existing Node test runner remains the repository-wide unit test runner. Native APIs are used where they already satisfy the requirement.
- No new Supabase project, auth framework, role model, approval layer, migration or production data change was introduced.
- Existing CRM session handling, routing, backend client and authorization behavior are preserved.

## FDS traceability and current disposition

- CFG 01–03: Initial contract values and Awaiting Acceptance state are represented. Versioned contract records, readiness checklist, activation history and term-boundary workflows remain pending.
- INT 01–02: The portal intake draft captures requester/contact, symptoms, impact, production-stopped indicator, proposed priority, channel and optional asset reference. Server receipt time, immutable ticket ID, email/telephone ingestion, idempotency and triage queues remain pending.
- UI 03: The responsive shell and 360px intake flow are implemented and browser-tested. The full ticket workspace, queue filters, conversation visibility, attachments and server-confirmed actions remain pending.
- SLA 01–05 / CLK 01–05: P1–P4 target values and independent deadline preview functions are implemented. These are not authoritative obligations; qualifying human acknowledgment, technical engineering evidence, recurring public-update intervals, terminal rules, persisted status categories, restoration recurrence and the server-side deadline worker remain pending.
- EXC 01–03: Overlapping interval union and metric-specific hold eligibility helpers are implemented for preview tests. Persisted hold records, lead validation, evidence, disputes, resume notifications and requested/effective/confirmed priority history remain pending.
- DAT 01–02: No server audit or transactional event is fabricated by the frontend. Atomic ticket/event/obligation/outbox persistence remains pending.
- U01–U18: Deterministic preview coverage exists for selected calendar and hold cases. The complete server-backed workflow acceptance suite is pending.
- D01–D09: Unresolved business and infrastructure decisions remain a tracked dependency. Proposed P3/P4 update targets and the missing holiday calendar are visibly identified as pending approval.

The FDS's Release A, B and C scope is not complete in this foundation milestone. This delivery establishes the CRM-native shell and testable frontend/domain foundation only.

## Verification

- FM1 unit and contract tests: 28 passing.
- Existing repository test suite: 2,350 passing.
- Playwright + axe-core browser acceptance: passed with both Vite and an unbundled static HTTP server, including native ES module imports with Custom Elements unavailable, 360px viewport, local draft save/read/delete, user/workspace scope switching and WCAG 2.2 AA checks.
- Vite production-mode build: passed. FM1 is emitted as a separate lazy-loaded chunk (28.11 KB before gzip (9.70 KB gzip) with no FM1 runtime dependencies. The build still reports the existing large CRM entry chunk and non-module startup-guard script; those are existing shell characteristics, not FM1 chunk output.
- Generated CSS bundle verification: 47 ordered sources.
- ESLint: passed. Prettier format check: passed.

## Local development

- npm ci — install the pinned toolchain.
- npm run dev — serve the existing CRM shell on 127.0.0.1:5173.
- npm run test — run the existing Node test suite.
- npm run test:fm1 — run FM1 unit and integration tests.
- npm run test:e2e — Playwright starts a local Vite server when one is not already running, then stops the server it started.
- npm run lint and npm run format:check — validate FM1 source quality.
- npm run build — run the CSS prebuild and optional Vite production-mode build.

## Release status

The FM1 foundation was merged to main in PR #413; the FDS navigation update was merged in PR #415. PR #417 removed the external Zod and Nano Stores imports. This follow-up removes the Custom Elements API dependency after live Chromium runtime verification showed that API unavailable in the active browser context; FM1 now mounts through ordinary DOM nodes and native event delegation. Static-HTTP browser acceptance covers the same unbundled module graph used by GitHub Pages and explicitly runs with window.customElements set to null. Genuine signed-session runtime acceptance and server-backed ticketing remain pending.

## Not included in this milestone

- Server-backed ticket creation and server-generated FM1 ticket numbers.
- Supabase persistence, database migrations or RPC activation.
- Authoritative SLA clock worker and immutable breach/obligation records.
- Email intake, outbound email, SMS/paging, duty roster and notification outbox.
- Live asset/I/O import, preventive-task generation, engineering approvals, remote-session integration, billing, credits or published reports.
- Contract execution, readiness activation or live client notifications.

## Next implementation

**CP-FM1-CORE-02 — Server-Backed Incident Lifecycle, Immutable Audit Events, and Authoritative SLA Obligation Processing.**

This should implement the FDS Release A server-backed incident/SLA foundation in the existing Supabase project: server-generated FM1-2027-000001 references using the actual creation year; original receipt and reported-occurrence timestamps; ticket lifecycle and priority history; public/internal conversations; work-log evidence; independent response, engineering-start, restoration and recurring-update obligations; validated hold records; append-only audit events; atomic notification-outbox records; and an idempotent server-side deadline processor. Verify U01–U18 against disposable PostgreSQL fixtures and the existing CRM integration. Reuse existing CRM session context and preserve current authorization behavior without creating a new role or permission framework. Do not activate contractual clocks or external notifications until the required contract/readiness and D01–D09 decisions are approved.
