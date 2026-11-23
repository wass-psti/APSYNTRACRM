# CP-TT-HR-OT-AND-ALL-USER-LOG-01

## Objective

Complete HR visibility of manually submitted overtime history and enable the two intended HR TimeTracker accounts to use the existing HR all-user attendance Log projection.

## Implementation

### Manual OT history

- Keep the existing `timetracker_ot_snapshot` contract and all submission, decision, audit, and status behavior.
- Preserve historical `manual_admin` records even when their owner is no longer an active workspace member.
- Continue requiring active workspace membership for ordinary employee OT rows and bootstrap team rows.
- Render manual OT history independently of the selected weekly analytics window.
- Render the history in pages of 50 records to avoid creating an oversized DOM for large histories.

### Synchronization

- Add an OT-table trigger that publishes a private `board-change` invalidation on the existing TimeTracker board topic.
- The event contains only board ID, entity/action metadata, actor ID, and timestamp.
- Existing `PlatformSync` receives the invalidation and re-reads the signed TimeTracker snapshot. No OT record contents are sent over Realtime.
- Existing local submission and decision handlers continue to refresh their own signed snapshot.

### HR attendance Log

- Reuse `TT_TEAM_OVERVIEW_ROLES`, `projectTimeTrackerOverview`, `projectTimeTrackerLog`, and the existing HR-aware `list_module_directory` behavior.
- Assign only the existing `HR` TimeTracker module role to the two requested, identified accounts. No new role or administrative capabilities are introduced.
- The existing HR Log projection remains read-only and does not expose raw GPS or audit payloads.

### Disposable acceptance repair

- Preserve `DEFAULT auth.uid()` in the CP-TT-LIVE-01 disposable `module_role_for` fixture so it remains compatible with the earlier migration.
- Exercise the new OT history and Realtime migration in the PostgreSQL 17 disposable acceptance workflow and standalone runner.

## Acceptance criteria

- Manual OT history includes all dates and statuses, independent of weekly OT metrics.
- Historical manual OT remains visible when its owner is inactive or no longer a workspace member.
- Ordinary employee OT remains subject to the existing active-member scope.
- Realtime insert/update notifications are private, board-scoped invalidation-only events.
- HR Log projection returns all active TimeTracker directory members and historical attendance rows without exposing GPS/audit metadata.
- Existing manual submission, approval/rejection, attendance Clock, and Log behavior remain unchanged.
- No gradient descent, backpropagation, training, fine-tuning, or model-parameter update paths are added.
