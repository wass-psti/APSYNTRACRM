# CP-TT-AUTO-CLOCKOUT-REACTIVATION

## Scope and safety

Forward-only migration after the three November 25 incident migrations. Deployment requires the retired synchronous trigger to be disabled and a no-op, both regular scheduler jobs inactive, and the cutoff at infinity. It does not activate jobs or touch attendance, OJT, or company provisioning. The isolated worker retains its original nine credited-hour threshold, unpaid lunch calculation, continuous approved-OT cutoff, canonical state/backup/audit transaction and existing board projection.

The current canonical attendance board UUID remains explicitly allowlisted. Its employee eligibility uses the workspace-scoped role helper installed by the company-provisioning migration. This is **not** an authorization to process arbitrary other boards/workspaces; review their attendance contracts separately before expanding scope.

The readiness gate permits manual admin clock-in in both valid modes. Mixed job state, unexpected commands, non-finite cutoff or a revived trigger fail closed. Worker/reconciler use separate nonblocking locks and shared control; operator transitions use an exclusive control lock. No foreground attendance write acquires the scheduler control lock.

Activation enrolls same-day eligible open sessions from current authoritative state, including audit-backed admin entries. Operator confirms the current Manila date and fresh eligible count. Prior-day/invalid/duplicate open records, changed counts, completed/conflicting scheduler rows or unknown cancellations require administrative review. Only incident-cancelled scheduler metadata with the same board/record/workspace/employee identity is reset. Historical closed attendance is never enrolled or rewritten.

## Required staging gate (not yet executed)

1. Use an isolated, disposable PostgreSQL/Supabase environment with the production-compatible schema, cron jobs, canonical board and synthetic fixtures. Never use production for integration tests. Apply the new migration while suspended. Verify the source manifest and run the three TimeTracker source test files, including time-tracker-auto-clockout-reactivation.test.mjs.
2. Execute supabase/tests/tt_auto_clockout_reactivation.integration.sql in a disposable DB session with apsyntra.test_disposable=on and ON_ERROR_STOP=1. Seed at least one eligible same-day open session first; ensure no older open records. Test rolls back its activation. This is a readiness/enrollment integration check, not a complete concurrency test.
3. Exercise signed employee and System Admin clock-in/clock-out RPCs with actual synthetic test identities, including manual clock-in while active and server closure of that record. Verify canonical attendance, revision, backup, audit, typed Board projection, no GPS fabrication, and a subsequent next-day clock-in. Test approved OT before/after cutoff, unapproved OT, manual closure racing the worker, and OJT isolation.
4. Run separate sessions: hold an employee advisory lock, hold the canonical state row lock, and hold the scheduler control lock. Check worker/reconciler return promptly; employee writes are not blocked by scheduler enrollment. Release locks and verify progress. Run both cron jobs for multiple cycles with at least 16 due records. The inherited worker processes at most one acquired candidate per invocation (nominally two/minute at 30 seconds); measure real queue drain time and starvation under sustained contention. Do not activate if throughput or errors are unacceptable.
5. Exercise an incident-cancelled fixture, a conflicting completed row, an older open record, and a mismatched activation count. Confirm conflicts abort rather than rewrite attendance. Check signed workspace eligibility and excluded OJT/shared identities. CI static checks are not a substitute for these database tests.

## Operator runbook after staging sign-off

Run with the authorized database operator only. Merge/deployment alone must not activate. Confirm backups and migration history, and query:

```sql
SELECT private.tt_auto_clockout_mode(), private.tt_admin_manual_clockin_ready();
SELECT jobid,jobname,schedule,active FROM cron.job
WHERE jobname IN ('tt-auto-clockout-processor','tt-auto-clockout-reconcile','tt-ojt-auto-clockout-9h');
SELECT config_key,activated_at FROM private.tt_auto_clockout_config;
```

Expected before activation: suspended, true, both regular jobs inactive, cutoff infinity, OJT unchanged.

Re-run an eligible open-session inventory on the canonical board; count today's open sessions, identify earlier unresolved sessions and conflicts. Review them via the approved attendance admin workflow with evidence, not a bulk historical rewrite. The earlier snapshot of 16 open sessions is not an activation input unless freshly verified. Confirm all relevant employees are in scope. The cutoff is current Manila midnight to include eligible same-day clock-ins.

Only after staging sign-off, execute the private operator function with **explicit reviewed date and count** (example placeholders below; replace them, never blindly copy the earlier count):

```sql
-- SELECT private.tt_activate_isolated_auto_clockout(DATE '<reviewed Manila date>', <fresh count>);
```

Verify active mode, manual clock-in capability true, both jobs active, disabled trigger, fresh enrollment coverage and OJT unchanged. Observe queue status, error counts and actual completed attendance, audit and Board projections over multiple cycles and the following day. Use the recorded policy cutoff rather than the worker's execution timestamp. Confirm real employee clock-ins are successful.

If any error or inconsistent state appears, suspend only the new mechanism:

```sql
SELECT private.tt_suspend_isolated_auto_clockout();
```

If busy, retry after the worker/reconciler transaction finishes. Confirm suspended mode and both jobs inactive. This does not undo committed legitimate clock-outs. Preserve evidence and audit; review unresolved sessions through authorized admin tools. Never enable the old trigger or repair migration history as a shortcut.

## Known remaining release gates

Actual PostgreSQL execution, signed RPC and multi-session concurrency tests are required before merge and activation. The inherited single-board scope and single-candidate worker throughput are retained intentionally pending operational validation. Unsupported or conflicting future scheduler records require alerting/administrative review; no arbitrary recovery of historical sessions.
