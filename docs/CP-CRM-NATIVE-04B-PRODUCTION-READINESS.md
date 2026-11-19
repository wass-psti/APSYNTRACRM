# CP-CRM-NATIVE-04B — Genuine Signed-User Production Operational Readiness

**Date:** 2026-11-19 (Asia/Manila)
**Repository:** `wass-psti/APSYNTRACRM`
**Existing Supabase project:** `jtlusodorfnyzgyuewkz`
**Status:** Production signed read-only preflight VERIFIED; production write and cross-session transaction certification PENDING.

## Verified baseline

- Current production `main` commit at preflight: `38288374ad929f2211b0f622513b0557fdcdac38`. GitHub Pages run `44457598401` succeeded.
- Local disposable transaction acceptance from CP-CRM-NATIVE-04A: four PostgreSQL suites and 114/114 focused command tests PASS; full frontend 2770/2770 PASS. These are not real production writes.
- Existing genuine employee signed Chromium session verified, Work Management workspace. Production browser reached TimeTracker, Fund Tracker, FuelTrack+, TradeLink and restored the prior tab route.
- `scripts/cp-crm-native04b-production-readonly-preflight.mjs` result: **4/4 PASS**, zero failed Supabase requests, zero HTTP >=400 responses, zero JavaScript errors.
- Read-only database inventory (counts only): **41 profiles, 40 active profiles**, **36 active profiles assigned all four applications**. **Zero active profiles** have an obvious QA/test/sandbox/demo/fixture/nonproduction label in their email or display name. This is a label-based screening, not proof no QA identities exist.

## Reproduce non-mutating acceptance

Open an already signed employee TimeTracker tab in an existing locally authorized Chromium instance with CDP enabled. Then, on the authorized Mac:

```bash
node scripts/cp-crm-native04b-production-readonly-preflight.mjs \
  --cdp-url=http://127.0.0.1:9225
```

The preflight uses the existing live session. It never extracts cookies, browser storage, access tokens, user identifiers, financial amounts or document contents; it only inspects the visible application identity, read-only route text and response status. It never clicks transaction mutation buttons. It restores the original route even if a test fails. No browser login or user impersonation is performed.

## Four-application production write acceptance still outstanding

| Application  | Minimum controlled real-session acceptance                                                                                                                                                                                   | Current gate                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| TimeTracker  | Dedicated authorized acceptance identity clock-in with GPS → signed persisted attendance readback → independent-session My Hours → clock-out → verify one audit pair, no duplicated active session                           | PENDING explicit designated QA identity and consent to record real attendance                                             |
| Fund Tracker | Approved zero-value or synthetic designated request, exact company scope, draft/save, controlled Finance and GM review, deterministic DV and liquidation, two-session readback and cleanup/archive policy                    | PENDING designated QA identities, safe financial test policy and independent reviewers; **never execute banking payment** |
| FuelTrack+   | Dedicated no-physical-refueling test request, approval and completion in a safe test company, signed readback, retry and independent browser session, simulated receipt metadata without authentic physical-fuel transaction | PENDING designated QA identity and explicit simulation/no-physical-transaction policy                                     |
| TradeLink    | Dedicated synthetic document with clear test designation, signed create, For Approval, two distinct authorized reviewers, immutable Approved revision, PDF verification, refresh and independent account readback            | PENDING assigned writer plus two distinct signed reviewer identities and permission for test documents                    |

### Preconditions before changing production business data

1. Explicitly designate the existing or newly approved test accounts and company/workspace. Do not infer that an ordinary employee or admin is a QA account. Any new production account, application-role or permission grant is separately gated.
2. Establish a unique test-record prefix and a reversible cleanup/archive protocol, including downstream notifications, numbering and accounting side effects. Financial and attendance audit records must not be erased to hide test data.
3. Obtain separate approval for each live production transaction class with possible operational impact. If live bank actions, genuine GPS, real attendance records or third-party notifications are involved, prefer synthetic/staging instead.
4. Keep every real signed session in its established authority. Do not bypass safeguards, identity checks, reviewer separation, or existing RLS.
5. Verify persisted source rows, generated Board links, audit trails and independent-session readback using only the approved test identities. Record exact IDs internally without exposing personal details in public CI artifacts.
6. Classify any missing business-write evidence as PENDING, not PASS. Do not make or advertise production readiness claims from disposable transaction suites.

## Actual milestone disposition

- **VERIFIED:** Production deployment, signed session loading, four application read-only routes, zero client/RPC errors during the preflight.
- **VERIFIED:** Reusable read-only live preflight script added, plus previously completed disposable four-domain transaction contract acceptance.
- **PENDING:** Production write-path execution, persistence, actual two-identity cross-session readback, retry/concurrency against production, business-record reconciliation, and final operational certification.
- **NOT APPLICABLE:** Production schema migrations, additional restrictions, role changes, credential changes or new Supabase projects in this preflight.

**Decision:** CP-CRM-NATIVE-04B is not fully closed as a production transaction certification. The next bounded implementation is **CP-CRM-NATIVE-04B1 — Approved QA Identity/Record Isolation and Real Signed Transaction Readback**, once authorized acceptance targets and transaction boundaries exist.
