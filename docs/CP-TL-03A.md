# CP-TL-03A — Central TradeLink DocumentRecord contract (staged, not activated)

## Decision and evidence
Date: 2026-11-05 (Asia/Manila). Source reference: the user-uploaded TradeLink 0.1.74 archive, especially `src/domain/types.ts`, `workflow.ts`, `model.ts`, `document-modules.ts`, and the source M7 server-sync migration. The source fallback administrator, standalone workspace-member table, server proxy and browser-only document store are **not** reused.

Live read-only baseline executed against **existing** Supabase project `jtlusodorfnyzgyuewkz`:
- Existing TradeLink board `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88` in workspace `00000000-0000-4000-8000-000000000001`: active, one group, eight legacy columns, zero board items.
- Production `public.tradelink_documents`, `public.tradelink_document_events`, `tl03_document_commit`, `tl03_document_read`, and `tl03_documents_list`: **all absent**.
- Existing signed `work_board_access(uuid,text)`, `module_role_for(text,uuid)`, `private.wm_board_config_session_active()`, board-item create/title CAS/archive, and board-event audit functions verified by read-only signature/definition queries.
- Live TradeLink module roles observed: `General Manager` and `User`. The source's seven roles cannot be silently equated to these two. General Manager + effective platform ceiling + board `manage` + active signed session is a deliberately **narrower first-write/read policy**; `User` receives no domain-document read/write access yet.

## Implemented repository changes
- `sql/cp-tl03-staged-domain.sql`: **never automatically run on production**. Additive, one-transaction DDL for `public.tradelink_documents` and append-only `public.tradelink_document_events`, with hard board/workspace scope, unique active document numbers, RLS, explicit grants, session/role checks, immutable audit trigger, server-owned workflow/revisions and bounded source draft validation.
- Private `tl03_commit`: supports **create**, **update**, reversible **archive**, **restore** on **Draft** only. Requires an explicit client document UUID, expected revision, active session and central roles. Uses `FOR UPDATE` + revision CAS; creation idempotently returns the same receipt only for an identical revision-1 draft by its original creator. Inserts or updates the existing board item **in the same database transaction**, checks projection drift, and records both a domain revision event and existing board audit event.
- Public `tl03_document_commit`, `tl03_document_read`, `tl03_documents_list`: `SECURITY INVOKER` facades; private definer contains privileged logic with pinned `search_path`. List is bounded (1–100) and returns only summary metadata, not document content.
- `frontend/tradelink-domain-contract.d.ts`: typed source-aligned draft, authoritative row, summary and CAS receipt surfaces without adding a second SDK or runtime.\n- `frontend/tradelink-domain-client.js`: signed-context, exact-board adapter with strict receipt/scope checks. **Both** `TL03_DOMAIN_READS_ENABLED` and `TL03_DOMAIN_WRITES_ENABLED` are `false`. Nothing in production calls the new RPCs until independently accepted.
- `frontend/tests/tradelink-domain-client.test.mjs`, `frontend/tests/tradelink-domain-sql-contract.test.mjs`: authorization denials, source draft shape, revision receipts, immutable event/schema contracts and no privilege-bypass fallback.
- `sql/tests/cp-tl03-readonly-preflight.sql`: safely executed against current production; confirms schema is still absent.
- `sql/tests/cp-tl03-postactivation-readonly.sql`: pending; inspect RLS, grants, trigger and existing board-item reconciliation after approved activation.\n- `sql/tests/cp-tl03-disposable-setup.sql` + `sql/tests/cp-tl03-disposable-acceptance.sql`: PostgreSQL 17-only synthetic identity/role/board fixture with signed create/retry/CAS/soft archive/restore, cross-workspace, expired/revoked and immutable-audit cases. **Committed, not executed.** A new workflow automation attempt was blocked by tooling safeguards; no alternate CI automation was installed.\n- Existing Frontend Validation workflow passed on `7e1ad369`; it executes the new Node tests but does **not** execute the CP-TL-03A migration in PostgreSQL.

## Source → authoritative record → Board Items mapping

| Original source field | Authoritative SQL | Board projection during 03A |
|---|---|---|
| Document `id`, `documentType`, `documentNumber` | UUID, checked type, unique active document number | Board `Item` title = document number; one linked row |
| Workflow state, revision, history | Server state `draft`, monotonic revision + append-only event ledger | **No status conversion** (8 source states versus 4 board options) |
| Client/vendor identity, financial terms, item lines | Bounded `content` JSONB, only in restricted domain table | **Not exposed** in board technical cells |
| Currency, VAT, discount, total | Source draft input fields in `content`; total needs approved authoritative server computation | **Amount not yet projected**; never show an unqualified cross-currency number |
| User assignees and reviewer/approver | Draft descriptors only; server event actor comes from `auth.uid()` | `Person` meaning needs explicit approved mapping |
| Document `date` | Source draft `content.date` | Typed Date value pending column activation and projection |
| Document attachments | Not part of the 03A draft API | `Files` remains disabled; no Storage bucket or upload grant |

The existing eight v1 board columns and pending five custom typed columns are untouched. The 03A backend never authorizes transitions, approves invoices, generates PDF, imports source records, or writes attachment objects.

## Risk and implementation boundaries
- This source code is **staged only**. The proposed migration changes a production schema, RLS, functions and EXECUTE grants. It requires separate production-change approval and independent security review before applying.
- The legacy source `tradelink_workspaces` and `tradelink_workspace_members` migrations are incompatible with the central APSYNTRA identity policy and must not be run.
- The user-level `User` module role cannot access sensitive domain JSON until role/capability mappings are explicitly designed and server-enforced.
- Current source document types have additional validation and workflow preconditions. Do not enable submission/approval or full document editing until those have been ported and verified on the server.
- No automatic migration or write should run during initial render, authentication, or board navigation. The staged JS flags are both OFF.
- Rollback strategy: before activation, no action. After activation, disable client read/write flags, revoke any exposed RPC grants only through an approved permission change, retain existing document/audit data. Destructive table drops need a separate data-retention review; there is no auto-drop migration.
- During acceptance use a **disposable, nonproduction database copy** with its own test users/sessions and no customer records. Do not simulate `auth.uid()` and call that genuine signed-user acceptance.

## Acceptance gates (7, evidence denominator)
1. **Source schema/workflow mapping** — VERIFIED (source inspection, six types/eight states).
2. **Actual central backend baseline** — VERIFIED (live read-only schemas, roles, signed function definitions).
3. **Staged schema, CAS, RLS and audit implementation** — IMPLEMENTED-UNVERIFIED SQL runtime.
4. **Fail-closed frontend adapter and contract checks** — VERIFIED (11/11 isolated V8 checks covering committed files; not equivalent to Node CI).
5. **Disposable PostgreSQL integration** — PENDING (migration parsing, creates, retries, stale conflicts, rollback, RLS and cross-workspace denial).
6. **Production DDL/security approval + activation** — PENDING (separate explicit permission).
7. **Signed production read/write/reload and regression acceptance** — PENDING (real browser identity, General Manager versus User, expired/revoked, events, storage and Pages tests).

The original TradeLink archive's `verify-workflow.mjs` and `verify-create-modules.mjs` were rerun and passed. The staged SQL was not executed, and the current project reports no available nonproduction branch. The committed disposable SQL can be executed in a fresh isolated PostgreSQL 17 runner with `psql -v ON_ERROR_STOP=1 -f sql/tests/cp-tl03-disposable-setup.sql -f sql/cp-tl03-staged-domain.sql -f sql/tests/cp-tl03-disposable-acceptance.sql -f sql/tests/cp-tl03-postactivation-readonly.sql`. Never point that command at the production Supabase project. No production data, roles, SQL functions, RLS or Storage objects were created or modified in this milestone.

**Next engineering boundary:** finish disposable SQL acceptance and security review, settle the first safe Person/date/amount/status projection semantics, then request the separately required production DDL/role/permission approval. Source workflow transitions and attachments remain separate subsequent gates.
