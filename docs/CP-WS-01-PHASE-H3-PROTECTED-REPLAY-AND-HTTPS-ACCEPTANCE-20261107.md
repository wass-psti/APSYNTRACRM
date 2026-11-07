# CP-WS-01 Lifecycle Phase H3 — Protected source replay and independent signed HTTPS acceptance

**Date:** November 7, 2026  
**Production activation decision:** **NO-GO**. This is a non-mutating production inspection plus a protected-source provenance gate, **not** an approved security-function migration, permission change, or completed source replay.

## Verified production baseline

Read-only `pg_proc` inspection established the expected source identities, ACLs and ownership for three core `SECURITY DEFINER` functions: `current_workspace_id(uuid)`, `has_module_access(text,uuid)`, and `module_role_for(text,uuid)`. Their SHA-256 fingerprints are recorded in `sql/tests/cp-ws01-h3-private-core-source-manifest.json`, **without including function bodies**.

The H2/G4B/G4C source inventories identify 63 workspace lookup callers and 54 direct role-function dependents, with 44 overlapping definitions and **73 distinct affected routines**. Matching catalog fingerprints are a source-drift prerequisite, **not a demonstration of compatibility or runtime authorization after hardening**.

Existing production `authenticated` EXECUTE applies to the shared workspace lookup and `has_module_access`, but not directly to `module_role_for`; `anon` has no direct EXECUTE on any of these three. The source snapshot also preserves the verified owner, return type, language, volatility, and `search_path` for change review. Do not broaden grants for convenience.

## Implemented H3 gate — protected source preflight

`scripts/ws01-h3-private-source-guard.mjs` validates the source and ACL manifest against existing 63/54 caller catalogs. Its optional offline private-source inspection rejects:

- A source directory inside the repository; relative paths, symlinks, incorrect ownership and group/world-readable directories.
- Unexpected, missing, duplicate, symlinked, hard-linked, oversized or group/world-readable source files.
- Any bytes differing from the **exact** live `pg_get_functiondef` SHA-256 snapshot, including end-of-file formatting.
- Source metadata/ACL drift and a 73-function dependency union that differs from the previously verified inventories.

The verifier **does not execute SQL, connect to Supabase, expose source contents, generate migrations, publish snapshots, or authorize production deployment**. Its failure messages include no SQL, account data, tokens or file paths. Node test coverage uses only fabricated SQL strings in disposable local temporary directories; the test files are removed automatically.

A trusted operator can prepare three *read-only* source snapshots in an isolated, access-controlled directory outside the public checkout, with strict 0700/0600 permissions and no archived output or CI upload. After independently obtaining the precise live definitions through approved secure tooling, the **offline preflight** is:

```bash
node scripts/ws01-h3-private-source-guard.mjs --manifest-only
node scripts/ws01-h3-private-source-guard.mjs --private-dir=/absolute/private/source-directory
```

A successful private-bundle preflight proves the snapshot matches the pinned **baseline**, **not** that a patched hardened implementation exists. Do not confuse baseline fingerprints with a reviewed candidate's new fingerprints.

**Source-faithful replay remains a separate required step.** It needs a protected, signed-off patch candidate, source-identical dependent definitions and dependencies, explicit authorization design for delegated admin role management, an isolated PostgreSQL 17 execution environment, full positive/negative module regressions with the hardening active, and a verified SQL/ACL rollback. Do not place the unpatched source or sensitive rollback bundle into this public repository. The earlier direct public staging attempt was blocked; do not bypass that control.

## Genuine signed-user HTTP acceptance

The deployed APSYNTRA CRM Security view already has a two-step **read-only foreign-workspace table RLS acceptance** feature. It uses direct PostgREST SELECT, not privileged RPCs. Its authorized row reference is held only in the current tab for about 15 minutes, is not exported, and is cleared on refresh.

As inspected on November 7, **no authorized row reference was retained**. The current administrator is not a valid substitute for a foreign-workspace user. The second leg requires an **independently signed, existing authorized user whose actual workspace membership excludes the source row's workspace**. This cannot be manufactured through a role claim, JWT impersonation, a database service role, or an admin-only browser test.

The user-controlled safe sequence when such a pair of existing sessions is available:

1. In the Security tab, while signed in as the legitimately authorized **source** user, choose **Capture existing authorized row**. Do not create a test row just to make the check pass.
2. Within the tab's retention window, change to the *genuinely distinct existing* foreign-workspace user's authorized session, without exporting JWTs or row identifiers. Use the UI's second-step **Test after signing in as foreign-workspace user**.
3. Record the UI's redacted PASS/FAIL result and actual identity/workspace denial. A missing source row, expired row reference, loss of session or lack of a second account is **BLOCKED/INCONCLUSIVE**, not PASS. Preserve existing role and RLS policies throughout.
4. Independently review member/owner/expired/revoked denied-action acceptance; avoid the separate revocation control unless deliberately prepared to end the current browser session and reauthenticate.

Chat-mode browser access is read-only, so no button click or sign-in transition is claimed here. No user credentials, JWTs, account IDs or row data are requested or recorded.

## Required go/no-go evidence

| Gate | Classification |
| --- | --- |
| Three core live source/ACL fingerprints | VERIFIED via read-only catalog metadata |
| Combined 73-routine source-identity preflight | VERIFIED via read-only inventory + automated CI |
| Protected bundle verifier and denial tests | IMPLEMENTED; verify with GitHub CI |
| All real production role functions executed after review in isolated PG17 | **PENDING** |
| All 73 real callers exercised with hardened lookup active | **PENDING** |
| Genuine second signed-user foreign-workspace HTTPS denial | **BLOCKED** until two independently controlled existing sessions + authorized source row |
| Reversible migration with exact owners, ACLs and trusted rollback backup | **PENDING** |
| Production lookup, workspace selection, configuration update, invitation delivery | **NOT ACTIVATED** |

**Security classification:** H3 improves protected-source readiness and formalizes the independent signed-user acceptance path. It is **not** final Phase H3 closure, full source-faithful security certification or production permission to activate.
