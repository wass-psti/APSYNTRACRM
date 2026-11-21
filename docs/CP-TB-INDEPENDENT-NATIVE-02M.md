# CP-TB-INDEPENDENT-NATIVE-02M — Independent QA Session Establishment and Genuine Dual-Account Acceptance

Date: 2026-11-21 (Asia/Manila). Continuation of merged CP-TB-02K evidence in PR #689. No new Supabase project or third-party runtime.

## Evidence captured in this execution

- Authorized Desktop Commander device `Informations-MacBook-Pro.local` was online and provided genuine Mac/browser access.
- Chromium contained one signed APSYNTRA CRM Work Management session, initially at `#/time-tracker`. The existing Brave APSYNTRA CRM tab was not signed in: it displayed `Session expired. Please sign in again.` This is NOT a second independent signed identity.
- Attempting the existing `#/talkbox/issue/5` route in the signed Chromium session did not produce a valid QA issue readback. Instead the application navigated to `#/boards`, where the UI showed `0 active boards` and `No boards available`. The cause is unverified (possible workspace or board context mismatch); no permission modification or fabricated workspace membership was made.
- Restored Chromium navigation to its original `#/time-tracker` route after inspection.
- Fresh focused TalkBox tests from the then-current `origin/main` (`cd91d3d7`) passed 63/63. `npm run build` PASS and `npm run lint` PASS. Build emitted only standard size advisory.
- Previous CP-TB-02K production attachment #1 storage purge, downloaded artifact readback and persisted server timer evidence remain accepted as historical evidence. No repeat destructive action was attempted on already-purged attachment #1.

## Acceptance matrix

| Gate | Outcome |
| --- | --- |
| Production Desktop Commander reachability | VERIFIED |
| Latest focused TalkBox regression | VERIFIED (63/63) |
| Latest build and ESLint | VERIFIED |
| Two distinct live signed users | BLOCKED: second session not authenticated |
| Issue #5 live signed readback on current session | BLOCKED: route fell back to zero-board view |
| Cross-user issue and threaded reply persistence | PENDING |
| Cross-user timer start/stop/readback | PENDING |
| Cross-user attachment transfer/cleanup | PENDING |
| Final two-account production acceptance | BLOCKED |

## Next solid milestone

`CP-TB-INDEPENDENT-NATIVE-02N — Signed QA Workspace Context Restoration, Independent Second-Account Authentication, Genuine Dual-Session Acceptance, and Final TalkBox Closeout`

First establish that two existing, different authorized identities are genuinely signed into the same existing QA workspace and that Toolbox Issues is visible in each account. Diagnose the present zero-board route behavior against workspace selection/read-only board discovery before touching any role/permission configuration. Only then perform controlled disposable-QA issue/update/reply/timer/file operations and independent signed readbacks across both sessions. Preserve authorization, RLS, credentials, existing records and prior purge evidence. Do not claim final production acceptance until all gates pass.
