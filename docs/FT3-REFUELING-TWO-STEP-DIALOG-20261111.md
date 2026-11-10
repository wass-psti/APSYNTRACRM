# FuelTrack+ v3 — Two-step signed refueling dialog

## Interaction

1. A verified FuelTrack Admin opens Mark as Refueling Done on an approved queue record. No transaction is performed by opening the dialog.
2. Step 1 displays the signed request identity, reference, and workflow progression. Cancel, close, or Escape dismisses without a write. Mark as Refueling Done invokes the existing signed, revision-guarded RPC.
3. Only after that RPC commits and the signed read confirms a refueling_done record does Step 2 render. It collects required actual amount and liters, optional receipt number, and optional private receipt image. Quick-value chips fill inputs; users can edit them freely.
4. Save & Complete invokes the existing signed private receipt upload/registration and completion workflow. On successful reread, the dialog closes and the queue updates. On failure, the entered form remains open and the user can retry. Cancel closes the form but leaves the already committed refueling_done state; reopening offers Step 2.
5. Existing refueling_done records open directly at Step 2. Foreign workspace, wrong role, invalid request revision, or mismatched transaction state never displays a writable modal.

## Implementation boundaries

No demo transactions, fake successful outcomes, new database tables, bypassed auth, or production refueling writes. The request ID and expected revision come from the verified signed FuelTrack snapshot. The existing server RPCs and private Storage validation remain authoritative. The modal is ephemeral UI state, not persisted client storage. Keyboard Escape, Tab containment, labeled controls, and mobile sizing are provided.

## Acceptance

Frontend renderer and module integration tests verify the two steps, field presence, signed role/state guards and routing. A genuine signed end-user browser click-through and real production transaction require a separately conducted live acceptance check.
