**Current release policy (2026-11-10):** The owner retired mandatory RPO,
RTO and disaster-recovery rehearsal for all WatchdogWorkspace applications.
Existing Supabase backups and security controls remain. See
docs/RECOVERY-POLICY-RETIREMENT-20261110.md.

# TradeLink — Controlled Backend Activation and Signed-User Acceptance

Scope: existing APSYNTRA CRM TradeLink Board and the single existing
WatchdogWorkspace Supabase project. No changes to TimeTracker or other boards.

## Verified read-only baseline — November 9, 2026

PostgreSQL 17.6, seven saved TradeLink documents, canonical Board and workspace
intact. Existing QA Quotation at revision five with five audit events and
Board parity. Existing Draft commit/read/list RPCs are present.

Search, Submit, Review/History, Decision, Operational Completion/Reopen and
all attachment RPCs are absent. No TradeLink private Storage bucket, attachment
metadata ledger or TradeLink Storage policies exist. The current browser
context showed app initialization, not an authenticated acceptance result.

The existing isolated PostgreSQL 17 and frontend CI passes establish
source/fixture acceptance, not actual provider file transfer or signed HTTPS
production acceptance. The SQL inventory can be repeated without modification:
sql/tests/cp-tl03-activation-readonly-gate.sql

## Activation sequence and prohibitions

1. Apply the November 10 owner-approved recovery-policy retirement:
   24-hour RPO/RTO and mandatory restore rehearsal are NOT release gates.
   Preserve existing Supabase backups and data protection controls.
   Verify current production schema/permissions using read-only preflight.
2. Obtain exact-scope approval covering production SQL changes, new private
   Storage bucket and security policies, as distinct from ordinary source
   development. Reconfirm current Board/RPC/role/Storage scope immediately before deployment.
3. Capture the current state, affected function and audit-constraint
   fingerprints, grants, Board/document/audit counts, and a rollback plan.
4. Apply candidates only with their guarded pre/postflight checks, in order:
   server page search; signed Submit; Review/Revision; Decision;
   Operational Completion/Reopen. Provision the original TradeLink private
   bucket using approved Storage management interfaces rather than SQL
   mutation of storage.buckets. Apply the attachment candidate last.
   Never bypass dependency or permission checks.
   The exact source-controlled dependency candidates are:
   sql/tradelink-documents-page-candidate.sql,
   sql/tradelink-document-submit-candidate.sql,
   sql/tradelink-document-review-revision-candidate.sql,
   sql/tradelink-document-decision-candidate.sql,
   sql/tradelink-document-operational-candidate.sql and
   sql/tradelink-document-attachments-candidate.sql.
5. Repeat read-only inventory and inspect exact authenticated/anonymous
   grants, private Storage policies, Board projection and append-only events.
6. Exercise real existing authorized signed-user browser flows after backend
   approval: Draft create/edit/refresh; CAS and duplicate retries;
   server-side search across more than 50 records; Submit/Review/Revision;
   assigned approval/rejection; operational evidence/completion/reopening;
   private upload/download with SHA-256 verification, replacement, logical
   removal and retained audit. Deny ordinary Board-only users, wrong
   workspace, expired/revoked sessions, unauthorized Storage listing and
   transferable signed URLs. Real signed/Storage tests require a separate
   allowed QA data strategy, not use of employees' production records.
7. Only after these signed acceptance gates may the corresponding frontend
   switches be enabled. A frontend flag never grants backend permissions.

## Recovery decision

Current official Supabase documentation: database physical backups preserve
Storage metadata, not stored object bytes. The physical Restore to a New
Project feature creates another project and does not copy actual Storage
objects. This contradicts the current no-new-project constraint. No verified
provider-supported independent whole-project recovery was evidenced here,
and parent WatchdogWorkspace issue 76 was not accessible through the active
GitHub connector. Do not invent a favorable provider response.

Sources:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/clone-project
- https://supabase.com/docs/guides/storage/management/download-objects

## Acceptance classification

| Item | Status |
|---|---|
| Source implementation and isolated tests | VERIFIED |
| Current Draft RPC and Board integrity | VERIFIED |
| Production read-only activation inventory | VERIFIED |
| Retired project recovery policy (RPO/RTO/rehearsal) | NOT APPLICABLE |
| Search/workflow/attachment SQL installation | PENDING |
| Dedicated private TradeLink bucket | PENDING |
| Signed positive, denied and binary-transfer acceptance | PENDING |
| Frontend workflow/attachment activation | PENDING |
| Production-ready TradeLink end-to-end | BLOCKED |

Decision: NO-GO for production permission changes and new attachment files
until exact-scope authorization, signed security acceptance and Storage permissions are verifiable. Preserve
working Draft creation, editing, Board integration and document printing.
