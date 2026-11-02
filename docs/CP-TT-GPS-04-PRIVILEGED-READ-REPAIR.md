# CP-TT-GPS-04 — CTE Lifetime / Signed GPS Snapshot Fix

## Production incident and evidence

The existing production function `public.timetracker_gps_snapshot(uuid,date,date,uuid)` references the CTE `bounded` in its final PL/pgSQL `RETURN`, **after** the `WITH` statement ends. PostgreSQL CTEs are only in scope for the statement that defines them. This causes the privileged signed read to fail even when the authoritative attendance state contains captured GPS fixes.

Fix: compute `v_truncated` inside the existing `WITH` statement using `(SELECT COUNT(*)=501 FROM bounded)`, and return the local variable rather than referencing the CTE after that statement.

The patch preserves the existing `timetracker_ot_require_scope` and bootstrap/assigned Supervisor authorization checks, the 31-day bounded window, sanitized 500-event maximum, workspace/membership filter, existing RPC signature, and existing `authenticated` / `anon` grants. No employee data is modified.

## Release conditions

1. Review `sql/cp-tt-gps04-fix-privileged-snapshot-cte.sql` and the successful disposable PostgreSQL acceptance. This is a production function DDL operation and needs the trusted database change path. Do not use a live employee's JWT as a test fixture.
2. Confirm connected Supabase project `jtlusodorfnyzgyuewkz` and preserve current function definition, ACL, and a tested rollback to the previous definition. Apply this SQL **once**, transactionally.
3. Run the *read-only* catalog check that the `truncated` value now uses `v_truncated`, that the `WITH` query still enforces the 500-event maximum, and that authenticated and anonymous execution privileges remain unchanged.
4. With an approved signed QA bootstrap administrator or assigned Supervisor, open Attendance Log, expand a record, choose **Load recorded GPS** and verify that both the panel stays open and the server-returned precise clock-in/out fixes are displayed. Test an ordinary member denied both at the RPC and in the frontend. Do not reveal coordinates in CI logs or public GitHub issues.
5. If the function update fails, roll back the transaction. If post-install acceptance fails, use the prior function definition through controlled rollback, preserving current authorization; do not grant broad module state reads.

## Current status

Source and CI implementation is independent from production installation. A prior failed GPS UI commit (`d86f5cb`) was corrected in successor `1e0a428`; the expansion/UI message fix is `b3e2001`. GPS-04 production DDL is **not applied** by GitHub Pages or disposable CI.
