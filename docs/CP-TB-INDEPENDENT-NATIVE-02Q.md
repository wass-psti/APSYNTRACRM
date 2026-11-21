# CP-TB-INDEPENDENT-NATIVE-02Q — Signed Board Editor Assignment and Corrected QA Acceptance

Date: 2026-11-21 (Asia/Manila). Existing APSYNTRA CRM production project only. Baseline: `bce8a32a` from `origin/main`.

## Verified scoped production board grant

- User-selected scope was an approved second-account Toolbox Issues membership for QA. Signed Brave board owner `8e548572-f0b7-49c8-b6e7-f504296aad10` passed `/auth/v1/user` verification and the exact-workspace `apsyntra_role_user_management_snapshot` (`adminVerified: true`).
- Intended existing second account: `5655922e-bb42-45e4-bf8b-348a0bf77f3a` (Melchor R. Vasquez). Read-only DB verified an active Work Management membership and active profile. Signed administrative roster confirmed it was not protected and had no prior Toolbox Issues board role.
- Exactly one successful signed `UserRoleManagementClient.mutate` / `apsyntra_role_manage_user_access` transaction set `scope=board`, `role=editor`, `enabled=true` for board `e761b849-f144-4ad2-a418-af9e68b5cc58` in workspace `00000000-0000-4000-8000-000000000001`. It did not alter workspace roles, other boards, module assignments, RLS or platform administrators.
- Signed administrator readback showed the Editor role. Independent production `work_board_members` readback showed the original owner and the intended editor only. Native audit trail: change `bc1f8823-44b6-444f-b56c-cd53d1499861`, audit rows 509 (`proposed`) and 510 (`applied`) at 2026-11-21 14:00:15 UTC.

## Authorship correction — **not** dual-account acceptance

- After a browser refresh the Chromium session showed TalkBox and QA issue #5. Initial UI observations incorrectly treated it as Melchor's prior session. A later signed-session check and production author attribution established **both Chromium and Brave held the owner account** at the time of QA transactions. The cause of the signed Chromium identity change is undetermined; do not assume genuine account separation based on browser choice, initials observed earlier, or text entered into an update.
- QA update #6 (text mentioning Melchor) and reply #7 were **both authored by owner** `8e548572-f0b7-49c8-b6e7-f504296aad10`. Timer activity rows 46 (started) and 48 (stopped) were **also authored by owner**. PostgreSQL-authoritative `totalSeconds` advanced from 53 to 79 and `running` returned null; this proves timer persistence but **not** cross-user timer operations.
- QA correction update #8, also owner-authored, explicitly clarifies the incorrect labels in updates #6/#7 and preserves the original audit trail without deleting or rewriting historical QA discussion.
- Distinct user-authored issue, reply, timer and attachment writes remain **PENDING**. No credentials, JWTs, profile impersonation, RLS bypass, or fabricated tokens were used to manufacture acceptance.

## Synthetic attachment lifecycle — signed, owner-only

- QA attachment #2 `cp-tb-02q-dual-20261121.txt`, 90 bytes, was uploaded through the native UI and signed upload readback. Production DB confirmed owner creator identity (not Melchor).
- The other browser's owner-signed `TalkBoxAttachmentClient.download` returned 90 bytes with SHA-256 matching the independent source artifact: `959cd6efc5b9be28d0c933c630a92a6d8055b8ce373e6601b5c15291b06f0e15`. Exact filename matched. A browser Download click was also performed, but no file was found in ordinary Downloads/Desktop/Documents locations; direct disk-save acceptance remains unverified.
- The owner signed `TalkBoxAttachmentClient.removeVerified` for that exact disposable QA asset, yielding no active or pending cleanup in signed readback. Independent production read confirmed `deleted_at=2026-11-21 14:07:28.800693+00`, `storage_purged_at=2026-11-21 14:07:30.259457+00` and **zero** matching `storage.objects`. Both browser readbacks later showed no active/pending attachment.
- Historical QA attachment #1 from CP-TB-02K was not deleted again. No unrelated operational records were modified.

## Repository verification

- Focused TalkBox tests: **63/63 PASS**.
- Full frontend regression: **3158/3158 PASS**.
- `npm run build`: PASS, with pre-existing chunk-size advisory.
- `npm run lint`: PASS.
- No application source code, backend schema, RLS or production deployment changes were required by the verified scope.

## Final status and precise remaining gate

**PARTIALLY VERIFIED.** Production Editor board assignment, signed owner-only QA lifecycle, clean storage purge, original issue persistence and regression checks PASS. Final TalkBox dual-account production acceptance is **BLOCKED** until an independently signed Melchor session is genuinely active at the same time as the owner session and every QA write is attributed to its expected user ID by independent backend readback.

Next: `CP-TB-INDEPENDENT-NATIVE-02R — Independent Melchor Session Recovery, Author-Verified Dual-Account TalkBox Transactions, and Final Functional Closeout`.

Before touching QA data in 02R, verify `auth.uid()`/GoTrue signed identity **separately** for both browsers and the current workspace/board. Re-verify after reload and before each write. Then test a distinct-user update/reply, PostgreSQL timer start/stop, 90-byte synthetic attachment upload/download/cleanup with author and hash proof, refresh/reopen, and final storage/audit readback. Existing Editor grant already enables board writes; do not make any additional permission changes. If an authenticated Melchor session is unavailable, stop rather than misattribute single-account operations.
