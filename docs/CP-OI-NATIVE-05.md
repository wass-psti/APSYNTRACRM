# CP-OI-NATIVE-05 — Status workflow and order lifecycle

## Scope
Native order lifecycle using existing signed status, archive and restore RPCs, existing registry and existing activity table. No new migrations, dependencies or authorization changes. Historical source payloads and reported statuses remain preserved, not editable as native records. Notifications to account managers are not implemented: existing CRM notification delivery is not connected. Activity entries are real database records, not delivered notifications.

## Implementation
Workflow automatically retrieves all available active registry pages. Native cards support drag-to-stage with confirmation, and keyboard/touch Change status control. Existing Closed/Cancelled terminal behavior of the status RPC retained; no added transition graph or role restrictions. Commit-first state refresh and exact revision/status/archive readback, no blind automatic write replay; lost response reconciled against authoritative detail. Native archive/restore use existing soft archive and revision contract. Separate Archived route/cache excludes archive rows from active metrics. Native record detail shows latest 50 activity entries with coverage indicator. Existing editor preserved. No change to existing update-details RPC semantics.

## Evidence
54/54 focused Order Intake tests (seven new lifecycle tests). Disposable original lifecycle migrations plus existing creation/editing, real GoTrue and PostgREST with fixture helpers. Signed API created disposable order, advanced Processed, Delayed, Delivered, Collected, Closed, rejected stale revision and terminal transition, archived and restored to revision 8; eight ordered activity entries; financial fields unchanged, 909 historical records preserved. Signed isolated Chromium real renderer and shared drag binder: drag target and cancel with zero mutations, keyboard status, archive and restore, three confirmed writes, mobile containment, no page errors. Previous CP03/04 signed acceptance passed in same run. Disposable services cleaned up. No production test records created.

## Release
CP03/04/05 coordinated release on PR #855. Prior CI failure TimeTracker browser layout assertion (16px vs 0px); latest upstream alignment change to be integrated before release. Actual production signed lifecycle acceptance pending deployment and genuine business record. Historical operational lifecycle and notification delivery require separate, explicitly scoped data-model/integration work if needed. No new training, gradient descent or model parameter updates.
