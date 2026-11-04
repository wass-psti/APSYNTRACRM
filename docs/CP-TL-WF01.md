# CP-TL-WF01 — Source-defined TradeLink workflow reference

## Scope and source
Source: user-uploaded `tradelink.zip`, actual version `0.1.74`, `src/domain/workflow.ts` and `src/domain/types.ts`.

TradeLink keeps **eight** authoritative document workflow states: Draft, Submitted, Under Review, Revision Required, Approved, Rejected, Completed and Cancelled. These are **not** the same as the four presentation choices in the APSYNTRA TradeLink Board Items Workflow Status column. Do not use the board label as an authorization or state-machine input.

`frontend/tradelink-workflow-reference.js` now exposes a pure, static descriptor for the source transitions and capabilities. The existing `frontend/tradelink-application.js` uses it under each of the six document modules, including a keyboard-accessible collapsed transition table with explicit read-only language. No browser storage, synthetic records, network writes, role grants or document transitions are introduced.

## Key source-specific transition details
- Draft: Submit or Cancel. Quotation/PO/Electronic SI Submit becomes Submitted.
- Packing List Submit becomes **Completed** directly.
- Delivery Receipt and Payment AR Submitted states permit Request Revision, Reject, Complete or Cancel; Payment AR additionally offers Record Review when a verifier is configured.
- Submitted quotation/PO/Electronic SI supports Review, Request Revision, Approve, Reject or Cancel.
- Under Review delivery/payment follows operational completion, not commercial approval.
- Reopen returns to Draft. Request Revision, Reject, Reopen and Cancel require reasons.
- Actual transition authorization also requires application capability, signed actor, assigned reviewer/approver matching, document submission readiness and operational prerequisites. Those checks must be implemented by the central backend before mutation controls are enabled.

## Verification
- Isolated developer-source `tsc -p tsconfig.json --noEmit`: PASS.
- `tsc -p tsconfig.json`: PASS in isolated extracted archive.
- Uploaded source scripts `verify-workflow`, `verify-create-modules`, `verify-attachments` and `verify-rbac`: PASS after local compile.
- A broader source `verify:upstream` run passed its structural, persistence, host-auth, RBAC and server-sync steps, then stopped at `verify-supabase-integration` because this archive's local build intentionally emits disabled server configuration. This is **not** evidence of production Supabase integration. A local fictional fixture was created only inside the isolated extraction; no production writes or credentials.
- New `frontend/tests/tradelink-workflow-reference.test.mjs` commits coverage for six document types, special paths, reasons, labels and no mutation controls. Existing full CRM test suite / Actions and signed production browser acceptance are **not independently verified in this checkpoint**.
- Pages smoke script now includes `frontend/tradelink-workflow-reference.js` in exact-hosted-asset verification.

## Next gate
**CP-TL-03 — Central server-authoritative DocumentRecord contract:** implement and independently verify authenticated document read/write/CAS/audit, a secure and reviewed projection onto the existing TradeLink board, and platform/board/application role ceilings. New table, RLS, Storage and permission activation require their separate production approval gate. Never use source localStorage, its standalone development account fallback, or independent workspace-membership policies in APSYNTRA CRM.

Current status: **IMPLEMENTED-UNVERIFIED** for source workflow reference UI. **PENDING** for authoritative workflow mutation backend and live acceptance.
