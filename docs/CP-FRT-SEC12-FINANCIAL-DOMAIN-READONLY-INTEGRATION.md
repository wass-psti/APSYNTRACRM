# CP-FRT-SEC12 — FRT Financial Domain Read-Only Integration

**Date:** October 31, 2026 (Asia/Manila)
**Scope:** Integrate already deployed, signed, centrally authorized FRT financial read RPCs into the existing APSYNTRA CRM Fund Released Tracker board, retaining the approved 12-board architecture and Supabase backend.

## Prior milestone dependency and waiver

CP-FRT-SEC10-CI07 is administratively **8/8 dispositioned (100%)** at the user's explicit instruction: **5 VERIFIED** and **3 OPERATOR-WAIVED (NOT VERIFIED)**. CI07 production session-guard SQL and read-only RLS posture remain installed. The waiver does not substitute for genuine signed positive/negative finance authorization acceptance, does not alter the deployed security controls, and does not certify production finance readiness. Original CI07 evidence is retained in `docs/CP-FRT-SEC10-ISOLATED-LIVE-ACCEPTANCE.md`.

## SEC12 implementation delivered

1. `frontend/frt-finance-readonly.js`: validates live signed Supabase identity, active workspace and existing `frt_bootstrap` domain membership, validates company choices against the signed bootstrap response, then calls existing `frt_dashboard` and `frt_list_requests` with the current authoritative workspace and company code. Rechecks signed user/workspace after data retrieval. Returns bounded, projected FRT request information and five nonmonetary counts; rejects unexpected contracts, wrong companies, missing grants or session changes. No direct database table access, mutating finance RPCs or new backend auth system.
2. `frontend/frt-finance-ui.js`: HTML-escapes every returned company/request value, provides a company selector and shows FRT request counts plus up to 100 recent voucher/title/status/date rows. Monetary amounts, banking data, file details and requestor identities are deliberately excluded from the rendered projection, consistent with restricted board fields.
3. `frontend/app.js`: adds a **Finance (read-only)** tab *only* to an authorized board whose name resolves to the existing `Fund Released Tracker` module. Uses the current signed API client; retains `routeSerial` and caller/workspace checks to discard stale asynchronous responses; clears finance data on sign-out, expiry, workspace change or route exit. Company buttons cannot select arbitrary company codes. No thirteenth application/board, new URL host, session provider or privileged key.
4. `frontend/tests/frt-finance-readonly.test.mjs`: covers legitimate signed read projection, omitted sensitive payload fields, invalid company, backend denial, mismatched identity, invalid server responses, error handling, XSS escaping, no mutating RPCs, and FRT-only board binding.

## Authoritative live backend contracts

Read-only PostgreSQL inspection of the existing Supabase project `jtlusodorfnyzgyuewkz` verified the following supported RPCs:
- `frt_bootstrap(p_workspace_id uuid)`: uses `private.frt_current_role` (the deployed session-aware FRT resolver); returns authorized FRT role and companies.
- `frt_dashboard(p_workspace_id uuid, p_company text)`: membership-checked, company-scoped summary including five count keys consumed by this feature.
- `frt_list_requests(p_workspace_id uuid, p_company text, p_search text)`: membership-checked and company-scoped; source caps returned rows at 500. UI renders at most the first 100, without sensitive financial fields.

All three rely on the existing FRT role/membership restrictions and are callable through the current signed central Supabase RPC client. No new production DB migration was needed.

## Executed verification

- **Frontend CI:** `node --test frontend/tests/*.test.mjs` **209/209 PASS**, 0 failed, at source commit `33d1b7adab5faff39d710645e2eefab021362dc0`.
- **Disposable PostgreSQL CI:** SUCCESS. This existing job validates central role contracts; it is not an actual live FRT finance operational test.
- **Live GitHub Pages integration CI:** SUCCESS, at the same commit. GitHub Actions run [41218117939](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41218117939); separate GitHub Pages build/deployment also initiated by the source commit.
- **Live read-only integrity check:** ten FRT tables still have RLS, `private.frt_signed_session_active()` remains installed and private. Snapshot: 0 FRT requests, 2 finance audit rows, 0 liquidations, 0 voucher counters, 123 module assignments, 77 board memberships, 3 CRM role overrides, 14 CRM role audit records. **These latest inventory numbers differ from the earlier CI07 snapshot; their provenance has not been established and this milestone does not claim those records were unchanged over time.** The SEC12 work issued no production data-changing queries.
- **Not run:** authenticated browser finance tab as a legitimate FRT actor, live finance write authorization, and immediate revoked-token denial. CI07 operator waiver still applies only to administrative closure of CI07, not to independent security certification.

## Acceptance gates

| SEC12 milestone gate | Evidence classification |
| --- | --- |
| Existing signed FRT finance RPC contracts inspected | VERIFIED |
| Signed, workspace-scoped, fail-closed FRT client implemented and tested | VERIFIED |
| Existing 12-board FRT-only UI integration, no new hosting or login | VERIFIED |
| Read-only response projection, company isolation, XSS and mutation-denial tests | VERIFIED |
| Frontend, disposable PostgreSQL and Pages CI at source implementation | VERIFIED |
| Interactive signed production finance view / operational acceptance | PENDING |

**Scoped SEC12 status:** **5/6 VERIFIED (83.3% implementation-and-CI gate completion)**. Genuine signed-user operational acceptance remains **PENDING**, so SEC12 is not production-finance certified despite a successful Pages deployment.

**Next implementation priority:** extend the FRT domain view with authenticated request details and action availability derived from the existing authoritative finance role and record lifecycle, while retaining no-write default behavior. Do not perform finance writes or modify production role assignments merely to satisfy missing acceptance evidence.
