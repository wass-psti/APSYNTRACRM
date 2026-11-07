# CP-TL-03D — Signed Documents Browser Acceptance and Controlled Read-Only Activation Readiness

**Checked:** November 7, 2026 (Asia/Manila)  
**Existing Supabase project:** WatchdogWorkspace `jtlusodorfnyzgyuewkz` (ACTIVE_HEALTHY, PostgreSQL 17.6.1.165)  
**Existing TradeLink board:** `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`  
**Signed Documents route:** `#/boards/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88/tradelink/documents`  
**Decision:** **NO-GO to enabling production frontend domain reads.** Source and database readiness are proven, but interactive signed Documents acceptance and release-governance evidence are incomplete. Production Draft writes and Stage B grants remain separately **NO-GO**.

**Execution contract:** No production data mutation, role/permission/grant change, backup/restore operation, SQL DDL, credential/session access, test account, new Supabase project, or frontend feature-flag modification.

## 1. Accepted predecessor and exact frontend baseline

The project owner explicitly accepted the prior source-document workspace integration for roadmap continuation, while preserving unexecuted browser/security tests as exceptions. The prior source implementation `7ef5c47428a2257560a1e3dad19f6de853bd9bf1` added separate authoritative Document workspace staging above existing Board records, six source-module routes, default-deny document-list filters and local sort. No board-row projection is treated as a domain `DocumentRecord`.

The current checked-in `frontend/tradelink-domain-client.js` declares **`TL03_DOMAIN_READS_ENABLED=false`** and **`TL03_DOMAIN_WRITES_ENABLED=false`**. This is a frontend display/API-client gate only. **Important:** the Stage A production **server** already grants authenticated EXECUTE on the read/list wrappers; a frontend flag being false does *not* revoke those server grants or substitute for server-side signed-session, central module role, board manage, workspace/RLS checks.

The most recent mainline APSYNTRA Frontend Validation workflow available during this assessment was [run 42324259196](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42324259196), **SUCCESS, 1,147/1,147 frontend tests, zero failures**, including successful disposable PostgreSQL, collaboration and overtime jobs and live Pages smoke. Exact SHA `17b3c56c5b351c468f99c68aeae692d2a36e4490`; [Pages deployment 42324258975](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42324258975) also succeeded at that SHA. Separate later reference-driven TradeLink UI CI runs may be on other heads and are not evidence that an unmerged change is deployed.

## 2. Fresh database evidence (SELECT-only; exact committed preflight)

Executed the **unchanged source** `sql/tests/cp-tl03c-phase1-readonly-activation-preflight.sql` (blob `5d96e2f27e49fc84fe0c8e68758646842bc9b294`) against existing project `jtlusodorfnyzgyuewkz`. It is a SELECT-only post-Stage-A verifier: **15/15 PASS**, `failed_checks=[]`, status `STAGE_A_STRUCTURAL_PASS__STAGE_B_NOT_AUTHORIZED`. All signed-session catalog, fixed board/workspace, RLS, source-definer fingerprint, immutable audit, read grants, anon denial and absent Stage B write predicates passed. Do not use the earlier *pre-Stage-A* readiness script to assess the already-installed Stage A schema.

A separate independent **SELECT-only** query checked these specific live values:

| Predicate | Actual value |
| --- | --- |
| `authenticated` EXECUTE on `public.tl03_documents_list(uuid,integer)` | **TRUE** |
| `authenticated` EXECUTE on `public.tl03_document_read(uuid,uuid)` | **TRUE** |
| `anon` EXECUTE on both public read wrappers | **FALSE / FALSE** |
| `authenticated` EXECUTE on `public.tl03_document_commit` and `private.tl03_commit` | **FALSE / FALSE** |
| `anon` EXECUTE on public commit wrapper | **FALSE** |
| Production TradeLink document / audit / board item counts | **0 / 0 / 0** |
| Installed migration name matching TL03C Stage B | **0** |

Consequences: the server Stage A read/list API exists and has authenticated entry privileges; the private authorization predicate still determines the actually eligible user. **No existing TradeLink documents exist for a real row-level/foreign-workspace disclosure test.** A zero-row list verifies response shape and access decision only, not cross-workspace row isolation.

## 3. Security advisor findings and independent risk boundary

Current security advisors show project-wide groups `rls_enabled_no_policy` (81 INFO), `function_search_path_mutable` (9 WARN), `anon_security_definer_function_executable` (3 WARN), `authenticated_security_definer_function_executable` (271 WARN), and `auth_leaked_password_protection` (1 WARN). **Among TradeLink legacy assets**, four RLS-enabled asset/reconciliation/fence/audit tables have no RLS policies; eleven vendor-asset/reconciliation/cleanup RPC functions are flagged as authenticated-callable `SECURITY DEFINER`. These are **legacy TradeLink surface findings, not named new `tl03_document*` wrapper findings**. Their existence is not proof of exploitability, and no privileges were silently changed. They require scoped security review/risk acceptance, rather than broad automatic revocation, before a larger release surface is approved.

Advisory references: [RLS policy gap](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [authenticated SECURITY DEFINER executable](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## 4. Genuine signed browser evidence — precise scope

At the time of this check, the connected APSYNTRA CRM browser tabs were:

- A **genuine signed TradeLink Draft workspace** (`/tradelink/drafts`), visibly showing **Domain reads: not activated; Writes: not activated**.
- A signed TradeLink overview and a signed `/security` page, the latter offering **Run Stage A signed read checks**. The security panel was **not clicked or rerun**.
- **No connected tab was on `/tradelink/documents`**. The available Chat-mode browser connector can read tabs/page text but **cannot navigate, click, fill forms, test keyboard focus, log out, or send bearer-bound RPC requests**.

Therefore **genuine signed Documents-page rendering, interaction, sort/filter behavior, disabled-control focus, refresh, and identity-switch acceptance are NOT VERIFIED in this gate**. Do not fabricate browser evidence or mark them passed merely because the underlying route compiled or CDN smoke passed.

Historical genuine signed Stage A reports are preserved in `docs/CP-TL-03C-PHASE-2-SIGNED-READ-AND-STAGE-B-APPROVAL-PACKET-2026-11-06.md`: **authorized General Manager 6/6 PASS** and **HR board-manager denial 6/6 PASS**, based on user-submitted signed application reports from November 6. They were **not rerun** on November 7. Existing foreign-workspace genuine signed case was previously BLOCKED because no eligible foreign-workspace member was available, and actual expired/revoked bearer tests were PENDING. The signed Stage A Security-page report and an actual document-page UI test are **different** acceptance contracts.

## 5. Signed-browser acceptance script — not yet executed

Use the existing authorized account/session and harmless QA values; do **not** create document records or bypass disabled controls:

1. On the current signed TradeLink application, select **Board records**, reaching `#/boards/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88/tradelink/documents`. Verify **TradeLink document workspace** appears as a separate **Source-aligned All Documents / Read-only staging** panel above **Board records**, without treating a board record as a document.
2. Confirm six module links are present, and the document-number, module, workflow, archive, sorting and direction controls are **disabled** while the `TL03_DOMAIN_READS_ENABLED` flag is false. The repository count should be `0 of 0 authorized records in this response`, with no invented contents, approvals, prices, download actions, or editable buttons. The Board records section must remain independently accessible.
3. Inspect the signed browser's network view during route entry and refresh. Expect **no** TradeLink `tl03_documents_list` or `tl03_document_read` RPC attempt while client read activation is off; ordinary board access, Auth or other app API requests are permitted.
4. Tab through the *enabled* links, verify visible focus and keyboard navigation; disabled filters must be excluded from native focus order. Confirm accessibility and layout on a narrow viewport.
5. Navigate away/revisit, refresh and (only if already authorized by the account owner) sign out and sign back in. No prior signed data, stale `DocumentRecord` rows, or local Draft fields may be exposed to another identity.
6. Use the existing signed Security-page **Run Stage A signed read checks** control for an actual *new* manager report if operator evidence is needed. Capture only the **sanitized six-check result**; never copy bearer tokens, session IDs, cookies, workspace/member identifiers or customer data. Genuine nonmanager/foreign-workspace/revoked-session checks require separate existing legitimate sessions and change controls; do not invent them.

**User evidence handoff:** For this gate, the minimum browser evidence is a text/screenshot of the signed **Documents** page showing the separate panel, disabled controls, and zero records. This proves deployed page *visibility* only. Interactive acceptance additionally requires recorded click/keyboard/network observations and authorized signed-session transitions.

## 6. Controlled read-only activation go/no-go matrix

| Prerequisite | Current classification |
| --- | --- |
| Correct Stage A schema/fingerprints/RLS/read privileges; anon denial; no writes | **VERIFIED — fresh production read-only SQL, 15/15** |
| Current frontend default-deny and signed view source/route checks | **VERIFIED — source and CI** |
| Deployment, full frontend regression, exact-SHA CDN | **VERIFIED for the cited mainline SHA** |
| Historical signed General Manager and HR Stage A reports | **VERIFIED FROM USER-SUBMITTED PRIOR EVIDENCE ONLY** |
| New signed Documents-page UI + interactive acceptance | **BLOCKED — no interactive browser control or Documents tab** |
| Fresh signed negative cases and foreign/revoked real-session denial | **PENDING / FOREIGN-ROLE CASE BLOCKED** |
| Existing actual-document row-level RLS isolation | **BLOCKED — production domain table is empty; no data fixture authorized** |
| Scoped legacy TradeLink security review/risk decision | **PENDING** |
| Named responsible release owner, rollback authority and explicit read-only frontend activation approval | **PENDING** |
| Production Stage B write change, recovery and exact grants | **NO-GO, separate permission/backup/owner gate** |

**Read-only activation decision: NO-GO.** Technical Stage A availability and browser display readiness do **not** substitute for a controlled production feature-flag release. **No frontend read flag may be flipped** without a separately approved rollout with named owner, signed-session acceptance plan, success/stop criteria, exact code diff, canary/rollback route and independent evidence. A frontend rollback to `TL03_DOMAIN_READS_ENABLED=false` would disable normal CRM list UI calls but **would not revoke Stage A server EXECUTE grants**. If server exposure is at issue, a separately scoped, explicitly approved *server* containment decision is needed. Do not apply the broader `cp-tl03c-emergency-disable-candidate.sql` automatically.

**Stage B writes remain NO-GO**, independently requiring current recoverable backup evidence, accountable execution/security/rollback ownership and specific production write-permission approval. Owner sign-off to previous frontend milestones does not authorize Stage B, Stage A read-flag activation, real production fixtures, or roles/grants.

**Overall progress:** Technical structural 15/15 (100%). Genuine signed Documents acceptance and production read-only activation readiness: **INDETERMINATE / NOT COMPLETE**, because indispensable executed scenarios are missing.

## Owner acceptance and signed Documents visibility — November 7, 2026

**Owner message:** “all good chatgpt.” The owner accepts the **integrated Documents workspace UI and non-mutating readiness assessment for roadmap continuation**, with the formal read-only activation NO-GO and all previously unexecuted browser/security scenarios preserved. **Disposition: CLOSED — USER-ACCEPTED FOR THE VISIBLE UI MILESTONE, NOT CERTIFIED FOR INTERACTIVE SECURITY ACCEPTANCE OR PRODUCTION READ ACTIVATION.**

**New genuine signed-page evidence (read-only connected browser text, Nov 7):** Connected Tab `1294819784` is now on actual `#/boards/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88/tradelink/documents`; the rendered page displays an existing **Secure session**, the separate **Source-aligned All Documents / TradeLink document workspace / Read-only staging** panel, the literal statement **“Document reads are not activated”**, the six source module links, document-number search, module/workflow/archive sort/filter controls, **“0 of 0 authorized records in this response”**, the explicit no-persisted-Drafts explanation, and a distinct **Authorized board projection / Board records** section with **0 board records**. This independently verifies **signed Documents-page visibility and layout content** that was previously pending. It is **not** interaction evidence; page text alone does not attest DOM disabled-attribute state, network-RPC absence, true keyboard focus, filter execution, sign-out/identity isolation, or server RLS denial on existing rows. The repository source still declares `TL03_DOMAIN_READS_ENABLED=false` and `TL03_DOMAIN_WRITES_ENABLED=false`; no feature flags were modified.

**Unchanged blocked/pending gates:** Genuine keyboard/search/sort and network interaction, real foreign-workspace and expired/revoked bearer denial, row-level isolation with authorized fixture (no production document fixture approved), scoped legacy-security warnings, accountable release/rollback ownership and explicit read-only frontend activation permission. No claim of a fresh negative-role report or production data test is made. **Read-only frontend activation: NO-GO; Stage B production writes/grants: NO-GO.**

**Next safe direction:** Continue source-faithful, non-mutating TradeLink improvements or prepare a signed-browser interaction checklist/change decision packet. Only independently evidenced security gates and separately scoped approval may authorize later production read activation. No production data, grants, roles, permissions, credentials, backup, or server configuration changed in this owner acceptance record.
