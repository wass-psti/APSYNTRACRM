# CP-TB-INDEPENDENT-NATIVE-02S — Strict Two-Actor QA Acceptance

Date: 2026-11-21 (Asia/Manila). Production project and existing CRM only. Baseline: `fc104bcb` (merged CRM UI refinement PR #702).

## Real signed-user precondition (BLOCKED)

- The authorized Mac was reachable through Desktop Commander. Production APSYNTRA CRM was open in Chromium and Brave; a separate page for invitation staging was not treated as production authentication.
- Independently in each production CRM tab, `AuthClient.restore()` followed by `getVerifiedUser()` confirmed the signed Supabase Auth `/auth/v1/user` identity as **`8e548572-f0b7-49c8-b6e7-f504296aad10`** (existing Toolbox Issues board owner).
- The target Melchor R. Vasquez identity **`5655922e-bb42-45e4-bf8b-348a0bf77f3a`** was **not** signed in to either available CRM session. Opening a separate browser does not prove distinct identity and a prior account label must not be used in place of the server verification.
- No two-actor QA writes, unauthorized account switching, token copying, credential extraction, or permission changes were made. The production author-verified acceptance gate remains BLOCKED. Do not count prior owner-only QA writes as cross-account verification.

## Production read-only reconciliation

- The existing Toolbox Issues board `e761b849-f144-4ad2-a418-af9e68b5cc58` still has board owner `8e548572-f0b7-49c8-b6e7-f504296aad10` and Editor `5655922e-bb42-45e4-bf8b-348a0bf77f3a`. No additional role or membership assignment is needed.
- Historical QA attachments #1 and #2 on issue #5 are both soft-deleted, have server-confirmed `storage_purged_at` timestamps, and have **zero** matching private Storage objects. No cleanup reattempt was made.

## Fresh verification

- Focused TalkBox unit/regression suite: **63/63 PASS**.
- Full frontend suite: **3161/3161 PASS**.
- `npm run build`: **PASS** (existing bundle-size advisory).
- `npm run lint`: **PASS**.
- No production code, schema, deployment, user credentials, board assignment, platform roles, or RLS changed as part of 02S.

## Next action and acceptance

Status: **PARTIALLY VERIFIED; genuine dual-account production closeout BLOCKED**. Next milestone: `CP-TB-INDEPENDENT-NATIVE-02T — Genuine Melchor Work-Account Sign-In, Verified User-Attribution Cross-Account QA, and Final TalkBox Production Certification`.

Minimum reproducible action: have Melchor personally sign into the production CRM in a distinct private browser profile/session while the owner remains signed into a different one. Do not share or copy passwords, OAuth tokens, sessionStorage or refresh tokens between accounts. Verify `getVerifiedUser().id` is exactly Melchor on one browser and the owner on the other **before each write**. Then perform disposable issue/discussion/reply, timer, upload/download byte-hash, signed cleanup, refresh/reopen and server-side `creator_user_id` / actor readback. If either actor precondition fails, stop and report the blocker instead of repeating single-user actions.
