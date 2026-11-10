# CP-WS01 — Protected source-faithful cutover acceptance

Date: 2026-11-10 (Asia/Manila)
Repository: wass-psti/APSYNTRACRM
Candidate: draft PR #206, feat/ws01-signed-workspace-switch-20261110
Target: existing WatchdogWorkspace Supabase project only

## Decision

**SOURCE PROVENANCE VERIFIED; SOURCE-FAITHFUL RUNTIME BLOCKED; PRODUCTION NO-GO.**

Do not replace current_workspace_id, install workspace selection functions,
grant authenticated RPC EXECUTE, flip selection_enabled, or deploy the
workspace-switching frontend until the protected runtime and recovery gates
below pass. No such production changes were made in this checkpoint.

## Verified production read-only

The current production state still contains no wm_ws01_select RPC and no
ws01_prune_session_choices function. selection_enabled=false; zero session
choice rows. The existing signed workspace UI continues to display the
disabled selection button.

The existing employee account has active memberships in Main Workspace and
Work Management. Membership enrollment is not the blocker.

The exact inventory-driven read-only source verification returned:

- expected_total: 74
- located: 74
- missing: 0
- drift: 2
- permission_drift: 1
- documented_live_evolutions: 2
- unexplained_drift: 0
- status: DOCUMENTED_LIVE_EVOLUTION__RUNTIME_UNVERIFIED

The documented revisions are:
- public.wm_auth_access_context(): historical hash
  7b60bbc93690cbdf34c9db2e7c541e1a563a385aeeae75642fb1c2e6e7eb49d7;
  observed hash
  b73a1b4e3bb10f8412405cea38a95c870ca26d45dc8d60154f91957b1fcd376b
- private.tl03_commit(...): historical hash
  5fb4ac5d256746444786826d8128abdcfa5c54ecbe145aff5fd55fa25a89119d;
  observed hash
  08da27924332a9cd8290ff6e7e379308567e6f26f1ae5e6ac443c412489ac618

The TradeLink function also has a known historical authenticated EXECUTE
difference (previously denied, now granted) after the separately staged
TradeLink feature activation. Permission history is not rewritten.

## Implemented in this increment

- scripts/ws01-h3-private-source-guard.mjs now recognizes these **exact**
  source revisions in live-mode hash verification and metadata-only catalog
  SQL. The original historical source inventory remains unchanged.
- scripts/ws01-activate04-acquire-protected-sources.mjs can classify only
  these exact source hashes and tightly pinned owner/security-definer/
  authenticated/anonymous EXECUTE metadata before acquiring private sources.
- Tests prove both exact classifications and rejection of altered source
  identities, hashes, ownership, SECURITY DEFINER state, and grants.
- Neither code change exports private function bodies, changes the database,
  or claims functional compatibility from fingerprint checks.

## Protected PostgreSQL 17 replay

A local PostgreSQL 17 container runtime is available. However, the required
74-file access-controlled live source bundle and a production read-only
PostgreSQL source acquisition connection are **not** available to this
execution. The owner-host replay script verifies this bundle, compiles the
real source, and exercises the bounded original-domain case subset. It has
NOT been run with genuine protected live sources here.

Even a PASS from that bounded subset cannot by itself certify execution of
all 73 affected caller paths under the revised resolver. The owner-led
acceptance needs a real source-faithful case matrix covering:
1. Existing role-delegation paths and original API response compatibility
2. Signed Admin/employee, foreign workspace and foreign actor target denial
3. Anonymous, expired, revoked and membership-removed signed sessions
4. Concurrent selection CAS, session choice pruning, audit integrity
5. Board and module authorization isolation, cross-workspace read/write denial
6. Exact restoration of prior function definitions, ACL and session flags

## Recovery

The project-wide objectives are RPO 24 hours and RTO 24 hours with a
mandatory recovery rehearsal for both PostgreSQL and Supabase Storage.
No evidence of a completed **database plus Storage** restoration rehearsal
is available in this execution. An existing provider backup listing or
local disposable PostgreSQL replay is not equivalent to that rehearsal.
Recovery acceptance therefore remains BLOCKED.

## Signed browser and release

The selected live browser tab belongs to an existing employee and shows
Switch workspace — unavailable. Browser inspection is read-only, while
the authorized Mac's active Chromium tab is a separate origin without an
accessible APSYNTRA session. No real signed workspace selection was
performed; the server RPC is absent.

PR #206 is still a protected draft candidate; no merge or Pages
deployment took place. Source provenance and CI success must not be
misreported as production end-to-end acceptance.

## Next execution

**CP-WS01-PROTECTED-REPLAY-AND-RECOVERY-CLOSURE**: acquire the real protected
74-source bundle securely on the owner host, execute the source-faithful
PostgreSQL 17 caller/denial matrix, verify real database-and-Storage recovery
evidence, and only after all checks PASS perform the controlled selection
activation, signed user acceptance and protected frontend deployment.

No extra workspace accounts, new Supabase projects, role changes, ad-hoc
mock production sessions or bypasses are permitted.
