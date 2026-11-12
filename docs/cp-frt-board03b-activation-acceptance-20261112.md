# CP-FRT-BOARD-03B — Atomic date and workspace-scoped person assignment

Date: 2026-11-12. Applies only to the existing APSYNTRA CRM/WatchdogWorkspace Supabase project.

## Production activation of date CAS

- The previously tested `public.frt_update_request_date_cas(uuid,uuid,date,date)` was installed using the exact candidate SQL from CP-FRT-BOARD-03.
- Live read-only checks: authenticated EXECUTE true; anonymous EXECUTE false; date compare-and-swap predicate installed; zero FRT requests and zero date-correction audit entries at activation.
- The frontend now calls only `frt_update_request_date_cas` with expected and next date, and verifies the signed restricted request after the server's receipt. It does not retry uncertain writes or fall back to the non-atomic legacy updater.

## Person assignment

- Optional request-bound `assignee_id`, separate from private `requestor_id`; no change to the underlying requestor, approvals, company, bank, attachment, or lifecycle data.
- Existing active workspace member profile records provide the person picker; no new FRT users, CRM roles, or authorization policies.
- Read the current assignment using `frt_request_assignment`; list active members via `frt_assignable_people`; update by `frt_assign_request_person` using server atomic expected-assignee CAS and audit. The server rejects workspace outsiders, inactive profiles/members, denied roles, and stale assignments.
- UI is available in the signed FRT Finance request list for the same three existing correction roles: FINANCE_MANAGER, FINANCE_APPROVER, GENERAL_MANAGER. Clear assignment is supported; after save, client rereads current assignment, and the next open/refresh rereads it again.
- A zero-item production FRT board cannot furnish a signed persisted-request round-trip. Genuine signed browser acceptance must use a separate authorized non-business test request, with post-test cleanup.

## Verification boundaries

- The production date migration is additive; does not modify existing request rows, grants on other functions, existing FRT roles, RLS or storage policies.
- Person assignment SQL must pass PostgreSQL 17 disposable signed role, foreign workspace, stale-write, assign, clear, and audit acceptance before production installation.
- No private attachments or QR codes are created, registered, exposed or generated in this milestone.
