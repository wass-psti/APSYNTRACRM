# CP-TL-REVISION-HISTORY-05 — Historical Approved Reprint Closeout

Date: 2026-11-17 (Asia/Manila)
Repository: `wass-psti/APSYNTRACRM`
Existing Supabase project: `jtlusodorfnyzgyuewkz`

## Production read-only observation

Production currently contains **15 TradeLink documents and 15 baseline revision
snapshots**, with **zero** post-activation captured revisions and **zero**
snapshots preceding the current document revision. One current Quotation is
Approved. The existing `20261117020000` migration remains installed.

**There is no authentic superseded Approved revision in production.** This
is a data-dependent acceptance limitation, not proof that historical
reprinting failed. No new production documents, revisions, approvals,
reviewer assignments, role grants, policies or migrations were created.

## Independent disposable checks

1. Disposable PostgreSQL 17 ran the existing signed-review fixture,
   immutable snapshot migration and `sql/tests/cp-tl-revision-history-acceptance.sql`.
   **PASS:** original revision content retained; revised content appended;
   two distinct signed-review events for original revision; exact authorized
   retrieval of Approved revision 1; revision 2 stays For Approval; denied
   snapshot mutation and unapproved print eligibility cases.
2. `scripts/tradelink-historical-reprint-browser-acceptance.mjs` verifies
   the historical revision bundle through the actual client normalizer,
   All Documents revision action rendering, official company template,
   financial calculations and real headless Chromium A4 PDF output.
   **PASS:** previous Approved revision prints using original item price
   and total, whereas the newer pending revision is not offered for print.
   The output is disposable synthetic QA, **not an issued PDF**, and is not
   evidence of a genuine production historic print.
3. The browser test runs as a dedicated CI gate on relevant changes and
   can be run locally with
   `node scripts/tradelink-historical-reprint-browser-acceptance.mjs`
   after `npx playwright install chromium`. On a Mac with system Chromium
   but no Playwright-managed binary, set
   `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/Applications/Chromium.app/Contents/MacOS/Chromium`.

## Required final acceptance event

When the *normal commercial workflow* genuinely supersedes an Approved
post-activation TradeLink revision, verify the signed All Documents selection,
the prior immutable snapshot's content and company assignment, two assigned
reviewer identities/timestamps for that precise revision, the current
revision's separate status, the browser A4 PDF's historical number/revision
and amounts, and navigation/refresh persistence. Avoid manufacturing a
production document merely to satisfy acceptance.

**Classification:** Implementation and disposable PostgreSQL/Chromium
acceptance: VERIFIED. Production historical Approved reprint: PENDING
until a real preceding Approved snapshot exists. Production final closure
cannot be declared solely from synthetic test fixtures.
