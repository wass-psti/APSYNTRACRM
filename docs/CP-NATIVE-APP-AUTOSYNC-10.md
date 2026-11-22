# CP-NATIVE-APP-AUTOSYNC-10 — Disposable CRM foundation clone and staging compatibility

## Disposition

LOCAL CLONE ACCEPTANCE VERIFIED. LIVE STAGING RECOVERY, THREE SIGNED PROFILES AND NEW MODULE CONTRACT STILL BLOCKED.

This phase executes a real, reversible local PostgreSQL 17 database clone and scoped SQL acceptance while preserving the partially initialized apsyntra-invites-staging branch. The clone is made from the **local disposable CRM fixture**, not from staging: it is a compatibility test, not a verified restoration of staging or signed-user acceptance.

## Read-only staging inspection (November 22, 2026)

- Existing Supabase staging project ref jeqwjlxubntsddeauvqa has 14 application tables and zero tracked migrations, unlike the recovered production baseline.
- Public profiles in staging has six columns: id, email, display_name, email_verified_at, updated_at and status. The local CRM foundation additionally uses platform_role and created_at. Blind migration replay can conflict with these differences and current data.
- Basic workspaces and workspace_members columns match the local fixture; their constraints, triggers and semantics require further comparison.
- The three public tables have RLS enabled and no direct table policies. The existing private invitation/workspace functions must remain functional. No policy or grant was changed.
- Canonical board, module assignment, audit, signed scope and role RPCs are missing in staging. Only two Auth users exist and three independently signed QA participants are not established.
- The companion SQL under sql/acceptance/cp-native-app-autosync-10-staging-compatibility.sql inventories columns, private/public functions and policies without writes.

## Implemented disposable acceptance

- scripts/cp-native-app-autosync-10-disposable-clone.sh runs only against the existing supabase_db_cp16019-disposable-local container, refuses an existing clone database, uses an exclusive local lock and creates cp_native10_disposable from template0.
- It exports and restores only public, auth and private schemas from the local fixture. Vault and full Realtime data are excluded. The clone-only no-op realtime.send allows board triggers to execute in SQL tests but is NOT live synchronization evidence.
- Existing CP04 registry lifecycle covers simulated workspace claims, registration, rename, duplicate resolution, archive and rollback on the clone.
- Two existing synthetic workspace members receive TimeTracker roles. Separate SQL connections verify inserts and updates, the original database constraint rejects an unregistered module, then the assignments are deleted with authoritative local SQL readback confirming the baseline.
- The clone, temporary dump and exclusive lock are cleaned automatically, including on failures. The existing CP04 script was extended to accept only the known disposable clone database as an optional second argument.
- No production/staging tables, accounts, grants, roles, permissions, or migrations were altered.

## Executed verification

- PostgreSQL 17 scoped clone restore: PASS.
- Registry lifecycle and transaction rollback: PASS.
- Synthetic two-member assignment, update, separate SQL connection readback, unsupported module denial and restoration: PASS.
- Post-run source readback: 12 local Auth users, 20 local workspace members, 0 assignment rows, 0 persistent registry functions; clone and archive absent.
- Focused local script tests: PASS.
- These checks are not genuine GoTrue signed accounts, app-specific writer/HTTP calls, browser cross-window or Realtime acceptance.

## Release blockers

To finalize, construct a genuinely staging-compatible clone including the divergent profile and invitation schemas; reconcile source migration order and preserve existing user data and private service functions. Install the reviewed CRM board, module role, audit and signed RPC baseline only in isolated nonproduction. Establish an authorized admin and two genuinely signed nonproduction member sessions, identify a concrete new-module role vocabulary and domain writer, and verify individual/bulk persisted writes, independent signed reload/reconnect readback, denial/conflict and reversible restoration.

No production activation or merging of draft PR #760 is justified by the local SQL fixture alone.

Next checkpoint if blocked: CP-NATIVE-APP-AUTOSYNC-11 — Staging-Compatible Baseline Migration Reconstruction, Verified Signed QA Session Enrollment, Module-Specific Assignment Contract, and Live Reversible Acceptance.
