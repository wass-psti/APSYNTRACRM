# CP-TL-GM-APPROVAL-02 — General Manager Sales Supervisor exemption

## Scope and behavior

The signed account asenagan@watchdogautomation.com.ph, with its existing
TradeLink General Manager role, receives an exemption only for its own submitted
Quotation or Supplier PO revision whose nominated primary reviewer is
aacsenagan@watchdogautomation.com.ph. Other PO Account Manager assignments and
all other module review stages remain unchanged. The remaining management
review is required; explicit Draft saves stay Draft. No synthetic review or
timestamp is generated. The existing reviewer, creator, workspace, and board
access checks are preserved. The exempt supervisor retains existing document
visibility; review action is not applicable.

Exemptions are sparse immutable revision records. Historical revisions without
a recorded exemption continue to use the standard dual-review contract.
The browser preview is advisory; the server computes and records the policy.
A signed GM re-save of an existing pending standard revision adopts the policy
in a new revision, preserving number, content, Board item, and past reviews.
An already-approved revision is never reclassified. A new revision submitted
by a different account uses standard routing. The new revision's policy is
checked for consistency inside the same save transaction.

## Local candidate files

Apply the following as one transaction only in an approved environment:
1. sql/candidates/cp-tl-gm-approval-02-policy.sql
2. sql/candidates/cp-tl-gm-approval-02-review.sql
3. sql/candidates/cp-tl-gm-approval-02-history.sql
4. sql/candidates/cp-tl-gm-approval-02-save.sql
5. sql/candidates/cp-tl-gm-approval-02-list.sql

These are local SQL candidates, not an activated production migration.
Save and list functions were derived from inspected production definitions;
review and history were reconciled with existing source and production
contracts. Recheck live function signatures, definitions, grants, triggers and
migration source history immediately before forming the final migration.
Deploy the compatible frontend with the backend in a coordinated release;
the legacy client cannot interpret a legitimate single-review Approved receipt.
Do not independently deploy only the policy capture trigger or any subset.
No direct production backfill is part of this candidate.

## Acceptance

Run the disposable PostgreSQL 17 suite:
`bash scripts/cp-tl-gm-approval-02-policy-disposable.sh`.
It loads existing staged TradeLink schema and compatible migrations in a
network-isolated container, then exercises ordinary-user six-module regression,
GM creation and replay, management approval, historical evidence, PO Draft and
supersession, and explicit re-save of a pre-policy pending quotation.
Synthetic identities and documents only.

Run the focused frontend tests and existing full CRM regression, build and
recovery-browser checks. After an explicitly authorized coordinated production
release, the actual GM can open the existing pending quotation, re-save it,
record the remaining Management validation, and verify print/readback.
Verify another employee's ordinary two-review workflow independently.
No production test document should be created without approval.

## Operational limitations

The notification trigger inventory on native document/review/event tables
showed no delivery trigger; the UI describes global notifications as not
connected. External schedulers or separately configured integrations have not
been exhaustively verified. No notification subsystem is changed.
Electronic PDF issuance remains disabled; only existing browser print output
is affected.

Rollback before any exempt revision exists can restore the prior source and
functions. Once exempt approvals exist, do not drop their policy/evidence or
blindly restore the two-timestamp-only readers. Use a forward-compatible
correction that retains revision evidence and printable history.
