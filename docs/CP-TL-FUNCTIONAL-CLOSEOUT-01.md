# CP-TL-FUNCTIONAL-CLOSEOUT-01 — TradeLink saved-content parity correction

## Verified implementation

The signed save workflow checks the server-read document content before reporting a successful save and synchronized Board projection. The previous recursive JSON comparator returned `false` for otherwise matching document fields nested more than five levels deep. This could turn a committed save into an incorrect "verification incomplete" UI result.

Replace the arbitrary depth cutoff with a bounded, iterative comparison of JSON arrays and objects. Field order remains irrelevant; field names, field values and array order must match exactly. The bound prevents pathological non-JSON structures from causing unlimited comparisons. The change does not affect backend writes, numbering, status transitions, reviewer assignment, RLS, roles, or permissions.

## Reproduction and tests

- A targeted nine-level nested-content test failed against the previous comparator and passed after the change, while a changed nested leaf still fails parity.
- TradeLink focused suite: 431/431 PASS.
- Full frontend suite: 3,225/3,225 PASS.
- Production build: PASS.
- Source diff validation: PASS.

## Acceptance boundary

This closes the confirmed **client-side content-parity defect**, not the entire TradeLink production lifecycle. Existing signed domain create/read/list and Board RPCs, two-stage review APIs, and separately gated workflow steps remain unchanged. Genuine production create/edit/reload readback, independent assigned-reviewer actions, and approval-dependent PDF behavior require separate live acceptance evidence; they are not certified by the fixture tests. No production document was created, modified, reviewed, approved, archived, or deleted during this implementation.
