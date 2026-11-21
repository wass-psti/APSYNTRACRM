# CP-TB-INDEPENDENT-NATIVE-02J — Private Attachment CDN Freshness Verification and Signed Acceptance

Date: 2026-11-21. Existing Supabase project: jtlusodorfnyzgyuewkz. No new project or monday.com runtime.

## Actual production browser acceptance

On the existing authenticated Work Management Chromium session, native TalkBox QA issue #5 (CP-TB-02H-QA-20261121-SIGNED-ACCEPTANCE) was opened without modifying any existing operational records.

- Private bucket toolbox-issues-attachments existed, public=false, 50 MiB file cap.
- Genuine signed browser upload of an 83-byte synthetic text file cp-tb-02j-qa-acceptance.txt passed. The native attachment client reports byte/hash verification, and an independent production database read confirmed attachment #1 and the registered Storage object.
- A separate signed download UI action executed without a visible application error; no output file was located in the Mac's usual Downloads, Desktop or Documents locations. Direct download-to-disk readback is UNVERIFIED, not a PASS.
- Signed UI Remove hid the attachment, deleted the Storage object (independently confirmed absent from storage.objects), but its immediate authenticated GET produced the user-visible error "Attachment remains downloadable; use Retry cleanup". Original deleted_at set; storage_purged_at remained null, preserving recoverable pending cleanup.
- One retry also left cleanup pending. Another attempted instrumented retry was interrupted by unrelated application board navigation. No manual purge-confirmation or direct SQL mutation was performed. Browser route was not used to impersonate another user.
- Second independent Work Management signed account was unavailable. Two-account browser parity remains PENDING.

## Narrow correction

Supabase Storage CDN can briefly serve a cached private object following deletion, despite metadata being absent. Official Storage CDN documentation supports a new cacheNonce URL query parameter to force a fresh object read. This patch changes ONLY the post-DELETE signed absence verification GET to append a fresh nonce. It retains no-store fetch, signed JWT and workspace checks, origin-relative path validation, exact Storage DELETE route and existing transactional readback.

Crucially, a fresh signed 200 response remains an error, leaving the existing soft-deleted attachment in recoverable pending cleanup. Only a fresh authenticated 404 permits signed toolbox_issues_confirm_attachment_purged followed by independently signed issue readback.

No new dependencies, RLS/RBAC policies, user permissions, credentials, signed-in accounts, projects, or production schema changes.

## Automated evidence

- New regression tests: nonce is present on post-delete GET only; previously cached original URL can return 200 while fresh nonce GET returns 404; cache-busted 200 never triggers purge confirmation.
- Native TalkBox focused regression: 75/75 PASS.
- Full frontend regression baseline: 3122/3122 PASS.
- Vite production build, lint, CSS bundle check: PASS.
- Post-deployment genuine signed production purge completion: must be separately verified before final certification.

## Open gates

1. Deploy reviewed patch via normal GitHub PR/CI/Pages policy.
2. Reopen pending attachment #1 on QA issue #5, click Retry cleanup once, verify 404 and backend storage_purged_at receipt and zero pending cleanup in a fresh signed issue readback.
3. Establish two DIFFERENT existing signed Work Management accounts in separate browsers, then verify live cross-account issue, discussion, attachment and timer persistence across refresh and reopen. No role/RLS changes.
4. Independently verify a downloaded synthetic file's bytes in browser or on disk; do not equate clicking Download with verified bytes.

If any gate remains open, proceed to CP-TB-INDEPENDENT-NATIVE-02K — CDN-Fresh Private Attachment Production Readback, Genuine Dual-Account Signed Workflow Acceptance, and Final Functional Closeout.

## NoSuchKey live production diagnosis and idempotent retry correction

After the cacheNonce patch was deployed in PR #682, a fresh signed browser loaded the updated module. A retry remained pending with the error "Attachment hidden but private binary deletion unconfirmed". Read-only Supabase Storage logs provided authoritative detail: the original Storage DELETE succeeded with HTTP 200; subsequent delete requests to the same already-absent object returned HTTP 400 with internal error code NoSuchKey and internal status 404. Storage metadata remained absent, and the CRM attachment remained soft-deleted with no purge confirmation.

The 02J follow-up treats Storage DELETE HTTP 400 or 404 as a *possible already-absent object* on retry, never as final success. It still requires a cache-fresh signed authenticated GET 404, signed backend purge receipt, and independent signed issue readback before returning success. Any signed GET 200, denied operation or failed confirmation preserves recoverable pending state. No backend mutation bypass, direct database write, RBAC/RLS change, or secret handling is introduced.

Automated tests separately cover HTTP 400 + signed GET 404 (safe continuation) and HTTP 400 + signed GET 200 (no confirmation). The final production signed retry remains subject to exact-commit Pages deployment and independent database readback.

## Proof-gated cleanup after opaque DELETE transport failures

After the second release (PR #683), production Chromium loaded the exact published JS source including 400/404 idempotent handling. A signed retry still reported the "private binary deletion unconfirmed" message before reaching the fresh GET. Storage logs independently prove the original DELETE had succeeded and subsequent retries hit NoSuchKey; the browser-visible error classification can be opaque when a failing cross-origin DELETE does not produce a usable HTTP response.

The final client correction treats the DELETE attempt as best-effort transport only, not an authoritative deletion receipt. Regardless of response/rejection, the workflow MUST independently obtain an authenticated, nonce-fresh GET 404 and a successful server-side RPC which checks the Storage metadata, then independently read back the issue with no active or pending attachment. Any GET 200/401/403/5xx or server uncertainty preserves pending cleanup. Tests cover transport failure + GET 404 + confirmation PASS; transport failure + GET 200 DENIED; retry after an uncertain GET DENIED, then recovered GET 404 PASS. There is no new RLS or permission grant, project, dependency, stored secret, backend migration or role change.

Production confirmation requires replaying existing pending attachment #1 for QA issue #5 only after this source passes CI and exact-commit Pages deployment. Never manually set storage_purged_at or claim cross-account parity without two independent genuine Work Management sessions.
