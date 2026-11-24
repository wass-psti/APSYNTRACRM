# CP-TT-OJT-AUTO-CLOCKOUT-05 — Nine-hour OJT closure

## Scope

The existing regular-employee TimeTracker scheduler already enforces nine **credited-work** hours with a 30-minute grace interval and approved-OT extension. Shared-login OJT attendance uses a distinct \`private.tt_ojt_attendance\` table; therefore it previously had no automatic clock-out. This migration adds an independent, server-side **nine elapsed-hour** cutoff for each intern identity. It does not change standard employee overtime rules or the pre-Arial TimeTracker UI.

## Behavior

- Every OJT record still active at \`clock_in_at + interval '9 hours'\` is automatically closed; the stored clock-out is **exactly** that cutoff even if the scheduler processes it slightly later.
- Existing active OJT records already older than nine hours will also be closed on the next scheduled sweep. Completed records are never altered.
- The job runs every 30 seconds using \`pg_cron\`, independent of the logged-in device or the browser tab.
- Each automatic closure creates an append-only audit entry with before/after rows and an explicit \`server-auto-clock-out\` action. Existing revision-trigger CAS rules remain in force.
- The automated job does **not** attribute the clock-out to an intern or admin and records GPS as \`not_captured\`, not fabricated.
- Manual clock-out and administrator correction/delete remain serialized by the existing per-intern advisory lock. The worker rechecks the record after locking to prevent double clock-outs or overwriting a corrected start time.
- There is no change to OJT dropdown identity, permission boundaries, location validation at manual clock-in, or UI.

## Production deployment

Prerequisite: \`20261123150000_cp_tt_ojt_admin_record_management.sql\` successfully applied. Check \`supabase migration list --remote\` and do a dry run; deploy only when the pending migration list is expected.

\`\`\`powershell
npx supabase db push --include-all --dry-run --remote
\`\`\`

After review, deploy with \`npx supabase db push --include-all --remote\` using normal production backup procedure. Do not run SQL from the browser or grant authenticated users access to the private worker.

## Read-only verification

\`\`\`sql
SELECT to_regprocedure('private.tt_process_ojt_auto_clockouts()') IS NOT NULL AS worker_exists;
SELECT jobname,schedule,active
FROM cron.job WHERE jobname='tt-ojt-auto-clockout-9h';
SELECT version FROM supabase_migrations.schema_migrations
WHERE version='20261124100000';
\`\`\`

### QA acceptance cases
1. New OJT session for one intern identity closes after nine hours even with browser closed.
2. Two interns under the same company OJT login close independently at their own start + 9h; closing one does not close another.
3. Manual clock-out before nine hours remains unchanged; repeated worker ticks do not add audit entries or clock-out records.
4. IT Administrator edits an active OJT clock-in time; the cutoff recalculates from the corrected start, with revision audit retained.
5. Concurrent manual clock-out, delete, edit and scheduler do not double-close or overwrite a completed record.
6. Logs show completed OJT record on refresh; historical intern name is preserved. Automatic closure records null clock-out actor, non-captured GPS and append-only audit before/after.
7. Regular employee sessions continue to follow their existing nine **credited** hours, grace period, and approved-OT rules.

Actual database/browser checks require a disposable Supabase environment or monitored production validation; static tests alone cannot establish transactional runtime behavior.
