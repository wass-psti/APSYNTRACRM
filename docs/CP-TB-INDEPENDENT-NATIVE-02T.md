# CP-TB-INDEPENDENT-NATIVE-02T — Isolated Melchor Sign-In Setup and Two-Actor Acceptance Gate

Date: 2026-11-21 (Asia/Manila). Production APSYNTRA CRM; no new Supabase project, new permissions, account impersonation, or application code changes.

## Browser identity evidence

- Authorized Desktop Commander device was online and reachable.
- Fresh independent `AuthClient.restore()` and Supabase Auth `/auth/v1/user` verification in the original production Chromium and Brave tabs returned the same signed user ID `8e548572-f0b7-49c8-b6e7-f504296aad10` (the Toolbox Issues owner) in both. Distinct browser names cannot establish distinct actors.
- No independently authenticated Melchor user (`5655922e-bb42-45e4-bf8b-348a0bf77f3a`) was available in those tabs, and no attempt was made to reuse or extract credentials, sessionStorage, or tokens.
- A separate, persistent Chromium process was launched with its own isolated `--user-data-dir` at `$HOME/.apsyntra-work/cp-tb-02t-melchor-browser-profile`, pointing at `https://wass-psti.github.io/APSYNTRACRM/#/overview` for Melchor to personally authenticate. Process existence and profile creation were observed. The intended Melchor login remains **unverified**; no password or token was entered or copied. The preexisting main CRM browser sessions were preserved.
- The user's other localhost tab was returned to `http://localhost:5174/` after a macOS browser-window focus ambiguity, with no source or configuration changes made there. The separate user-data-dir process was then launched and confirmed without relying on AppleScript incognito window discovery.

## Latest repository verification

Baseline: `87f7d22e` (merged PR #706 on `origin/main`).

- Focused TalkBox suite: **63/63 PASS**.
- Full frontend suite: **3167/3167 PASS**.
- `npm run build`: **PASS** (existing chunk advisory).
- `npm run lint`: **PASS**.
- No genuine two-user operations were attempted in the absence of an authenticated second actor. Historical 02Q/02R/02S QA evidence and the narrow Melchor Toolbox Issues Editor assignment remain the relevant baseline; no extra role or grant was requested.

## Acceptance disposition

The intended second-account QA acceptance and final production certification are **BLOCKED pending Melchor's own authentication**. Do not use the existing owner-authenticated sessions to claim two-account acceptance.

Next milestone: `CP-TB-INDEPENDENT-NATIVE-02U — Verified Melchor Login in Isolated Browser Profile, Two-Actor Backend-Attributed QA, and Final TalkBox Acceptance`.

Minimum next action: Melchor signs into the opened dedicated production CRM browser profile with his own work-account credentials; no sharing passwords or sessions. Verify his `/auth/v1/user` ID exactly `5655922e-bb42-45e4-bf8b-348a0bf77f3a` and the owner ID exactly `8e548572-f0b7-49c8-b6e7-f504296aad10` before every write. Use only disposable QA records for updates/replies, timer start/stop, attachment byte/hash and private cleanup, independent refresh and database authorship readback. Stop immediately if identity differs or is unverified. No additional board, platform, or workspace permission changes are needed.
