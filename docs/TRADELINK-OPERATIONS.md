# TradeLink — Current operations and release status

**Updated:** 2026-11-08 (Asia/Manila). **Project:** APSYNTRA CRM, existing shared WatchdogWorkspace Supabase. This is the single active TradeLink release-status summary. Historical checkpoint evidence remains in Git history and merged PRs.

## What we are building

Enable an authorized user to **create, save, reopen and preview a real Draft**, synchronizing the same persisted record with its **Board item** and **All Documents**. A local preview must not be reported as a database save.

The guarded Draft and document/Board integration code already exists. `sql/cp-tl03-staged-domain.sql` models the atomic document, Board row and audit transaction, with revision and retry protection. See [persistent document implementation](TRADELINK-PERSISTENT-DOCUMENT-OPERATIONS-INTEGRATION-20261107.md). Full submission, approval, legal PDF and attachment workflows remain separate functionality.

## Most recent verified TradeLink functionality

- Signed Draft persistence and All Documents/Board integration are live.
  At the last read-only production check, seven TradeLink documents existed;
  the QA Quotation had revision 5, five audit events and a matching Board item.
- Saved-document Print / Save as PDF shipped in PR #99. Signed browser
  acceptance across the six document modules remains pending.
- Submission, assigned review/revision, approval/rejection, operational
  completion/reopen, global signed search and secure attachment backends
  are staged in source. Their newer SQL RPCs/bucket and activation switches
  are not installed/enabled in production.

## Actual technical state

- **Stage A:** The source-controlled `sql/tests/cp-tl03c-phase1-readonly-activation-preflight.sql` previously passed 15/15 live read-only checks. Historical signed manager/employee and one revoked TL03 read report are bounded user-provided evidence, not proof of production document writes.
- **Legacy sessions:** The 11-function guard candidate is merged as source in `sql/cp-tl03e-legacy-session-hardening-candidate.sql`. Isolated PostgreSQL 17 [CI run 42395359606](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42395359606) passed all 11 exact-cause revoked-session denials and positive role/ACL scenarios. **The guards are not installed in the live database.**
- **Draft activation (2026-11-08):** The project owner explicitly authorized the two existing authenticated Draft commit grants and one genuine signed-user QA document. The exact existing two-grant SQL candidate was executed in WatchdogWorkspace. Live catalog verification confirms both authenticated EXECUTE grants enabled, anonymous access denied, read/list preserved, direct table mutations denied, and zero document/Board/audit records immediately after activation. The new frontend release enables both the signed read and signed write switches. **Real signed-user save, Board and All Documents acceptance is still pending.**
- **Review:** The project owner waived the optional independent review for the source candidate ([issue #75](https://github.com/wass-psti/APSYNTRACRM/issues/75)); this was not an independent security attestation or an authorization to apply SQL.

## Practical recovery constraints

The owner specified whole-project **RPO <= 24 hours** and **RTO <= 24 hours**, and **requires a demonstrated genuine restore rehearsal with no waiver**. They also restricted this work to the existing single Supabase project. These are targets, not verified recovery metrics.

The provider last reported **8 completed physical backups** (latest `2026-11-07T17:18:39.359Z`, or November 8 at 1:18 AM PHT), with WAL-G enabled and **PITR disabled**. Daily snapshots do not prove a worst-case 24-hour RPO or measured RTO. The last aggregate Storage inspection found seven private buckets and zero object-metadata rows; database backups **do not include actual Storage file bodies**. A provider in-place restore disrupts the shared production project. No supported isolated physical restore was verified without creating another project. The isolated synthetic `pg_dump`/`pg_restore` [test PR #81](https://github.com/wass-psti/APSYNTRACRM/pull/81) is regression evidence **not a real physical-backup restoration**.

This is **one real unresolved recovery limitation**, not a reason to create more approval/checkpoint documents. Do not fabricate a restoration or a waiver. Provider confirmation of a viable rehearsal path or explicit owner revision of constraints must precede any risky restore. See [Supabase backups](https://supabase.com/docs/guides/platform/backups).

## Direct path to working TradeLink documents

1. Keep the unresolved actual-backup restoration limitation visible. The owner-approved narrow Draft permission change is not evidence of whole-project recoverability. No provider restore, recovery export or broader security change is authorized here.
2. When a viable recovery decision and a **separate exact-scope production SQL approval** exist, execute only the reviewed 11-function session hardening with fresh source/owner/ACL preflight, a controlled operator/window and positive/negative signed-session checks. The candidate uses `psql` directives; do not paste it unchanged into the SQL editor.
3. The exact two authenticated Draft write grants have now been applied under the owner-approved scope, with the existing narrow revoke-only script retained for containment. The frontend write activation is source controlled. Only one separately authorized signed Draft QA save/edit/refresh is in scope; broader permissions and workflow transitions are not authorized.
4. Run **one end-to-end genuine authorized acceptance**: save/retry/update → persisted Draft → correctly linked Board item → All Documents → refresh/reopen, plus denied employee, foreign-workspace and revoked access. Fix any functional defects directly rather than inventing more milestone gates.

**Current status (2026-11-08): The two commit EXECUTE grants are verified live, and this release enables user-facing signed Draft writes. Genuine production save/reopen/Board/All Documents acceptance remains PENDING.** Passing CI or listing backups does not prove functional runtime acceptance or the previously required restore rehearsal.

## Signed saved-document output (TradeLink only)

All Documents offers **Print / Save PDF** for an authorized, listed document.
Before showing the output, the frontend makes a **new signed**
tl03_document_read request and a signed Board read, then compares the current
workspace, document identity/type/number, revision/state/archive marker, and
linked Board item. If any assertion fails, printing is refused.

The output is a transient in-memory preview: no duplicate database row, Storage
object, blob download, separate login, or external rendering service is
created. A direct user action opens the native Chromium/Safari browser print
dialog, where the user may select **Save as PDF**. Six TradeLink module layouts
use the actual persisted fields, including all saved line items and the existing
commercial calculation rules; untrusted text is escaped. Each page labels the
saved revision and workflow state. Printing does not authorize Drafts, issue
legal/tax documents, deliver goods, or acknowledge payments.

The browser print path was locally validated using a **synthetic 27-line
Quotation**, which produced a two-page PDF in headless Chromium; fixture files
were deleted. Live signed-user print-dialog acceptance across six module types
remains pending.

**Attachment boundary:** No dedicated TradeLink attachment Storage bucket
exists in the current production inventory. Legacy reconciliation tables do
not establish a secure, functioning TradeLink upload/download contract.
Do not reuse unrelated application buckets or activate attachment controls
until signed document-level read/write authorization, Storage RLS, metadata
integrity, cleanup and recovery handling are verified and any production
permissions change receives separately scoped authorization.

## TradeLink dedicated private attachments — staged source contract

**Scope:** Only the existing TradeLink Board and the single existing Supabase
project. Files belong to a **signed saved TradeLink document** and its linked
Board item. Do not reuse generic Board, FRT, Toolbox or other module buckets
as a substitute for the source-defined private TradeLink bucket.

- **Source-only candidate:** sql/tradelink-document-attachments-candidate.sql.
  Requires the existing uninstalled TradeLink Submit, Review/Revision,
  Decision and Operational SQL candidates plus a new **private** Storage
  bucket provisioned with separate exact-scope authorization. The expected
  bucket has a 20 MiB maximum and ten original TradeLink MIME types.
  Preflight rejects missing, public or over-broad buckets; it does not
  create Storage buckets or another Supabase project.
- **Private metadata:** private.tl03_attachments has RLS enabled and all
  direct client table grants revoked. Only signed, active, same-workspace
  General Managers who pass the central Board/session contract may call
  prepare, finalize, list and logical remove RPCs. Names, MIME, size,
  document identity, revisions and server-created keys are checked.
- **Storage RLS:** INSERT requires a pending upload issued to the actual
  current user. SELECT/GET requires an active registered attachment and
  current document-level manage scope. No anonymous/public, DELETE or
  UPDATE/upsert Storage policies are added.
- **Atomic persistence:** Finalize verifies Storage metadata and uploader
  then synchronizes the file, document revision, Board modification time,
  immutable document event and Board log in one transaction. Replacements
  retain old versions under restricted access; removal records a reason
  and revokes access without permanently deleting bytes.
- **Client:** frontend/tradelink-attachments.js uses the existing APSYNTRA
  JWT, verifies a file's recorded size and SHA-256 after authenticated GET,
  and denies any foreign path or forged signed receipt. All Documents
  conditionally includes upload, replacement, download and removal actions,
  but the production flag TL03_ATTACHMENTS_ENABLED remains **false**.
- **Synthetic acceptance:** Isolated PostgreSQL 17 tests exercise Storage
  policy decisions, replacement, current-user upload scope, CAS, Board/audit
  parity, and role/workspace/revoked-session denials. Storage test objects
  contain only synthetic metadata: **no live binary upload or download**.

**Recovery:** sql/tradelink-document-attachments-empty-rollback.sql may be
used only when there are **zero** TradeLink attachment rows, zero Storage
objects and zero attachment events. It refuses data loss or unseen drift.
Populated rollback, physical Storage cleanup, expired upload reconciliation,
content/malware scanning, Storage-file backup and a provider-backed restore
rehearsal remain separate requirements. The existing whole-project
24-hour RPO and RTO targets and mandatory rehearsal remain binding; these
synthetic tests do not demonstrate them. New Storage permissions/production
migration require separately scoped authorization and live signed acceptance.
