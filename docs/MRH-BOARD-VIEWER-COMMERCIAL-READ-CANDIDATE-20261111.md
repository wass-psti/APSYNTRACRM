# Material Request Hub — Board-Viewer Commercial Read Candidate

2026-11-11. **IMPLEMENTED / DISPOSABLE VERIFIED / NOT ACTIVATED IN PRODUCTION.**

## Root cause
The production frontend and the existing private.mrh_sourcing_scope both require Material Request Hub module ADMIN for protected field access. This explains why an ordinary employee in Work Management sees Restricted, despite existing commercial values for material 001. Removing just the frontend restriction would not work.

## Exact proposed access change — separate approval required
Allow **active signed members of Work Management who already have authorized VIEW access to the Material Request Hub board** to read its existing private commercial material fields. This includes employees. The returned fields include buying/selling price, requestor, accounts, supplier PO, rates, shipping and vendor details. This is a material expansion of production commercial data visibility.

## Safely staged implementation
- sql/mrh-sourcing-board-viewer-commercial-read-CANDIDATE-NOT-APPLIED.sql adds a separate item-scoped, workspace-scoped SECURITY DEFINER read RPC only, guarded by active signed identity, active workspace membership, authorized board VIEW, correct original group and unarchived item.
- Does not modify private.mrh_sourcing_scope, protected write RPC, board-item task read/write RPCs or authentication/RLS rules. This separation avoids unintentionally broadening write/task privileges.
- Grants RPC EXECUTE to authenticated only, not anon. No direct private-table grants. No production board, item, group, role, column, policy or data changes.
- SQL file is explicitly marked CANDIDATE-NOT-APPLIED and is not run by frontend or build scripts.

## Verification
- Three Node security contract tests PASS.
- Disposable PostgreSQL 17 local-only fixture PASS: current authorized board viewer can read, foreign workspace/denied board/anonymous/archived item cannot; RPC grant policy and no direct sensitive table reads verified.
- Full frontend regression 1,707/1,707 PASS; generated CSS bundle check PASS.

## Activation boundary
Obtain separate explicit approval for the **exact audience and field scope** above, then activate through protected migration, verify grants and actual signed employee/administrator reads, denied foreign/anonymous/revoked sessions, and implement the frontend read call using this new RPC. Keep all writes and task operations under existing protected scope. No new project or test users. Until approved, the employee will still see Restricted.

## Rollback
Revoke EXECUTE on the new RPC from authenticated immediately if access must be contained. No private records need to be deleted. Do not replace shared scope or broaden existing task/write capabilities.
