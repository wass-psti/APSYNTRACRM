# CP-BOARD-COL01 — Security candidate for genuine board collaboration (NOT ACTIVATED)

Status: IMPLEMENTED-UNVERIFIED until disposable PostgreSQL CI validates; no production database, membership, role, storage, or attendance mutations are authorized or executed by this repository change.

## Live contract inspection
On 2026-11-03, read-only Supabase schema/function/grant inspection confirmed:
- Existing public Work Management tables for board members, item updates, item files, events and private Storage with RLS.
- Existing add/delete update, member grant/revoke, file-registration and board-event read RPCs.
- Existing wm_add_board_member checked caller manage and target active profile but not an explicit same-workspace active membership prerequisite; it also allowed changing the owner role by upsert. No client-side invitation writer is enabled until that is corrected and independently accepted.
- Underlying work_board_item_updates and work_board_item_files tables have no authenticated SELECT grants, and no item-scoped list RPC was found. Direct REST access must not be enabled.
- The board-event API caps at 200 without a cursor; the current UI correctly documents that limitation.
- Realtime publication for item updates/files was absent; no permission-safe subscription contract was proven.

## Staged SQL
File: sql/cp-board-collab01-authorization-candidate.sql
- Hardens the existing membership writer against foreign/inactive workspace candidates, target viewer ceiling escalation and owner demotion.
- Provides a manager-only active workspace directory for user selection, with bounded search and no cross-workspace exposure.
- Adds read-only, signed per-item Updates and Files list RPCs that retain the underlying RLS table SELECT revocations. Item and workspace scope checked server-side.
- Adds audit keyset pagination using event ID, with signed board read checks.
- All new RPCs use bounded output, schema-qualified data references, pinned search paths, and explicit EXECUTE grants to authenticated only, with anon/PUBLIC denied.
- No reply/edit/update migration, realtime publication or Storage policy change is activated.
- The candidate is intentionally outside automatic production deployment paths.

## Disposable CI
The separate disposable-collaboration-postgres job creates synthetic identities, two workspaces, two boards, profile/role ceilings, item updates and file metadata. It checks positive grants, foreign target rejection, owner preservation, viewer ceiling, per-item read denial across workspaces, missing session denial, cursor handling and no direct table SELECT for authenticated.
The results are a candidate-level proof under simulated signed actors, NOT a signed production acceptance.

## Production activation gate (BLOCKED)
Production permission changes require separate approval and an explicit rollback plan. Before activation:
1. Independently review security definer privileges, all target member ceilings, exact live schema and SQL advisory findings. Account for existing authentication session revocation.
2. Verify edge cases: inactive/non-member, same-email casing, owner role, existing editor, cross-workspace board, double invitation/concurrency, stale privileges, revoked session, and audit completeness.
3. Add a fail-closed rollback for the membership writer and reversible drops for additive APIs; preserve the pre-change definition in a controlled migration record.
4. Run independent read-only production preflight and disposable acceptance; obtain explicit production rollout approval.
5. Only then implement frontend Invite, Updates, thread replies, notifications and attachments behind the signed verified contracts. Do not claim production availability solely because the SQL file is committed.

Reference official Supabase database functions / RLS docs and pinned security guidance before activation.
