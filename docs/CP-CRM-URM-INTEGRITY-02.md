# CP-CRM-URM-INTEGRITY-02 — Disposable Role Mutation and Capability Readback

**Scope:** Existing APSYNTRA CRM role-management contracts, existing Supabase schema/migrations, synthetic nonproduction identities only. No production user records, permissions, roles or RLS changed.

## Executed contract matrix

| Acceptance gate | Mechanism | What can be concluded |
| --- | --- | --- |
| Module assignment → persisted readback | Existing `apsyntra_role_manage_user_access` RPC against isolated PostgreSQL and synthetic Order Intake user | Backend records must match the requested role and include an immutable audit receipt |
| Role update and revocation | Existing role RPC, `updated_at` compare-and-set revision, stored row and `module_role_for` readback | Mutations must persist and recomputed effective module role must reflect revocation |
| Workspace Board viewer/editor/revoke | Existing Board membership RPC and authoritative `work_board_members` readback | Exact Board membership must be present/changed/absent as requested |
| CRM platform viewer → inherited role | Existing CRM platform role RPC and `apsyntra_crm_effective_role` | Explicit workspace-tier and reversal must be reflected immediately in signed actor context |
| Stale/conflicting concurrent write | Reuse outdated `updated_at` | `PT409` rejection must preserve latest stored state; genuinely parallel transactions require separate testing |
| Cross-workspace target and non-admin mutation | Simulated signed actor identities through the existing `auth.uid()` fixture | Denied writes must not persist unauthorized assignments |
| Cross-tab successful role mutation | Mock-backed real `DomainApi`/`BoardCacheChannel` objects using same-origin message semantics | Same-user/workspace message delivery and denied mutation silence are tested, not actual browser-session propagation |
| Cross-session role recalculation | Synthetic separately-selected signed target actor context | Database function recalculates without token refresh; not a proof of actual second browser login |

## Isolation

- The runner uses an isolated Docker PostgreSQL 17 container with `--network none`, read-only filesystem, tmpfs data directory, and no production credentials or network access.
- The acceptance SQL wraps mutable cases in an explicit `BEGIN` and `ROLLBACK`; the disposable container is destroyed afterward.
- Reuses the repository's proven `cp-urm04b-disposable-setup.sql` fixture and `20261112121235_cp_urm04b_crm_admin_capability_parity_20261112.sql` migration. This covers genuine SQL RPC behavior **at that pinned contract version**, not all subsequent production migrations.
- Existing compatibility and role validation are preserved. No new authority ceilings, permissions, gates, or privilege changes.

## Outstanding acceptance

- **PENDING:** the complete set of specialized workspace-scoped role write/readback RPCs, two independently signed accounts in a real browser, actual capability execution and denial for all four currently native applications, refresh/reauth persistence, different-user cross-session propagation, and genuinely parallel transaction serialization.
- **PENDING:** any end-to-end behavior reliant on newer migrations not contained in this fixture.
- This milestone does not silently backfill the 35 unresolved historical Charter Navigator assignments or convert the remaining eight board-linked applications to native UIs.

Next, if disposable SQL and CI pass, run **CP-CRM-URM-INTEGRITY-03 — Signed Two-Account Native Capability, Workspace-Scoped Role Mutation, and Cross-Session Closeout** with independently authenticated nonproduction users. Production role changes require separate authorization.
