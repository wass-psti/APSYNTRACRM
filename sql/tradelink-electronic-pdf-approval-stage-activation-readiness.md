# CP-TL-PDF04 — Controlled production activation readiness

**Decision: NO-GO for production activation.** This is a preparation and verification record, not authorization to deploy migrations, change permissions, or generate signed PDFs. The `TL03_PDF_STAGE_ENABLED`, `TRADELINK_ELECTRONIC_PDF_ISSUANCE_ENABLED`, and `TRADELINK_PDF_TEMPLATE_ACTIVATED` flags remain **false**.

## Verified nonproduction baseline

- Candidate SQL: `sql/tradelink-electronic-pdf-approval-stage-candidate.sql` (additive private event store, role-scoped signed RPCs, independent stage events).
- Disposable PostgreSQL 17 suite: `cp-tl03b-disposable-postgres.yml` runs the existing document workflow, then stage event tests and independent concurrent signoffs on a synthetic signed document.
- Revision-change test ensures that an edited/reassigned quotation's new revision returns **zero** current approvals even while its previous revision's audit events remain immutable.
- Concurrent test runs two independent signed PostgreSQL sessions against the same stage and asserts precisely one successful commit, one unique-key rejection, and one persisted event.
- Source-contract and frontend regression tests do not establish production readiness.

## Production release gate — all required

1. **Separate exact approval** for production SQL/grants/feature activation. Capture deployment window, authorized operator, production backup/restore feasibility, rollback owner, and change record; honor the WatchdogWorkspace 24-hour RPO/RTO and mandatory isolated recovery rehearsal.
2. **Read-only production inventory** using `sql/tests/cp-tl-pdf04-readonly-preflight.sql`, only after authorization to access the target; compare actual schema/function/grant definitions, migration history, existing approval rows, session and RLS capabilities. Never assume disposable schema matches production.
3. **Signed HTTPS tests with real nominated accounts**, including two independent approvers, wrong/wrong-stage account, expired/revoked session, workspace/nonmember, unconfirmed email, disabled role, stale revision, archived document, duplicate/concurrent signoff, and no access to other functions or document edits.
4. **Permission review** of `private.tl03_can_pdf_approve`: active signed session, current workspace, Board view and enabled module role are prerequisites; a matching email is necessary but must not grant unrelated capabilities. Cross-check central policy for real Finance, QC, Logistics, Sales Supervisor, Account Manager, and Management roles.
5. **Approved PDF template and issuer**: immutable template digest and PDF digest, current-revision row-lock verification, assigned signed events, template rendering, private Storage with idempotency, audit trail, verified issuance receipt, and protected retrieval. An `APPROVED` workflow state is not PDF evidence.
6. **Runtime UI integration**: only after the backend gate passes, activate the appropriate feature flag with server authorization and revision-bound stage receipts; render independent verified timestamps and errors; never create a local approval timestamp.
7. **Final business acceptance**: inspect the actual issued PDF, approval sequence, authorizing actor IDs, tamper resistance, audit recovery, and authorized/denied user experiences before release closure.

## Controlled deployment sequence (future authorization required)

- Preserve and verify recoverability; confirm read-only inventory and prerequisites. Stage on a protected nonproduction environment first.
- Apply reviewed migration with an explicit version/hash under the approved operator; check private table RLS, grants, function ownership/search path, exact board/workspace constraints, signatures, indices and audit triggers.
- Perform two-account signed HTTPS acceptance on isolated nonproduction; verify all denied paths and persistence across refresh/session changes.
- Production deployment only after separately authorized security approval, rollback drill, and change-window readiness. Keep electronic PDF issuance off while enabling stage testing.
- Activate PDF issuance **only** after approved template, issuer, storage and receipt verification; independently accept each document module.

## Emergency containment and rollback (future authorized operation)

- Disable frontend stage/issuer flags first. Disable/revoke `EXECUTE` on the two public PDF-stage RPCs for the authenticated role using a reviewed, authorized transaction; verify default/public grants are not accidentally effective. This blocks new approvals without destroying audit evidence.
- Keep the private append-only event table and historical records intact. Do **not** drop it to roll back a user-facing feature.
- Restore the prior reviewed function/grant versions only if supported by verified backups, existing dependencies and approved rollback scripts; verify signed denial and unrelated TradeLink functionality.
- Do not delete production documents, approval events, user accounts, roles, Storage files or workspaces during this rollback.

**Acceptance classification:** SQL candidate and disposable tests VERIFIED when CI passes; live signed HTTPS and production compatibility PENDING; production migration and electronic PDF issuance NOT ACTIVATED.
