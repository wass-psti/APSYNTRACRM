# CP-FM1-CORE-04 — Operational UI, incident editing, reporting and SLA warnings

Date: 2026-11-16

Status: IMPLEMENTED — isolated acceptance passed; production activation pending

Repository: wass-psti/APSYNTRACRM

Branch: feat/cp-fm1-core-02-server-incident-sla-isolated

Previous commit: 275937c577f1b4f2f4e01510ff8e391140acbae1

## Scope delivered

### Ticket queue

- Connected the existing server-side search, status and priority parameters to the FM1 queue.
- Added combined filters and clear-filter action.
- Added server pagination and accurate result ranges.
- Preserved filters and page offset across refresh and tab navigation.
- Added loading, error, empty-result and retry states.
- Kept filtering and result totals in the existing workspace-scoped RPC.

### Incident editing

- Added editable requester name, callback number, subject, description, production impact, production-stopped state, safety concern and asset reference.
- Added the fm1_update_ticket_v1 DomainApi operation.
- Added server revision checks and transactional updates.
- Added idempotent retry handling and payload mismatch rejection.
- Appends IncidentDetailsUpdated to the existing immutable event and SHA-256 audit chain.
- Preserves ticket number and original receipt timestamp.

### Reporting and duty

- Added the fm1_operational_report_v1 server aggregate.
- Added status, priority, assignment, obligation and milestone distributions.
- Added open/closed, P1/P2, unassigned, active SLA and breach counts.
- Added bounded unassigned P1/P2, current assignment, SLA-active incident, approaching warning, breach, escalation and lifecycle history lists.
- Added internal notification delivery totals (queued, failed, delivered, pending configuration and retrying) to the report response.
- Replaced the Reports placeholder with server-backed operational reporting.
- Completed Duty with unassigned P1/P2, assignments, SLA-active incidents, approaching warnings, breached obligations and outbox delivery state.
- Reports/Duty refresh only the report, warning policy and service summary; the ticket queue and notification inbox are not unnecessarily reloaded.

### Configurable deadline warning policy

- Added a workspace-scoped warning policy.
- Default state is disabled and NOT_CONFIGURED; no thresholds are invented.
- Supports independent human-response, engineering-start and restoration warning lead times.
- Requires an explicit positive threshold before enabling.
- Keeps external email, SMS, paging and customer delivery unconfigured.
- Added a bounded worker using row locks with SKIP LOCKED.
- Persists one warning event per obligation, appends the immutable audit record and enqueues an in-app notification.
- Suppresses duplicate warnings and reuses the CP-FM1-CORE-03 outbox and inbox.
- Schedules the worker when pg_cron is installed.
- Updates service status to report the actual policy state and approaching-warning count.

## Database migration

New additive migration:

20261116092055_cp_fm1_core_04_operational_ui_reporting_warnings.sql

New database objects include:

- private.fm1_deadline_warning_policies
- private.fm1_deadline_warning_events
- private.fm1_update_ticket_impl
- private.fm1_operational_report_impl
- private.fm1_deadline_warning_policy_impl
- private.fm1_update_deadline_warning_policy_impl
- private.fm1_process_deadline_warnings
- private.fm1_approaching_deadline_count_impl
- Public RPC wrappers for incident update, reporting and warning policy.

The migration does not create a new Supabase project, authentication framework, CRM role system or approval hierarchy.

## Verification

- Focused API tests cover revision-aware incident editing, report response shape, warning policy defaults and minute-to-second conversion.
- Disposable PostgreSQL 17 acceptance applies CP-FM1-CORE-02, CP-FM1-CORE-03 and CP-FM1-CORE-04 in sequence.
- Database acceptance verifies ticket-number, subject and requester search, combined status/priority filters, pagination, revision update, idempotent replay, stale revision rejection, event/audit append, policy default, policy activation, warning generation, duplicate suppression, in-app notification delivery and report readback.
- A two-session PostgreSQL concurrency test holds the ticket row in one transaction while a competing edit waits; the first edit commits and the stale competing revision is rejected with SQLSTATE 40001.
- Native Chromium acceptance verifies queue filters, pagination, filter persistence after refresh and tab navigation, revision-safe editing, assignment, conversation, lifecycle/priority/hold flows, Reports, Duty, policy configuration and isolated report refresh.
- WCAG 2.2 AA axe checks cover overview, intake, queue, incident detail, reports and duty.
- Latest local full frontend regression: 2,393 passed, 0 failed.
- Focused FM1 tests: 43 passed, 0 failed.
- Lint, formatting, syntax checks and production build passed; existing Vite startup-script, large-chunk and ineffective dynamic-import warnings remain.

## Production continuity

The CP-FM1-CORE-02 and CP-FM1-CORE-03 production migrations remain unapplied at the recorded baseline. CP-FM1-CORE-04 is also not applied to production.

No production migration, production data change, cron job, role change or permission change was performed as part of this milestone.

After the separately required production permission-change approval, apply migrations in order: CP-FM1-CORE-02, CP-FM1-CORE-03, then CP-FM1-CORE-04. Complete genuine signed-session acceptance only after the installed production functions and worker are verified.

## Known operational limits

- The warning policy remains inactive until the workspace configures actual warning lead times.
- Contractual SLA compliance percentages remain withheld until contract and calendar decisions are established.
- External email, SMS, paging and customer message delivery remain NOT_CONFIGURED.
- Disposable PostgreSQL and mock-backed Chromium acceptance are not production signed-session acceptance.
