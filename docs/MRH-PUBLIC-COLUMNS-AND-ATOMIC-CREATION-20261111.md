# Material Request Hub — Public sourcing activation and atomic Add Material persistence

Date: November 11, 2026. Board ID: 617c4c0f-e343-4b3b-8456-50d47dcbaf99. Original group: Main group, ID 21566a87-b287-4a61-b521-bb233956e09e.

## Implemented, production backend verified

- **Single-transaction Add Material persistence**: signed RPC public.mrh_create_material_atomic creates a real board item in the original Main group, writes authorized public column values and protected private values, and records an idempotency request receipt. Any field failure rolls back the entire request; the previous multi-request partial-record behavior is replaced.
- Existing server role/module/board checks apply, without new administrator roles or authorization checkpoints. Actual board edit permission and Material Request Hub ADMIN role are verified on the server; signed user context and original workspace are rechecked by the client.
- The new private.mrh_material_create_requests table has forced RLS and no direct authenticated table access. Anonymous RPC execution denied.
- A stable per-form request UUID prevents duplicate item creation when the same request is retried after a lost response; changing the payload with the same ID returns a conflict. The UI requires board refresh on uncertain responses rather than creating another material.
- All supplied public and protected values are reloaded and checked against the authoritative board and signed private RPC. No screenshot sample records or invented exchange rates.
- Production migration installed: mrh_material_atomic_create_20261111. Read-only live verification confirmed both RPC and private request table installed, signed EXECUTE only, forced RLS, zero creation-request rows, original 1 material item and original 8 columns.

## Six-column activation from Add Material

The previously implemented activateApprovedPublicSourcingColumns helper uses the signed wm_board_schema_mutate RPC and its existing audit trail. When any of the six ordinary public fields is absent, Add Material now displays one **Enable missing fields** button. A user who already has the existing signed board/schema permissions can activate exactly:

- Source Type (Local / Import dropdown)
- Material description (long text)
- Brand (text)
- RFQ Ref No (text)
- Date required (date)
- Leadtime in Weeks (number)

Quantity remains the original column. The existing group ID, group name and original eight columns are not changed. Restricted commercial fields are not placed into public columns.

**Operational state:** Production still had eight columns at the last structural check. The user must activate the six columns using the in-form signed action. The assistant did not impersonate a bootstrap administrator, bypass the audit RPC or manually insert columns attributed to another user. Thus **column activation and genuine signed full-form submission are PENDING**, not falsely certified.

## Verification

- Disposable PostgreSQL 17: atomic create, public + protected persistence, idempotent replay, changed-payload conflict, rollback on protected field failure, restricted field denial, non-ADMIN denial, edit denial, anonymous grants and private forced RLS PASS.
- Targeted frontend client tests cover signed call, public/protected reload, non-ADMIN denial, revoked/changed workspace rejection and invalid receipts.
- New dedicated CI workflow reruns the disposable PostgreSQL acceptance and frontend tests.
- Full regression, CI and deployment evidence should be attached to the release record.

No new Supabase project, role/permission modification, synthetic material item or unrelated application rewrite was performed.
