# Default automatic employee clock-out (CP-TT-DEFAULT-SERVER-AUTO-CLOCKOUT-09)

Regular employee attendance now defaults to nine credited work hours without additional grace. The established Manila noon–1 PM unpaid lunch overlap is excluded: a shift beginning at 8 AM normally ends automatically at 6 PM, whereas one beginning at 2 PM reaches nine credited hours at 11 PM. Approved overtime that covers the cutoff and is approved by the cutoff extends the session to its approved endpoint. Unapproved or late-approved OT does not extend the cutoff.

The existing 30-second pg_cron job closes due sessions server-side, including prior PENDING_GPS and eligible already-open signed sessions. The saved clock-out timestamp is the calculated cutoff, not the later worker execution time. The automatic audit source and no-capture GPS evidence are retained. Completed records are untouched. Legacy records without a linked Board projection are closed without fabricating a projection. The original reason code is retained for compatibility with existing readers, with zero grace.

OJT retains its separately deployed nine elapsed-hour scheduler. No change to its existing policy or to manual clock-out GPS requirements.

## Deployment and verification

After CI and a disposable database test pass, review existing active records and approved OT with HR before deploying the migration. It enrolls already-open records and the next cron tick can close overdue ones at their historical policy cutoff. Apply the migration through the normal Supabase remote migration workflow; GitHub Pages deployment alone does not activate server behavior. Verify the cron job and audit/Board consistency, and review any worker ERROR rows. Do not rerun production migration until its source and actual applied state are verified.
