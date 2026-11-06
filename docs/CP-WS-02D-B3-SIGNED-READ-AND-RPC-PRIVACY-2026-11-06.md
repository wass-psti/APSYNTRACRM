# CP-WS-02D/B3 — Genuine signed-user preflight evidence and controlled RPC privacy review

**Date:** 2026-11-06  
**Current classification:** Signed browser preflight **USER-REPORTED PASS**; local real GoTrue/PostgREST/RLS **CI-VERIFIED**; public trusted HTTPS staging **PENDING**; production RPC privacy remediation **NOT AUTHORIZED / NOT DEPLOYED**.

## Signed-user reports supplied by the operator

The signed APSYNTRA CRM Security page returned this **sanitized** B3 result. It contains no token, email, user ID, session ID or board identifier. The report was supplied in conversation; an independent connected-browser capture was not available.

| B3 probe | Result |
| --- | --- |
| signed-identity | PASS |
| authoritative-workspace | PASS |
| module-access-read | PASS |
| stable-signed-context | PASS |
| Module predicates executed | 12/12 |
| Authorized module predicates | 12/12 |
| Writes attempted | 0 |
| Identifiers disclosed | 0 |
| Domain writes verified | 0 |
| Provider deliveries verified | 0 |
| Acceptance boundary | READ_ONLY_NOT_DOMAIN_WRITE_OR_EMAIL_ACCEPTANCE |

The separate **CP-WS-01C-B2-SIGNED-DISCOVERY** report also showed five PASS checks and **one** signed workspace; this is discovery/read evidence, not B4 switching acceptance.

The separate **CP-BOARD-COL-DELETE-B2** report returned `PENDING / existing-boards / NOT_CREATED`, with `0/4` synthetic QA cells, `activationChanged=false`, and `recoveryWritesAttempted=0`. This gate must not be conflated with B3 signed read acceptance; the user-triggered QA creation remains a distinct pending browser action.

## Existing successful isolated CI

- [B3 real local GoTrue + PostgREST + TLS + RLS run 42141011359](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42141011359) **SUCCESS**, source `dd0c9261317f5722cc1749b04ac4a64faad65d3d`.
- This CI uses disposable PostgreSQL 17, pinned GoTrue and PostgREST, signed synthetic identities and local TLS. It does **not** validate a publicly trusted B3 backend or production authenticated HTTP invocation.
- Existing runtime staging flags remain default-disabled; no WS02D invitation, provider, or B4 activation is implied.

## Live metadata-only RPC security review

A **read-only** inspection of existing Supabase project `jtlusodorfnyzgyuewkz` established:

| Property | Observed |
| --- | --- |
| Function | `public.has_module_access(text,uuid)` |
| Definition MD5 | `3d44e27eed8d67ac223a9c4353d6003a` |
| Owner | `postgres` |
| SECURITY DEFINER | true |
| authenticated EXECUTE | true |
| anon EXECUTE | false |
| Stored functions referencing helper | 45 |

The current SQL accepts an optional `p_user_id` and does **not** explicitly require `p_user_id=auth.uid()`. A signed actor can therefore appear to inspect another active actor's module-access Boolean via the exposed RPC. This is a **source-identified entitlement privacy risk**, not proof that another actor's operational records can be fetched.

This signature is referenced by 45 stored functions, including `apsyntra_crm_my_effective_access`, module state/lock operations, TimeTracker, Order Intake, Employee Evaluation and TradeLink functions. Blindly revoking authenticated EXECUTE, changing the signature or replacing internal calls could introduce production regressions.

## Disposable-only remediation candidate and tests

- `sql/cp-ws02d-b3-rpc-privacy-disposable-candidate.sql` keeps the existing function name, default argument, domain checks and `SECURITY DEFINER` shape and adds **only** `AND p_user_id = auth.uid()`. It **refuses execution outside** `ws02d_privacy_disposable` on PostgreSQL 17 and is **not a production migration**.
- `sql/tests/cp-ws02d-b3-rpc-privacy-disposable.sql` uses only synthetic users/workspaces. It first reproduces the vulnerable foreign-user Boolean read using the original function body; then it applies the candidate and checks both signed actors' authorized self-reads, unauthorized module denial, two-way foreign inspection denial, absent-JWT denial and unchanged anonymous/authenticated EXECUTE boundary. Changes are rolled back.
- `.github/workflows/cp-ws02d-b3-rpc-privacy.yml` runs this test in disposable PG17 on a pull request, with no production credentials or external provider.

Passing this test is **nonproduction synthetic SQL contract evidence**, not production remediation acceptance. All 45 referenced function consumers and module-specific valid workflows require a proportionate negative/positive regression review before an approved cutover. The real production SQL source fingerprint must be checked immediately before preparing a separate deployment migration; the disposable test alone cannot prove function compatibility.

## Outstanding B3 gates

1. Establish a **separately approved** trusted HTTPS nonproduction staging host with a real verified GoTrue user/session boundary, user-scoped PostgREST and original deployed RPC/RLS contracts. Do not accept a local TLS certificate as evidence of public trust.
2. Review all relevant consumer paths and privacy denial tests. Submit a **separately approved, source-locked production migration** with rollback and valid-action regression evidence; do not directly apply the disposable candidate.
3. Independently verify deployed authenticated read/deny HTTP behavior and distinguish it from user-supplied browser preflight PASS.
4. Keep provider delivery, B4 switching, domain-write activation and Contacts column deletion separately gated.

**Next required gate:** `CP-WS-02D/B3 — Controlled Trusted HTTPS Staging Host and RPC Privacy Acceptance`. Board recovery proceeds independently through `CP-BOARD-COL-DELETE/B2 — signed four-cell QA fixture creation`.
