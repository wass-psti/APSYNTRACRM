# CP-NATIVE-APP-AUTOSYNC-12 — Staging baseline dependency and live signed QA readiness

## Disposition

IMPLEMENTED / LOCALLY VERIFIED. STAGING BACKEND ACTIVATION AND GENUINE SIGNED ACCEPTANCE BLOCKED.

This checkpoint verifies the repository's role-related migration provenance and evaluates the real existing staging inventory, without creating users, migrating staging, granting roles, editing authorization, or altering production.

## Read-only staging evidence (November 22, 2026)

- Existing staging: apsyntra-invites-staging, project ref jeqwjlxubntsddeauvqa.
- Exactly two Auth users, two workspace membership rows, and zero tracked schema migrations.
- No canonical work_boards or module_role_assignments tables; no role snapshot or registered module catalog RPCs. Other missing role/audit/guard prerequisites documented in CP09–11.
- No three independently authenticated browser/CDP endpoints at localhost ports 9222, 9223, 9225, 9226 or 9333. No eligible third signed QA identity was established.
- No target newly registered module ID with a verified backend role vocabulary, domain assignment writer, and authoritative readback was established.
- Existing staging invitation and workspace private functions and current data must be preserved. Do not blindly replay a recovered production migration ledger over this partial staging environment.

## Delivered

- scripts/cp-native-app-autosync-12-plan.mjs verifies SHA-256 and byte lengths for eight exact migration anchors from the recovered production foundation through the subsequent role-management variants and native registration projection. It identifies missing role-backend capabilities, independently signed sessions, approved new-module contract, and restoration evidence.
- frontend/tests/cp-native-app-autosync-12.test.mjs tests source validity, real staging missing prerequisites, tampered SQL detection, missing writer contract, malformed inventory and insufficient Auth identity count.
- The plan reports BLOCKED using current observed staging inventory despite all migration source anchors matching. It does not apply migrations or grant any access.
- Existing CP10/11 disposable PostgreSQL clone tests remain the valid local SQL-only persistence/rollback evidence; they are not genuine HTTP/Auth signed three-session acceptance.

## Migration dependency sequence (source files, not authorization to apply)

1. Boards core recovered foundation, stage_g_m46.
2. Boards table/group/item recovery, stage_g_m47.
3. Role-configuration bootstrap prerequisites, cp_rc011. Depends on specific preexisting bootstrap identities and cannot be installed into a partial staging schema blindly.
4. Original centralized role writer and snapshot, cp_rc02.
5. Preservation of existing explicit assignments, cp_rc02 follow-up.
6. Workspace-scoped material request role compatibility, cp_rc03.
7. CRM Admin capability parity and scope guard, cp_urm04b.
8. Native registration read-only projection, cp_native_app_autosync_03. This only discovers registered modules; it does not create a new module's role vocabulary/writer.

A staging-compatible recovery must first reconcile the divergent profiles table, existing private invitation routines, constraints, grants, triggers, ownership and migration provenance on a true isolated staging clone. The verified source order is not a complete migration deployment plan.

## Remaining gate requirements

- Build and validate an isolated **staging-compatible** clone from the current staging schema and nonproduction-only data; preserve invitation functions and reversible backups.
- Reconcile and activate CRM baseline with approved, reversible staging-only changes, preserving current authorization semantics.
- Have three independent, genuinely signed nonproduction QA sessions: a legitimate workspace administrator and two target members, with separate GoTrue sessions and authoritative readback.
- Identify an actual newly registered module and verify its declared domain-specific roles, server assignment writer, and signed reader; never invent arbitrary roles or bypass the existing backend.
- Capture initial QA assignments, execute individual and bulk changes, verify independent signed cross-session persistence, negative/collision behavior and exact restoration.
- Re-run all CI/review gates and obtain separately approved production activation. Do not merge draft PR #760 based on this read-only preflight alone.

## Next checkpoint only if still blocked

CP-NATIVE-APP-AUTOSYNC-13 — Staging-Compatible Clone Recovery and Approved Genuine Three-Session Role Acceptance with Verified Module Writer and Restoration.
