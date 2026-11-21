# CP-TB-INDEPENDENT-NATIVE-02K — Signed Attachment and Dual-Account Acceptance

Date: 2026-11-21 (Asia/Manila). Existing production project: `jtlusodorfnyzgyuewkz`.

## Verified, non-destructive production evidence

- Desktop Commander connected to the authorized Mac. Production Chromium's existing independently signed CRM tab was navigated temporarily to `#/talkbox/issue/5`; original `#/time-tracker` route was restored after acceptance.
- QA issue #5 (`CP-TB-02H-QA-20261121-SIGNED-ACCEPTANCE`) was present in a genuine signed production page. A native Refresh action preserved the issue, persisted parent discussion, and child reply. The UI displayed no active attachment or pending private-attachment cleanup.
- Production read-only SQL returned attachment #1 (`cp-tb-02j-qa-acceptance.txt`, 83 bytes), `deleted_at=2026-11-21 05:37:12.847435+00`, `storage_purged_at=2026-11-21 06:20:47.414611+00`, and **zero** matching `storage.objects` rows. Thus private purge readback is VERIFIED; no corrective production mutation was needed.
- The downloaded synthetic file was found at `~/Downloads/cp-tb-02j-qa-acceptance.txt`, with 83 bytes and SHA-256 `501a972d951ff505a527bf2d9fce77f40357c66754a65f20852b27bb0682447a`. Its text was `CP-TB-02J isolated private attachment acceptance. Synthetic bytes only. 2026-11-21.`. Local disk readback is VERIFIED. A separately preserved upload-source hash was not available for an independent byte-for-byte comparison; previously verified upload-side SHA-256 readback remains historical evidence, not fresh second-source proof.
- Read-only production issue metadata confirmed `time_tracking.totalSeconds=53`, `clockSource=postgresql`, `clockVersion=1`, `running=null` and a persisted `lastStoppedAt=2026-11-21T05:26:41.234812+00:00`.
- The merged exact NoSuchKey correction is in the inspected main lineage (PRs #682–#685), and prior Pages deployment reported success. Focused TalkBox regression **63/63 PASS**, Vite build **PASS**, ESLint **PASS** (baseline checks executed during this continuation).

## Acceptance remaining

**BLOCKED — Genuine independent two-account acceptance.** Only one authenticated production Work Management Chromium session was available. A separately opened tab did not inherit its in-memory session; it displayed Sign In and was closed. No second independently signed existing QA account was available. No credentials, sessions, roles, RLS, permissions or production application records were created or changed to circumvent this gate.

When two real distinct existing accounts in the same QA workspace become available, exercise issue update/reply synchronization, timer start/stop and persistence after refresh/reopen, attachment upload/download byte comparison and cleanup readback from both sessions. Use disposable QA issue data only and verify authorship and independent session identity. Existing issue #5 and its attachment are already settled; do not rerun destructive purge.

## Outcome

- Attachment storage purge: **VERIFIED**.
- Local downloaded artifact readback: **VERIFIED** (original-upload SHA cross-check pending).
- Existing account signed issue/update/reply refresh readback: **VERIFIED**.
- Server timer persistence (read-only): **VERIFIED**; dual-account timer operation **PENDING**.
- Full production functional closeout: **BLOCKED** by genuine two-account acceptance, not by code regression.

Next milestone if needed: `CP-TB-INDEPENDENT-NATIVE-02L — Genuine Two-Account Signed Cross-Session Functional Acceptance and Final Closeout`. Do not modify access control merely to obtain test coverage.
