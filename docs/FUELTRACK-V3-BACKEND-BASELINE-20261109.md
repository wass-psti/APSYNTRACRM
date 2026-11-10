# FuelTrack+ v3 — Minimal backend activation baseline (November 9, 2026)

**Scope:** Existing WatchdogWorkspace Supabase project; no new service, app, account system, or Supabase project.

**Status:** Implementation staged in the repository. **NOT deployed to production.** Do not enable the frontend mutation controls merely because this migration parses or passes isolated tests.

## Verified dependencies

- Signed identity: existing `auth.uid()` and `public.current_workspace_id()`.
- Module authorization: existing `has_module_access('fueltrack-plus',caller)` and `module_role_for` (observed `Admin` and `User`).
- Board authorization: `work_board_access(boardId,'view'|'edit')`, exact FuelTrack board identity and workspace.
- Existing source event stream: `list_module_activity`. This is not treated as immutable transaction evidence because `append_module_activity` may also be invoked by module users.
- Existing request module-state key `fueltrackplus.requests.v3`: no rows found during read-only inspection on November 9. No migration of existing records is claimed.

## Database contracts

One normalized transactional request table, one immutable transition-audit table, and the following signed RPCs (no direct table grants):

| Section | Backend source / operation | Limit |
|---|---|---|
| Dashboard | `fueltrack_v3_read` summary | Server-computed authorized aggregates |
| Analytics | `fueltrack_v3_analytics` | 1–365 days, Manila-local grouping |
| All Requests | `fueltrack_v3_read` rows | Latest 1–200, no full-history cursor yet |
| New Fuel Request | `fueltrack_v3_submit` | Signed requester, idempotency key and validation |
| Approvals | `fueltrack_v3_read` pending summary + `fueltrack_v3_decide` | Admin-only CAS transition |
| LightFuels | `fueltrack_v3_read` queue summary + `fueltrack_v3_mark_refueled`, `fueltrack_v3_complete` | Admin-only CAS transitions |
| Activity | `fueltrack_v3_audit_read` | Immutable source, Admin-only cursor pagination |

The current frontend continues to use its existing reads/disabled controls until the migration is applied and signed acceptance completes. `frontend/fueltrack-v3-domain-client.js` supplies the domain RPC boundary without UI changes.

## Security behavior

- Every RPC rechecks the signed caller, current workspace, module role, exact active Board, and Board `view` or `edit` grant.
- `Admin` can approve/reject, mark physical refueling complete, and save receipt totals; `User` can submit and read only their own requests, provided Board editing is allowed.
- Submitted → Approved/Rejected → Refueling Done → Completed transitions enforce expected revision and are atomic with immutable transition audit.
- Replay of a request's client-provided UUID returns the original record; reuse with changed payload is denied.
- Invoice number is optional. Actual amount and liters must be positive.
- Direct table access is revoked for `anon`/`authenticated` and RLS is enabled. Backend functions use `SECURITY DEFINER` solely for tightly checked RPC writes/reads.

## Verified disposable acceptance

Run using only an isolated PostgreSQL 16 container:

1. `sql/tests/fueltrack-v3-backend-core-fixture.sql`
2. `supabase/migrations/20261110021141_fueltrack_v3_backend_core.sql`
3. `sql/tests/fueltrack-v3-backend-core-acceptance.sql`

Pass result: `FT3_BACKEND_CORE_ACCEPTANCE_PASS`. Covers idempotency, owner reads, role denial, invalid details, cross-workspace denial, signed-out denial, stale updates, allowed transitions, immutable audit, and Analytics.

## Next increment: transactional Board identity + private receipt Storage (staged)

Migration **`20261110021200_fueltrack_v3_board_receipts.sql`** depends on
`20261110021141_fueltrack_v3_backend_core.sql`.

- The signed `fueltrack_v3_submit` transaction creates one real Board item
  via existing `wm_add_board_item` and assigns `board_item_id` to its request.
  Replaying its idempotency key reuses the same item. A missing Board group
  aborts the entire transaction; no orphan request is committed.
- The Board item's managed `notes` projection contains the request UUID
  and current workflow state. A compare-and-swap trigger updates that
  projection in the *same transaction* as approval, refueling, or completion.
  If the item is archived/removed or its managed note was changed externally,
  the transition fails rather than silently overwriting user content.
- Linked Board item deletion is restricted by FK. Board user-customizable
  Status columns are not overwritten or assigned invented label IDs.
- Private file uploads use the existing `work-board-files` bucket, with
  `{boardId}/{boardItemId}/{objectUuid}.{jpg|png|webp}` as the only accepted
  object key. The Storage policy verifies a real member-accessible Board item.
- `fueltrack_v3_receipt_prepare` checks signed Admin, edit grant, linked item,
  refueling state, and absence of existing receipt; it returns the actual Board
  item and existing private bucket.
- `fueltrack_v3_attach_receipt` verifies signed caller, actual `storage.objects`
  owner, MIME, extension, size (max 5 MiB), request state and exact object path.
  It invokes existing `wm_register_board_item_file` and creates the single
  FuelTrack receipt link atomically. Replaying an already-registered path for
  the same uploader returns the existing file ID; another receipt is denied.
- `fueltrack_v3_receipt_read` returns only authorized metadata. The frontend
  requests a 5-minute signed URL on explicit user action. It does not create
  public links, use a service-role key, or store Storage tokens persistently.
- The existing LightFuels Save & Complete form accepts one optional private
  JPEG/PNG/WebP receipt image. A failed upload/registration does not falsely
  complete the transaction. A previously stored receipt is preserved on retry.

### Isolated verification

Run `./scripts/fueltrack-v3-backend-disposable.sh`. It creates temporary
PostgreSQL 16 containers, exercises both migrations, core and new contract
acceptance, and deletes the containers. The tests cover idempotency, mutable
Board-state projection, registered private receipt, size/MIME mismatch,
wrong role, cross-workspace and signed-out denial, immutable core audit,
migration reapplication, and the **legacy data preflight**.

The preflight **intentionally blocks** the new migration before schema writes
if the earlier core was independently activated with unlinked request records.
Those rows require an authorized, audited migration/reconciliation before
this migration can be deployed. No production records have been modified.

### Security limits and deliberate non-goals

- The existing private `work-board-files` Storage RLS uses Board membership
  and Board item access. Therefore, an already-authorized Board viewer may
  access registered receipts through existing Board file paths, even if they
  do not have FuelTrack Admin role. Narrower receipt-only Storage policies
  would change production permissions and require a separate risk review.
- Existing Board file deletion policies may permit authorized file owners or
  managers to delete the underlying Storage object. The request link/metadata
  is protected by foreign keys, but the object itself is not immutable. An
  explicit retention policy would be additional production authorization.
- No production schema, RLS, Storage policy, account, Board item, or receipt
  has been changed. No browser signed-session acceptance is claimed.
- The New Fuel Request's preparatory receipt-photo button remains disabled;
  the implemented private image path is the LightFuels completed-refueling
  receipt workflow. Full historical paging, signed production acceptance,
  and any requested early-photo workflow remain separate work.

## Activation still required

1. Obtain separate authorization for the existing project's production schema
   changes; apply both migrations through approved policy after confirming
   no unlinked legacy fuel requests.
2. Perform genuine signed Admin/User/foreign-workspace/revoked-session
   acceptance for submission, Board projection, receipt image registration,
   retrieval and receipt completion.
3. Verify private Board Storage read/delete permissions align with intended
   retention and recipient visibility; change production Storage policies
   only with explicit permission approval.
4. Verify Board UI and all seven sections across refresh/logout, with no
   drift between a request and its linked Board item.
5. Extend 200-row read pagination and any reference-specific interaction
   not included in the existing backend transaction contracts.

**Do not** infer production readiness from passing disposable database or
frontend tests.


## November 10 live production migration alignment

Owner-authorized migrations have now been applied via Supabase migration
API; provider-assigned versions are 20261110021141 and 20261110021200.
The two SQL bodies are unchanged; the source filenames were aligned to
applied migration history. Live RLS/RPC catalog verified; genuine signed
Admin/User and private Storage functional acceptance remains pending.
See docs/FUELTRACK-V3-SIGNED-PRODUCTION-ACTIVATION-20261110.md.
