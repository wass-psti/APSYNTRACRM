# CP-NATIVE-APP-AUTOSYNC-15 — Actual staging schema clone and reversible persistence acceptance

## Outcome

**ACTUAL STAGING SCHEMA CLONE VERIFIED. GENUINE STAGING QA AUTH, CANONICAL CRM BACKEND RECOVERY AND NEW-MODULE WRITER REMAIN BLOCKED.**

The existing nonproduction Supabase staging branch is apsyntra-invites-staging (project ref jeqwjlxubntsddeauvqa). The CLI reads **schema only** via its existing OAuth link; no new Supabase project is created, no production or remote staging writes are executed, and credentials or live user rows are not exported.

## Actual staging schema source

Read-only inspection establishes:
- 27 Auth tables, 11 private application tables, 3 public application tables (41 total).
- 16 Auth, 11 private and 3 public tables have RLS enabled.
- 17 Auth/public/private functions and 57 public/private constraints.
- The live staging branch has only two Auth users, two workspace memberships and zero migration-ledger entries. It lacks public.work_boards, public.module_role_assignments, the central role-management snapshot and native application catalog RPC.
- The Auth/extension management subsystem has additional managed objects that a local clone does not completely reproduce.

scripts/cp-native-app-autosync-15-staging-clone.sh uses the existing Supabase CLI to export auth, public, private and extensions **schema definitions only** to a temporary directory. It constructs an ownership-neutral local copy by omitting exactly 78 managed ALTER OWNER statements and 12 managed default-privilege declarations. These omissions do not alter the remote schema. The original SQL and temporary clone are destroyed at exit.

The script creates only cp_native15_staging_clone in the existing local supabase_db_cp16019-disposable-local PostgreSQL instance. It verifies the actual 41-table/17-function/57-constraint/RLS topology. Column, function and RLS metadata MD5 hashes were compared with live staging and match:
- Columns: e37703b8877f3e3e8239a80b0ef7d6df
- Functions: 5d16ab869542c2eae5bb968d125f2d62
- RLS: efcc5ea2f1dffd7075f8513a313a7557

The total constraint fingerprint differs solely in private.ws02d_invitation_delivery_provider_email_id_check, because the local PostgreSQL parser removes redundant parentheses around three associative AND conditions. Live check definition MD5 is f54b41109af8b61bddd720ae63182e12; restored MD5 is d0e76e5e7e92c5380031f3379e79b73d. All other individual constraint definitions match. The runner validates that exact known local fingerprint and checks equivalent behavior on null, blank, valid, invalid and 128/129-character test values.

**Scope qualification:** This is a faithful restore of the observed Auth/public/private schema definitions, modulo the explicitly documented normalization and owner/default-ACL omissions; it is not a byte-for-byte clone of staging-managed extensions, role ownership or grants. It deliberately contains **no live user records or authenticated sessions**.

## Real schema database-write acceptance

The runner tests the **real restored staging tables**, not substitutes:
1. In a fresh isolated clone, inserts three non-login synthetic Auth/profile subjects, one workspace, workspace_members, private.ws01_member_roles and private.ws02d_member_access.
2. On a second independent SQL connection, reads those persisted rows, updates a member's invitation role and another's workspace relation, and verifies invalid values are rejected by actual staging constraints.
3. On a third independent SQL connection, reads those persisted changes and removes a workspace member, checking the resulting composite foreign-key cascade in both private role tables.
4. Deletes the entire isolated database and temporary schema export in an EXIT trap. Existing local Supabase Auth records and workspace assignments remain unchanged.

**Important:** Synthetic rows do not have usable passwords, GoTrue sessions or real browser sign-in. These three database connections are **not** genuine signed QA profiles. Their success does not prove any CRM native-module assignment writer or authenticated application flow.

## Verification and release gates

- New focused CP15 Node tests: 6/6 PASS (source boundaries, clone safety, topology, known constraint normalization, synthetic fixture clarity, independent SQL persistence/cascade).
- Existing CP10–14 regression tests remain applicable.
- Real staging read-only inventory, schema export, local restore, real-table synthetic multi-connection persistence and cleanup: PASS.
- Signed administrator plus two nonproduction user sessions: BLOCKED (existing staging has only two Auth users; independent signed browser endpoints unavailable).
- Complete CRM board/role backend and module-specific writer: BLOCKED (absent in staging; installing production migrations without compatibility review would disrupt the existing private invitation/workspace schema).
- Signed individual/bulk persistence, cross-session readback, revocation/conflict scenarios and exact restoration: PENDING.
- Production merge/deploy: NOT PERFORMED. Keep PR #760 draft.

## Next implementation if blocked

**CP-NATIVE-APP-AUTOSYNC-16 — Apply Compatible CRM Backend to the Verified Existing-Staging Clone, Provision Genuine Three-Session Nonproduction QA, and Accept a Named Module Role Writer with Reversible Signed Persistence.**

Use the proven CP15 clone runner as the starting point. Reconstruct and execute the minimal ordered CRM baseline **only in the isolated clone** and resolve any schema incompatibilities. Then, after reviewed nonproduction activation, establish real independently signed QA accounts and select a concrete module with an explicit role vocabulary and server writer. Verify individual/bulk role writes and readback through the actual application, restore initial state, and only then consider merging or deploying.
