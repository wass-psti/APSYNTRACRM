# CP-MS-CRM-04A.3 — durable creation recovery and activation readiness

The browser stores only the request UUID under an actor/workspace-scoped key.
With Web Locks, local storage and a per-scope exclusive lock coordinate
same-origin tabs across reloads and browser restarts. Without Web Locks,
session storage provides same-tab reload recovery only. Storage unavailability
is reported before a new durable write. No prices, supplier details, tokens,
draft inputs or payload fingerprints are persisted by this feature.

A recovered committed receipt identifies the previously saved item even after
its title or archive state changes. It does not certify original values are
unchanged. An unresolved receipt is not proof that a delayed request cannot
still arrive; re-enter original values and reuse the same operation UUID.
The existing create RPC serializes identical identifiers and rejects a
different payload after commit. Clearing browser storage or changing devices
loses the opaque identifier; cross-device recovery and automatic restoration
of unsaved commercial inputs are not implemented.

The receipt RPC uses the existing create access rules and request lock,
returns only the request UUID, state, and committed item UUID, and never
exposes the private receipt table. Both deployment flags remain false.
No production schema activation or operational data movement is authorized
by this repository checkpoint. The existing create RPC remains unchanged.

## Activation / rollback sequence
1. Verify latest main CI and compare live dependency function bodies with
   the representative snapshot. Confirm receipt table and existing create RPC.
2. Obtain explicit production activation approval. Create a migration through
   the approved hosted migration workflow; apply only the two additive
   functions in one transaction. Do not reapply the historical create SQL.
3. Verify catalog signatures, grants, and existing data counts; enable the
   two staged frontend flags only after backend activation is confirmed.
4. Run signed production acceptance with explicitly authorized test data.
5. To roll back, disable frontend flags and deploy first, then apply the
   tested rollback candidate for the two new functions only. Never drop the
   existing create receipt table or remove operational records.

Tests use representative PostgreSQL dependency bodies with synthetic identity
helpers, real concurrent creation/receipt transactions, simulated storage unit
tests and a persistent Chromium profile with synthetic signed transport for
reload, tab contention and browser restart. Genuine signed production
acceptance remains a distinct gate.
No additional libraries, authorization redesign, or model training.
