# CP-RC02 — Effective User Role Management (implementation baseline)

**Date:** October 30, 2026 · **Branch:** `feature/cp-rc02-live-user-role-management`
**Approval boundary:** Feature code is not merged to `main`. No production user's role,
workspace membership, board membership or application permission has been modified.

## Actual architecture and implementation

- Administration navigation: **User Role Management**, visible only when the actual server-side
  `apsyntra_role_is_bootstrap()` RPC validates one of the two pre-existing protected Auth UUIDs.
  It rechecks the signed Auth user ID and active authoritative workspace on every write.
- One authoritative module role storage: **`public.module_role_assignments`**, expanded to
  the exact twelve module identifiers and their validated domain role vocabularies.
- One existing board authorization storage: **`public.work_board_members`**,
  with `viewer` and `editor` assignments and actual live `work_board_access` semantics.
  Board ownership remains protected.
- The bootstrap-only `apsyntra_role_manage_user_access` RPC enforces caller identity,
  target active workspace membership, protected administrator/self-exclusion, module and board
  allowlists, revision-conditional updates, and an audit record in the same transaction.
- The existing `wm_admin_set_application_role` is reused for TimeTracker, FuelTrack+,
  TradeLink, FRT, Tool Traceability, and Material Request Hub. Their existing domain
  authorization handlers are invoked as designed.
- For other modules, central `module_role_assignments` drives the existing
  `module_role_for` and `has_module_access` helpers, but **does not automatically
  certify all domain-specific workflows**. Toolbox source membership is a special case:
  granting is intentionally blocked until the existing source membership role vocabulary
  is reconciled; revocation disables its real source membership and central role atomically.
- The original module role key did not include a workspace_id; therefore changing a
  multiply-enrolled user's application role is rejected until the existing architecture
  can scope it without cross-workspace leakage. Board membership is workspace-local already.
- The UI shows existing assignments, per-user module roles, board membership, dedicated
  role selections and explicitly confirmed revocations; refresh retrieves authoritative
  PostgreSQL data. No hardcoded assignment is rendered.
- Staged Role Configuration proposals remain available as before and **remain staged**.
  The new live user-access RPC is a separate, explicitly auditable user-initiated
  application/board-role operation, not a backdoor proposal activation.

## Granular permission limits

The effective board authorization contract currently has `view`, `edit`,
and `manage` checks mapped to owner/editor/viewer; this interface exposes only
grantable `viewer`/`editor` memberships. It does **not** claim that arbitrary
`approve`, `export`, `delete`, or sensitive personnel-location operations
are enforced for every application. Those require each domain-specific authoritative
guard to consult the same central policy in Phase B. This boundary is intentionally
shown in the interface rather than providing nonfunctional toggles.

## Security acceptance gates

| Requirement | Classification before signed test | Evidence |
| --- | --- | --- |
| Exact two bootstrap accounts | VERIFIED | Existing server-side UUID binding |
| New bootstrap-only RPC authorization | IMPLEMENTED-UNVERIFIED | Auth UID + active workspace predicate, no JWT impersonation |
| Application role revision and persistence | IMPLEMENTED-UNVERIFIED | Existing table and domain delegated RPC; no signed live mutation |
| Board editor/viewer persistence | IMPLEMENTED-UNVERIFIED | Existing board membership table; no signed live mutation |
| Current-session authorization updates | IMPLEMENTED-UNVERIFIED | Existing read-through RPC checks; no all-app runtime acceptance |
| Multi-workspace isolation | IMPLEMENTED-UNVERIFIED | Existing workspace check and fail-closed multi-workspace guard |
| Protected administrator restrictions | IMPLEMENTED-UNVERIFIED | Self/protected/platform-admin denial |
| Actor/target/before/after audit | IMPLEMENTED-UNVERIFIED | Existing append-only audit + atomic applied event |
| Frontend bootstrap-only visibility and CSP | VERIFIED (source/CI), live UI PENDING | No inline styles; feature branch only |
| Twelve application workflow integration | PENDING | Actual domain-source-specific acceptance is Phase B/C |
| Production merge | BLOCKED pending explicit approval | No merge planned |

## Required signed validation

Use the two existing bootstrap admin sessions. Under a specifically approved isolated
nonproduction account and board (not real operational user permissions), perform a genuine
signed RPC assign, read-back, fresh-session denial/allow verification, revoke, and audit
correlation. Verify that an existing non-bootstrap administrator fails direct RPC,
cross-workspace calls fail, protected bootstrap targets fail, and stale revisions return
409. Do **not** impersonate or fabricate signed JWTs in SQL.

No normal-user changes or full application integration tests were performed by
publishing this feature branch.
