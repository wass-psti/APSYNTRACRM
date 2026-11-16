# CP-FM1-CORE-02 — Server Incident Lifecycle, Immutable Audit Events, and SLA Processing

## Scope

Adds a server-authoritative FM1 incident and SLA domain to the existing APSYNTRA CRM Supabase project. It does not add another project, authentication provider, role system, or client-side database.

## Delivered database objects

- `private.fm1_tickets`: authoritative ticket records, server-issued `FM1-YYYY-NNNNNN` references, server receipt timestamps, revision numbers and idempotency.
- `private.fm1_ticket_events`, `private.fm1_priority_events`, `private.fm1_milestones`: append-only operational event records.
- `private.fm1_audit_events`: per-ticket SHA-256 hash-linked audit sequence; update, delete and truncate are rejected.
- `private.fm1_obligations`: individual response, engineering-start, restoration, agreed-plan and public-update obligations.
- `private.fm1_holds`: evidence-backed dependency holds, validated before they can affect an eligible clock.
- `private.fm1_notification_outbox`: durable notification intents with deduplication; no external channel is activated by this change.
- `private.fm1_calendar_versions`, `private.fm1_service_config`, `private.fm1_decisions`: contract/readiness and calendar inputs.
- `private.fm1_worker_runs`: bounded SLA processor run history.

## RPC surface

- `fm1_service_status_v1`
- `fm1_create_ticket_v1`
- `fm1_list_tickets_v1`
- `fm1_ticket_detail_v1`
- `fm1_transition_ticket_v1`
- `fm1_record_milestone_v1`
- `fm1_record_priority_v1`
- `fm1_request_hold_v1`
- `fm1_validate_hold_v1`
- `fm1_end_hold_v1`

All operations use the existing CRM session and active workspace context. No FM1-specific role or approval hierarchy is added to routine ticket intake or lifecycle operations.

## SLA activation behavior

The seeded BIOTECH-FM1-2027 service remains `awaiting_acceptance` and `pending`. Calendar holidays and the nine FDS decisions remain unapproved. Tickets can be created and worked through their operational lifecycle, but SLA obligations remain `NOT_ACTIVE`/`needs_review`; no contractual due date is represented as active until the existing service configuration, calendar and required readiness decisions are approved.

The deadline processor is bounded to 100 due obligations per run and records its result. Breach events and outbox intents are idempotent. Email, SMS, paging and client notifications remain unconfigured; this migration does not invent recipients or send messages.

## Disposable database verification

Run `sql/tests/cp-fm1-core-02-disposable-setup.sql`, then apply `supabase/migrations/20261116055815_cp_fm1_core_02_server_incident_sla.sql`, then run `sql/tests/cp-fm1-core-02-runtime.sql` against a disposable PostgreSQL 17 database.

The runtime test creates a ticket under a simulated authenticated CRM session, verifies replay idempotency, performs a lifecycle transition, records and replays a milestone, reads back obligations/events/audit, and verifies audit append-only enforcement. It rolls back the fixture.

## Not yet accepted

- Existing production Supabase migration application and genuine signed-session RPC acceptance.
- Runtime verification of the configured `pg_cron` scheduler in the target Supabase environment.
- Approved contract, calendar holiday set and FDS readiness decisions.
- External notification provider configuration and end-to-end delivery.
- Real operational-user workflow acceptance.

The native ESM Chromium acceptance also verifies the local-draft path remains separate from server incident submission. No production deployment or external notification was performed by the disposable verification.

## Operational CRM workflows added during CP-FM1-CORE-03 preparation

The ticket detail screen now exposes the existing server RPCs for priority changes and dependency holds. Operators can record requested/effective/confirmed priority with a reason; request a hold with metric, dependency reason, external owner, required action, evidence and expected review time; record a hold validation/rejection with evidence; and end a validated hold with a resume reason. Pending requests explicitly do not pause SLA clocks. Engineering-start validation exposes the required remote/guided-diagnosis blocked evidence flag. Mutation forms retain their idempotency key across an uncertain retry without clearing entered values.
