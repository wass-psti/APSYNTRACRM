# CP-FRT-FILING-01 — Signed Fund Request creation and Not Filed / Filed persistence

Date: 2026-11-12. Existing APSYNTRA CRM/WatchdogWorkspace Supabase project only.

## Existing source contract

`frt_create_request(uuid,jsonb)` is already installed, creates signed membership-scoped company requests, generates voucher numbers, adds expense line items and audits `REQUEST_CREATED`. The existing `frt_requests` status is financial approval (`PENDING_APPROVAL`), not BPI BizLink filing, and must not be repurposed. A new filing value is stored separately in `filing_status` as `NOT_FILED` by default.

## Changes

- Add `frt_requests.filing_status` (`NOT_FILED` / `FILED` only) without changing financial approval/liquidation semantics.
- Extend the same signed safe-list RPC only by `filing_status`; no amounts, requestor data, recipient bank or private metadata exposed.
- New `frt_set_request_filing_status`: signed FRT active membership, current workspace and company; expected current filing state compare-and-swap; no archived writes; audit of each transition; authenticated EXECUTE only, anonymous denied, no direct table UPDATE grants.
- New Fund Request form calls existing `frt_create_request` exactly once and validates a positive expense line. It confirms `NOT_FILED` from an independent signed list read; ambiguous outcome never triggers automatic retry.
- Clicking the BPI BizLink cell explicitly confirms a transition to `FILED` or back to `NOT_FILED`, saves through the atomic RPC, and rereads the authoritative list before reporting success. Existing Finance company filtering and FRT Board summary use the same domain list; the independent board-mirror rows are not duplicated or written.

## Verification and release boundary

The additive SQL file `sql/cp-frt-filing01-CANDIDATE.sql` is a release candidate until verified and explicitly activated in the **existing** Supabase project. Disposable PostgreSQL 17 asserts default, signed list, filing round-trip, stale denial, cross-company/member denial, audit and rollback. The disposable native stack also runs actual GoTrue sessions, new request creation, filing state changes, fresh-session persistence, and exact ephemeral cleanup. No production fixture is created for acceptance. Existing RLS, roles, platform restrictions, and project inventory remain untouched.
