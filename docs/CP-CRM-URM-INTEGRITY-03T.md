# CP-CRM-URM-INTEGRITY-03T — Four-native role persistence and controlled mutation

## Verified production baseline (2026-11-20, read-only)

Two independent, genuine Work Management signed sessions remain valid: Employee pseudonym `b1e02906d0de0c62`, Administrator pseudonym `74085cf92fe5c39a`, workspace `11e594f481958c10`. The Employee's existing four persisted workspace assignments are TimeTracker **Employee**, Fund Tracker **REQUESTOR**, FuelTrack+ **User**, and TradeLink **User**. These already match the corresponding native effective-access roles. All four applications were previously verified in genuine Employee initial and refresh browser phases; the TradeLink Administrator native domain readback also passed with the role-aware acceptance correction in merged PR #643.

Changing any of these already-correct production assignments would be a material permissions change. No production role or business writes were authorized for this checkpoint and none were executed.

## Controlled disposable lifecycle

The dedicated PostgreSQL 17 acceptance path uses the **existing real scoped role writers** `apsyntra_role_scoped_six_set`, `apsyntra_role_frt_workspace_set` and workspace role snapshots with only synthetic actor/workspace IDs. It tests four-module assignment, persisted database snapshot, effective role readback under a distinct Employee actor, revocation, isolated workspace behavior and original legacy-role restoration in the disposable fixture. FRT's corrected canonical `apsyntra_scoped_module_role` source is loaded from the merged production migration. The database is thrown away after CI.

No production credentials or user data are copied to this fixture. The test does not create any role, RLS or grant restrictions. Since independent Chromium Employee and Administrator sessions were already verified and their four native application reads passed, the combined evidence exercises role persistence and session projections, **but does not constitute proof of a genuine signed production role-mutation transaction**.

If the disposable lifecycle and CI pass, the active functional defect is closed. Any later live production mutation acceptance requires an explicitly approved target and the original role values for reversible writes.
