# CP-TT-AUTO-CLOCKOUT-01

## Scope

Implement conditional automatic Clock-Out for native TimeTracker attendance sessions using the existing credited-work policy, approved overtime records, persistent scheduler state, and the existing attendance board projection.

## Policy

- The threshold is nine hours of **credited working time**, calculated with the existing TimeTracker policy. The existing unpaid 12:00–13:00 Asia/Manila lunch deduction remains authoritative.
- The 30-minute grace period begins at the exact calculated threshold, not when a browser timer happens to wake up.
- Approved OT that covers the threshold, or begins within the grace window, extends the session to the approved OT endpoint.
- OT approval must be recorded before the grace deadline to cancel grace expiration. Further contiguous approved OT can extend the cutoff when approved before the current endpoint.
- Submitted, rejected, cancelled, expired, foreign-owner, non-covering, or late-approved requests do not extend the session.
- Automatic closure timestamps use the exact grace deadline or approved OT endpoint, not the later cron processing time.

## Runtime design

1. An AFTER INSERT OR UPDATE OF value trigger on the existing shared TimeTracker attendance state creates durable monitoring state in the same transaction as a successful Clock-In.
2. A private scheduler table stores the session identity, original Clock-In timestamp, calculated threshold, grace start/deadline, OT cutoff, processing state, and errors.
3. The dedicated Supabase Cron job runs the private worker every 30 seconds. It does not depend on an open tab, browser timer, or client restart.
4. The worker uses the existing per-employee attendance advisory lock before taking scheduler or attendance row locks. The existing OT submit and decision RPCs acquire the same lock before their writes, preventing an approval/expiration race without changing their existing approval policy.
5. The worker updates the authoritative attendance state, revision, backup, audit source, private board projection, and existing typed board fields in one transaction.
6. The signed timetracker_auto_clockout_snapshot read exposes only the current actor's active session schedule. The Clock view renders the persisted deadline and a local countdown; the countdown is display-only and does not perform attendance writes.

## GPS evidence

A server-side scheduler cannot obtain a live browser GPS fix. Automatic Clock-Out therefore records geo.status = not_captured and geo.source = server-auto-clockout. It never copies or relabels a stale Clock-In coordinate as a new Clock-Out GPS capture. Manual Clock-Out continues to use the existing fresh-browser-GPS flow.

## Activation boundary

The migration records an activation timestamp and deliberately does not backfill sessions that were already open. Only Clock-In sessions created after activation are automatically monitored. This preserves existing production attendance records during rollout.

## Existing workflow preservation

- Existing signed Clock-In and manual Clock-Out contracts remain unchanged.
- Existing OT submit/approval policy, roles, and authority checks are preserved; only lock ordering is extended to serialize OT writes with the worker.
- No new user-facing permission gate, role, workspace, board, or Supabase project is introduced.
- Existing attendance board identity and typed-column contract are retained.

## Verification

- TimeTracker test suite: 300 tests passed.
- Full project test suite: 2,909 tests passed.
- Production build: passed.
- Repository lint: passed.
- Targeted ESLint for all changed TimeTracker JavaScript and test files: passed.
- TimeTracker browser fixture acceptance: passed.
- Database migration 20261119200735_cp_tt_auto_clockout_01_conditional_session_expiration is recorded in the linked Supabase project.
- Production scheduler job tt-auto-clockout-processor is active at 30-second intervals; seven cron executions were observed as succeeded.
- Database readback verified the attendance trigger, worker, signed snapshot RPC, OT lock ordering, and scheduler function. The signed snapshot is executable by authenticated users and not by anon; the private worker is not executable by authenticated users.
- The scheduler table currently contains zero rows because no new Clock-In session has been created after activation. This is expected; the existing pre-activation session is intentionally excluded.

## Remaining acceptance

A genuine new Clock-In followed by the nine-hour threshold/grace transition and board synchronization has not yet been exercised with a disposable signed employee session. The approved-OT bypass and continuous extension also remain pending genuine two-account acceptance. No production attendance test record was created.

## Rollout note

At implementation time, the live database had one pre-existing active attendance session. Its Clock-In timestamp predates the activation timestamp; the session remains open and unchanged. The automation applies to subsequent Clock-In sessions.
