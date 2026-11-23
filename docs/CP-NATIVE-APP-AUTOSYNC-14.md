# CP-NATIVE-APP-AUTOSYNC-14 — Staging membership-schema fidelity rehearsal

## Disposition

LOCAL REHEARSAL IMPLEMENTED AND VERIFIED. FULL STAGING-SCHEMA RECOVERY, GENUINE SIGNED THREE-PROFILE ACCEPTANCE AND NEW-MODULE WRITER REMAIN BLOCKED.

This checkpoint is a corrective, reversible, nonproduction database test. It does not apply migrations to existing staging, change identities, alter permissions, or deploy to production.

## Verified live staging environment, November 22, 2026

- Existing branch: apsyntra-invites-staging (Supabase project ref jeqwjlxubntsddeauvqa); two Auth users and two workspace_members rows.
- Zero tracked schema migrations. Public work_boards and module_role_assignments do not exist; signed role snapshot and native application registry RPCs also do not exist.
- Private invitation / workspace tables must be preserved with existing membership references and constraints.
- The remote constraint inventory includes private ws01_member_roles relation vocabulary owner/member/collaborator, private ws02d_member_access role vocabulary admin/member/viewer, and composite foreign keys to workspace_members with ON DELETE CASCADE.
- Existing profiles.status permits active/disabled. These invitation/workspace roles are distinct from CRM platform and native application roles.
- Known Chromium debugging endpoints 9222, 9223, 9225, 9226, 9333 did not respond; three genuine signed QA sessions were NOT observed.

## Implementation

- Added sql/acceptance/cp-native-app-autosync-14-staging-membership-fidelity.sql. In a single rolled-back transaction, constructs a temporary mirror of Auth subjects, profiles, workspaces, workspace_members and two private membership role stores, using the observed staging domain checks and foreign keys. It populates exactly two synthetic participants from existing local disposable Auth subject IDs, verifies two role sources, rejects an invalid workspace relation and invalid invitation role, exercises composite membership deletion cascades, and finally ROLLBACK.
- Extended the existing scripts/cp-native-app-autosync-10-disposable-clone.sh to execute CP14 as part of a fresh isolated PostgreSQL 17 clone. No new permanent tables or credentials.
- Added frontend/tests/cp-native-app-autosync-14.test.mjs to enforce temporary-table-only boundaries, source role vocabularies, composite foreign key semantics and teardown.

## Executed acceptance and limits

- Scoped local PostgreSQL 17 public/auth/private schema clone: PASS.
- Recovered staging-shaped profile schema compatibility, including active/disabled and platform role check: PASS.
- Separate staging-shaped invitation/workspace membership relationship and cascade tests: PASS.
- Existing synthetic registered module lifecycle and two-member SQL assignment/readback/restore: PASS.
- Temporary database, archive and lock removed. Local source assignment count zero.
- These results test a SELECTED set of observed staging constraints, not a complete copy of the staging database schema, invitation functions, Auth sessions, roles or policies.
- New native application role vocabulary and writer are not installed; no genuine signed three-profile HTTP/browser workflow was tested.

## Outstanding before production acceptance

1. Obtain and validate a faithful existing-staging schema clone (including all 14 public/private app tables, triggers, RLS policies, functions and migration dependencies). Reconcile with the canonical CRM baseline and preserve staging invitation/workspace data.
2. Activate reviewed CRM board/assignment/audit and signed role RPC contracts in staging only after verified rollback and baseline provenance.
3. Establish three independent authenticated nonproduction subjects with a legitimate workspace-scoped administrator and two members.
4. Identify the actual newly registered application's specific module ID, explicit role vocabulary, backend writer and signed reader.
5. Perform authenticated individual/bulk edits, independent browser reload/readback, conflict/denial tests and exact restoration, then certify approved release gates.

Next implementation if blocked: CP-NATIVE-APP-AUTOSYNC-15 — Faithful Existing-Staging Schema Clone and Signed Three-Profile Assignment Acceptance with Explicit Module Contract.

Keep PR #760 a draft and do not deploy production from synthetic/local evidence.
