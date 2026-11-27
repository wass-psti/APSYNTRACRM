# CP-MS-CRM-04B.2 — immutable FX snapshots and historical provenance

B.1 post-merge: 81 reference and 56 edge cases, 142 reconciliation tests passed.
Production read-only inventory: three materials, zero legacy USD/EUR cells,
no pricing function or FX table. No backfill, production activation, provider
network access, operational data movement or authorization changes.

## Contract

Private append-only history keyed by canonical workspace and material UUID.
Positive exact rates fit NUMERIC(20,8); reject excess fractional precision,
nonfinite or out-of-domain rates before storage. Unconstrained NUMERIC with
checks prevents implicit rounding at the table boundary. Read receipts use
eight-decimal strings and exact bigint revision strings. No browser API,
grants, new roles, dependencies or changes to existing CRUD.

Provider-reported snapshots require source name, observation reference,
observation time and retrieval time; they are NOT externally verified by
this candidate. A later server adapter must verify actual provider data.
Semantic identity includes scope, provenance, exact pair, provider,
observation reference/time, and legacy revisions; a replay returns the first
snapshot and retains its original retrieval/recording timestamps. A changed
rate or observation creates a separate snapshot. Identical observations
for different items intentionally have different associations. Legacy capture
uses one MVCC statement reading both existing JSON numeric cells and their
revisions. Missing/invalid pairs produce no snapshot or invented defaults;
complete pairs have legacy_unverified provenance, null observed/retrieved
times and provider, and a real capture timestamp. The original cells remain
untouched. Extra trailing zeroes in stored JSON are normalized without loss.

A historical item identifier is checked against the active original MRH
board/group at capture. No foreign key to the live material is introduced:
a hard delete must not become blocked and historical evidence must remain
intact. This is a historical association, not proof of present membership.
Archive/restore and old snapshots remain independent. Future retention and
purge policy is not implemented here. Internal callers must reuse existing
signed commercial scope; no user-facing entry point is added.

Snapshot identity is not a current material price pointer. B.3 must bind
the selected FX ID and authoritative input revision in the same atomic
transaction and reject stale legacy captures on commit (legacy direct
writers do not all lock the item). A new observation never changes an old
snapshot or quote. No live provider retrieval is claimed.

## Verification

Disposable PostgreSQL fixture covers source/rate validation, missing and
malformed legacy data, exact large revisions, preserved source values,
semantic replay, historical quote stability, scope association, archive and
delete compatibility, rollback and immutable update/delete/truncate.
Independent two-session replay verifies the unique identity under contention.
The existing 137 pricing cases and MRH regression remain in the same workflow.
Production activation requires explicit approval; genuine signed CRUD
acceptance from A.5 remains open.
