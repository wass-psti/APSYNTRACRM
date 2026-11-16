# CP-FM1-CORE-03 — Operational workflow implementation and production acceptance

Date: 2026-11-16
Status: IMPLEMENTED-UNVERIFIED / PRODUCTION ACTIVATION BLOCKED
Repository: wass-psti/APSYNTRACRM
Branch: feat/cp-fm1-core-02-server-incident-sla-isolated
Existing pull request: #426
Supabase project: APSYNTRACRM (jtlusodorfnyzgyuewkz)

## Verified production baseline (read-only)

- The existing Supabase project is active on PostgreSQL 17.
- The existing public.workspaces, public.profiles, public.workspace_members, private, extensions, auth.uid(), public.current_workspace_id(uuid) and extensions.digest(bytea,text) prerequisites exist.
- workspace_members exposes workspace_id, user_id and active; profiles exposes id, email, display_name and status.
- Existing profile status values are active and disabled; workspace member active values are true.
- pg_cron is available to the project but is not installed at this baseline.
- Neither CP-FM1-CORE-02 migration 20261116055815 nor CP-FM1-CORE-03 migration 20261116082518 is recorded in production. No private.fm1_* tables or functions are installed.
- No production FM1 incident, notification, audit, or SLA data has been written.
- No production migration, cron job, role change, or permission change was performed.

The read-only schema preflight matches the structural prerequisites expected by CP-FM1-CORE-02 and CP-FM1-CORE-03. This does not replace execution of both migrations in the existing project after the required production permission-change approval.

## CP-FM1-CORE-03 implementation

The additive migration 20261116082518_cp_fm1_core_03_operational_workflows.sql extends CP-FM1-CORE-02 with:

- Workspace-scoped assignment and reassignment, active-member validation, ticket revision checks, idempotent replay and immutable AssignmentChanged event/audit records.
- Append-only incident conversations for internal notes and customer-update records. Customer updates explicitly report external delivery as NOT_CONFIGURED.
- Conversation revision checks, idempotency and immutable event/audit history.
- In-app notification outbox generation from ticket events and SLA breach events.
- Bounded outbox processing using FOR UPDATE SKIP LOCKED, unique outbox/recipient receipts, retry backoff, attempt limits, delivery timestamps and failure reasons.
- Signed-user notification inbox and idempotent mark-read operation.
- Workspace-scoped service metrics, active assignee roster, unassigned P1/P2 incident summary and notification delivery counters.
- Dedicated indexes, append-only conversation triggers and RPC wrappers using the existing CRM session and DomainApi.
- Internal notification processing is executable by the database worker role only. External email, SMS, paging and customer-message delivery remain disabled.

Frontend additions in the existing FM1 components and DomainApi include:

- Workspace-member assignment controls in ticket details.
- Internal note and customer-update conversation capture and readback.
- Notification inbox navigation, incident deep-link action and mark-read control.
- Server-backed overview and duty metrics.
- Explicit UI copy that distinguishes internal record capture from external notification delivery.

No separate Supabase project, database, authentication system, CRM role model or additional approval hierarchy was introduced.

## Verification evidence

Executed on the existing development checkout:

- Full repository frontend regression: **2,389 passed, 0 failed**.
- Focused FM1 suite: **39 passed, 0 failed**.
- npm run check: PASS.
- npm run lint: PASS.
- npm run format:check: PASS.
- git diff --check: PASS.
- Disposable PostgreSQL 17 acceptance: PASS. It applied the CP-FM1-CORE-02 and CP-FM1-CORE-03 migrations to a disposable database and exercised assignment, conversation, idempotency, revision conflict, workspace-member validation, audit/event readback, append-only behavior, notification outbox processing, SLA breach escalation, duplicate suppression, retry recovery and mark-read.
- Production frontend build: PASS. Existing warnings remain for the non-module startup guard script, a chunk larger than 500 kB and an existing ineffective dynamic import.
- Native ESM Chromium browser acceptance: PASS. It exercised intake validation, assignment, internal/customer-update conversation capture, priority changes, dependency hold request/review/resumption, notification inbox navigation, draft scope isolation, desktop/mobile layout and WCAG 2.2 AA axe checks.

Disposable database acceptance and browser acceptance are not genuine signed-session production acceptance. The browser workflow uses an isolated mock RPC backend.

## Repository and PR state at checkpoint

- Existing branch: feat/cp-fm1-core-02-server-incident-sla-isolated.
- Existing PR #426 is still OPEN and targets main.
- The pre-CP03 branch head was 7701f868f855ddc5db304f6db4e63df7c3d558d5.
- CP-FM1-CORE-03 working changes are staged for review and have not been represented as merged or deployed.
- The dedicated GitHub Actions workflow .github/workflows/cp-fm1-core-03.yml runs syntax, regression, lint/format, disposable PostgreSQL, production build and native ESM browser acceptance.

## Production activation gate

The user explicitly requires production database changes to wait for the applicable production permission-change approval. No approval for the CP-FM1-CORE-02/03 production grants and worker activation has been evidenced in this checkpoint.

Until approval is recorded:

- Do not apply either production migration.
- Do not create production FM1 tables, functions, triggers, cron jobs or grants.
- Continue isolated code and disposable database verification only.

After approval, apply the migrations in order to the existing Supabase project: CP-FM1-CORE-02 20261116055815, then CP-FM1-CORE-03 20261116082518. Verify migration history, grants, indexes, constraints, triggers, RPC signatures, cron jobs and worker run history.

## Remaining acceptance and defects

- Genuine signed APSYNTRA CRM session acceptance remains pending because the production RPCs do not exist yet.
- Incident create/read, lifecycle, assignment, conversations, audit readback, SLA obligations, deadline processing and notification delivery must be exercised against the migrated production backend.
- The Reports navigation remains a placeholder; authoritative incident/SLA reporting is not complete.
- The ticket queue does not yet expose the existing backend search/status/priority filters and pagination as user-facing controls.
- Editing existing incident descriptive fields is not yet implemented as a revision-checked server operation.
- Approaching-deadline alert thresholds and a duty escalation policy are not configured; no fabricated threshold or contractual SLA performance claim is displayed.
- External email/SMS/paging/customer delivery is not configured and must not be reported as delivered.
- Full CRM regression and user-facing operational acceptance remain pending after the production release sequence.

## Acceptance classification

| Requirement                                                              | Status                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------- |
| Existing repository and Supabase infrastructure preserved                | VERIFIED                                                |
| Existing production schema prerequisites inspected read-only             | VERIFIED                                                |
| CP-FM1-CORE-03 migration applied to disposable PostgreSQL 17             | VERIFIED                                                |
| Assignment and conversation implementation                               | VERIFIED in disposable DB and isolated browser workflow |
| Immutable conversation and audit/event readback                          | VERIFIED in disposable DB                               |
| In-app outbox idempotency, retry and mark-read                           | VERIFIED in disposable DB                               |
| Frontend build, lint, formatting and local regression                    | VERIFIED                                                |
| Production migrations 02 and 03                                          | BLOCKED pending production permission-change approval   |
| Genuine signed-session production acceptance                             | BLOCKED until migration and deployment                  |
| Approaching-deadline policy and external notification delivery           | PENDING operational configuration                       |
| User-facing report, queue filters/pagination and incident detail editing | PENDING implementation                                  |

## Rollback and data handling

No production FM1 records exist at the verified baseline. Do not drop shared schemas, remove shared roles, or reset the production project as a rollback. Any rollback must be a separately reviewed, additive FM1-specific migration that preserves unrelated CRM data and migration history.
