# CP-MS-CRM-04A — transactional edit candidate, increment 1

Source inspection of app.js confirms the existing drawer loops over public CAS
writes and then private revision writes; an exception can leave partial commits.
The candidate combines those calls in a single database transaction, retaining
public board-edit eligibility independently of the private writer's existing role.
Existing original Main group and active-item scope are preserved. No new roles,
policy changes, or runtime RPC calls are introduced.

The create form now rejects impossible calendar dates before submission, matching
the existing edit parser. Existing input contracts and required-field semantics
are unchanged.

The candidate lives outside supabase/migrations and is not deployed. The
disposable SQL fixture uses stubs to prove rollback and call composition, not
live authentication or exact deployed dependency behavior. Before activation,
inspect actual current dependency bodies and grants, test in a representative
disposable schema including concurrency and deadlock/retry handling, implement
the signed frontend adapter and authoritative readback, verify create retry
and archive/restore, then request explicit production activation approval.
Do not replace the drawer's existing path until that backend is ready.
No model training or dependency additions.
