# CP-TB-INDEPENDENT-NATIVE-02R — Independent Melchor Session Recovery and Actor-Verified Acceptance

Date: 2026-11-21 (Asia/Manila). Existing APSYNTRA CRM production environment; no new project, authentication configuration, access rules, or role changes.

## Verified production identity gate

- The authorized Desktop Commander Mac device was online. The current production CRM page was open in both Chromium and Brave.
- A fresh independent browser-side `AuthClient.restore()` followed by `getVerifiedUser()` (remote `/auth/v1/user` verification) returned user ID `8e548572-f0b7-49c8-b6e7-f504296aad10` in **both** Chromium and Brave. These are **two browser windows signed into the same board-owner identity**, not independent users. Both sessions were successfully verified; no credentials or tokens were exported or copied.
- The required distinct second identity, Melchor R. Vasquez (`5655922e-bb42-45e4-bf8b-348a0bf77f3a`), was not authenticated in either available CRM session. Do not infer identity from a browser, prior UI label, earlier session state, or text of a QA update.
- No additional signed QA issue, reply, timer, upload, or deletion write was attempted because the actor precondition was false. This avoids repeating the incorrect cross-user acceptance assertion corrected in CP-TB-02Q.

## Server-state reconciliation

- A read-only production database lookup confirmed Melchor's **Editor** membership on the existing Toolbox Issues board (`e761b849-f144-4ad2-a418-af9e68b5cc58`) remains active, as assigned and audited in CP-TB-02Q. No further board or workspace membership grant is required.
- The existing QA attachment #1 and #2 both retain `deleted_at` and `storage_purged_at` timestamps, with **zero** matching Storage object rows. No cleanup retries or production-data changes were necessary.
- The genuine owner-only TalkBox QA writes from CP-TB-02Q remain historical acceptance of single-actor persistence; they cannot establish two-user synchronization. Its correction update #8 remains the authoritative audit note.

## Fresh repository checks

Baseline: `origin/main` commit `5b9be9b2` (merged CP-TB-02Q PR #700).

- Focused TalkBox tests: **63/63 PASS**.
- Complete frontend test suite: **3158/3158 PASS**.
- `npm run build`: **PASS** (existing bundle-size advisory).
- `npm run lint`: **PASS**.
- No source or backend code defect was reproduced. No code, schema, role, permission or RLS changes were made for 02R.

## Acceptance status and next milestone

**BLOCKED: Distinct signed user identity unavailable.** Melchor has board Editor eligibility but no verified active Melchor browser session. It is unsafe to count another owner-authored QA action as cross-account acceptance. The remaining full acceptance percentage cannot be substantiated.

Next milestone: `CP-TB-INDEPENDENT-NATIVE-02S — Melchor-Owned Browser Sign-In, Strict Two-Actor QA Transaction Readback, and Final TalkBox Closeout`.

Minimum reproducible prerequisite: Melchor signs in to APSYNTRA CRM in a separate browser profile/window with his **own existing work account**, while the owner stays signed into a different session. Never share credentials, session tokens or browser storage between identities. Before each QA write, check both `/auth/v1/user` signed IDs and the exact workspace/board, and confirm the writer's `creator_user_id` or audit actor from the server. Then use only disposable QA data to test discussion/reply, PostgreSQL timer, private attachment byte/hash, download-to-disk if supported, private purge, independent reload and readbacks. If either session changes identity or becomes unauthenticated, stop the write and reestablish authentic sessions; do not change any permissions or RLS.
