# CP-CRM-CONN-03B — Genuine Signed Employee Four-Application Runtime Acceptance

**Date:** 2026-11-19 (Asia/Manila)
**Repository:** `wass-psti/APSYNTRACRM`
**Deployed code:** CP-CRM-CONN-03A, PR #565 and production closeout PR #566
**Supabase project:** Existing `jtlusodorfnyzgyuewkz`
**Acceptance:** **VERIFIED — genuine signed employee, read-only runtime**
**Scope:** TimeTracker, Fund Tracker, FuelTrack+, TradeLink

## Starting state and actual session identity

A previously authenticated, independently running Chromium profile on the authorized MacBook contained an existing **Jerome / CRM Employee / employee** account in the **Work Management** workspace. The original employee tab was at `#/overview`. The script connected to its existing local Chromium DevTools endpoint; it **did not** use, print, copy, request or mint access tokens, session cookies, API keys, passwords, or credentials.

After an authenticated page reload:

- `GET /auth/v1/user`: HTTP 200.
- `POST /rest/v1/rpc/wm_auth_access_context`: HTTP 200.
- `POST /rest/v1/rpc/wm_list_boards`: HTTP 200.
- Board-list response: **four** records, **TradeLink**, **FuelTrack+ v3**, **TimeTracker Attendance**, **Fund Released Tracker**.
- Browser startup state: `AUTHENTICATED`.
- Visible employee role: **CRM Employee**.
- Visible session: **Secure session / Live synced**.

The general Overview and **My Boards** still show **zero** boards. That result is **expected** because `isStandaloneApplicationBoard` deliberately excludes TimeTracker, Fund Tracker, FuelTrack+ and TradeLink from ordinary board counts and board cards. The raw signed backend catalog contains all four, so the overview count is not evidence of a failed response or stale cache.

## Real browser route matrix

Each route was navigated in the genuine employee tab using the live deployed site. This included full page navigation and authenticated backend reads. The test did not use a mocked session or run any production mutation.

| Native route            | Verified visible result                                                                                                                          | Outcome  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `#/time-tracker`        | **TimeTracker Attendance**, Employee role, Signed Clock writes active, Signed workspace verified, idle clock-in form, working signed board reads | **PASS** |
| `#/fund-tracker`        | **Fund Release Management**, REQUESTOR role, Signed financial data connected, company selector, signed company dashboard and request list        | **PASS** |
| `#/fueltrack`           | **FuelTrack+**, Verified signed FuelTrack operations · User, dashboard and authorized request aggregates                                         | **PASS** |
| `#/tradelink/documents` | **TradeLink**, My Assigned Documents, signed account-scoped document list and filters, read-only empty-list state when no documents assigned     | **PASS** |

TradeLink's default `#/tradelink` route canonically resolves to `#/tradelink/drafts/quotation`. For this employee, Create New shows **unavailable** because the current separate TradeLink document-creation contract requires Board Manager capability. That is **existing** workflow behavior, not a recurrence of the “existing board not found” failure. Document-read acceptance instead checks the authorized `#/tradelink/documents` section. No role or policy was expanded.

The Fund Tracker, FuelTrack+ and TradeLink lists showed zero records in their current signed response scopes. Such empty business datasets are valid; the real interface and backend reads were available.

## Reproducible acceptance script

`scripts/cp-crm-conn03b-signed-employee-browser-acceptance.mjs`

Run **only** when a genuine signed employee's Overview tab is already open inside a locally authorized Chromium instance with a known debugging port:

```bash
node scripts/cp-crm-conn03b-signed-employee-browser-acceptance.mjs \
  --cdp-url=http://127.0.0.1:9225
```

The script:

- Requires an explicit local `127.0.0.1` CDP URL; it cannot sign users in.
- Selects an existing employee Overview tab and verifies the visible secure session and employee identity.
- Navigates the four native routes and waits for their existing signed UI.
- Verifies all four canonical board names appear in a successful `wm_list_boards` response.
- Fails on unexpected HTTP error responses, failed network requests, or page errors.
- Returns the employee tab to its original location even if an assertion fails.
- Does **not** inspect browser cookies, authentication storage, bearer tokens or user credentials.
- Does **not** call attendance clock-in/out, request creation, approval, refueling, printing, document save, or any other business mutation.

**Observed automated result:**

```text
CP-CRM-CONN-03B
VERIFIED_READ_ONLY_EMPLOYEE_RUNTIME
TimeTracker: PASS
Fund Tracker: PASS
FuelTrack+: PASS
TradeLink: PASS
Canonical boards observed: 4
Failed requests: 0
HTTP errors: 0
Page errors: 0
Mutations submitted: 0
Domain writes tested: false
```

## Acceptance boundary and closeout

**Verified:** CP-CRM-CONN-03A's production board-membership reconciliation now permits an existing employee to initialize all four native applications with genuine signed browser requests. No zero-board startup failures were observed. Browser session restoration and the four application routes were stable.

**Not tested:** Actual production attendance clock-in/out, financial request submission, FuelTrack+ request/approval, TradeLink document creation/approval, or other business writes. The current assigned-document count was zero. These operations would change business records and are not necessary to certify the read-only native application startup problem fixed.

**Unchanged:** Existing roles, authorization policies, RLS, workspace relationships, administrator scope, company scope, board definitions, and assigned business capabilities. No application writes or production data changes occurred during CP03B.

**Decision:** The native employee **interface access and read-only runtime restoration** milestone is complete. No further implementation is required for CP-CRM-CONN-03B. Any future issue with operational write workflows belongs to the relevant application workflow acceptance milestone, not a speculative permission-policy rewrite.
