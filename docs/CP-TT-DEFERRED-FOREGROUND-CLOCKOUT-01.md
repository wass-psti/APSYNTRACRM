# CP-TT — Deferred Automatic Clock-Out with Foreground GPS

## Objective

An automatic attendance deadline must not close a TimeTracker session from the server worker. The worker records a durable `PENDING_GPS` state. The attendance session closes only after the employee opens TimeTracker, the foreground browser obtains a fresh GPS fix, and the signed completion RPC commits the event.

## Lifecycle

1. The existing 30-second worker continues evaluating credited hours, the 30-minute grace period, and approved overtime.
2. When the effective cutoff is reached, the worker sets the scheduler row to `PENDING_GPS`, stores `pending_at`, `scheduled_clock_out_at`, and the existing reason, and leaves the attendance record active.
3. `timetracker_auto_clockout_snapshot` returns the pending state to the signed employee's TimeTracker module.
4. On module entry, the frontend calls browser geolocation with `maximumAge: 0`. Both high-accuracy and network-assisted attempts require a fresh fix.
5. `timetracker_auto_clockout_complete` verifies the pending session and GPS evidence, then atomically updates the attendance state, recovery copy, audit event, Board projection, and scheduler status.
6. The client performs a signed read-after-write and reconciles ambiguous responses before reporting completion.

## Timestamp contract

- `clockOut.timestamp`: the original scheduled cutoff.
- `clockOut.geo.capturedAt`: the browser's actual GPS capture timestamp.
- `clockOut.updatedAt` and RPC `committedAt`: the server commit timestamp.

These values are intentionally distinct. A delayed foreground visit does not rewrite the scheduled attendance cutoff.

## Recovery and concurrency

- GPS denial, unavailable GPS, or stale coordinates leave the scheduler row pending.
- A later TimeTracker visit can retry using a new foreground GPS fix.
- A lost RPC response is reconciled with a fresh signed attendance snapshot. The client does not automatically replay an uncertain write.
- Manual clock-out continues to work. If it closes the session first, the automatic path recognizes the completed record and does not create a duplicate.
- The existing employee advisory lock and transaction ordering are preserved.

## Scope boundaries

- The existing credited-work threshold, grace interval, overtime policy, manual attendance flow, and OJT-specific workflow are unchanged.
- No new Supabase project, frontend framework, role, or authorization model is introduced.
- The inference-only architecture remains unchanged; no model-training or gradient-descent path is added.

## Verification

Targeted automated tests cover pending-state parsing, fresh-only GPS options, module-entry triggering, GPS failure retention, manual-close races, ambiguous-response reconciliation, UI feedback, and migration contracts. Production database and browser acceptance must still verify the deployed migration and a genuine pending-session GPS completion.
