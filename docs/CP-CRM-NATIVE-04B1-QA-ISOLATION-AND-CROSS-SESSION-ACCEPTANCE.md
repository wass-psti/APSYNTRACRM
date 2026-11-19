# CP-CRM-NATIVE-04B1 — QA Identity Isolation and Signed Transaction Readback

**Date:** 2026-11-19 (Asia/Manila)
**Project:** Existing APSYNTRA CRM `jtlusodorfnyzgyuewkz`
**Scope:** Production eligibility, QA account/data isolation and cross-session persistence
**Disposition:** Disposable cross-session readback VERIFIED; production operational certification PENDING approved QA subjects and transaction boundaries

## Read-only production inventory

Preflight used existing Supabase project and verified live browser sessions; **no DML, DDL, Auth changes, grants, or credentials were written or read**.

- 41 CRM profiles; 40 active. There is no active profile clearly labeled QA, test, sandbox, fixture, demo or nonproduction by email/display-name screening. This is **not proof** that no authorized QA identity exists.
- 36 active profiles have enabled assignments to all four native applications.
- Existing `FRT-ACCEPTANCE-QA-v0.5.0` workspace is present but currently has **zero memberships** (including inactive), no associated Auth sessions through workspace membership, and no active users. Historical documentation describes four QA identities preserved in October; it is **not reliable current authority** for reactivation, credentials, session reuse, or permission changes. No account was provisioned or reactivated.
- Existing signed employee browser preflight for all four applications remains 4/4 PASS from CP-CRM-NATIVE-04B. That test does not create business transactions.
- Current live company/attendance/approval/notification data is genuine business data and **not** an automatically designated test fixture.

## Implemented reusable nonproduction acceptance

### Cross-session durable TradeLink round trip

```bash
bash scripts/cp-crm-native04b1-tradelink-cross-session-disposable.sh
```

The runner starts a single **network-isolated**, ephemeral PostgreSQL 17 container without exposing ports. It installs the existing production-shaped TradeLink SQL fixture and document-save migrations, then exercises these separate database connections:

1. **Connection A, synthetic manager session:** create a QA-labeled `for-approval` quotation via the exact `tl03_document_save` RPC and **COMMIT** it.
2. **Connection B, same manager identity / different stored session ID:** read the durable committed document with `tl03_document_read`, inspect `tl03_documents_page`, and verify Board item, revision and audit event parity.
3. **Connection C, separate assigned reviewer identity/session:** read the committed document via `tl03_document_read_assigned` without elevated board privileges.
4. **Connection D, independent foreign-workspace identity/session:** assert direct read denial.
5. **Fresh integrity connection:** verify exactly one persisted document and event, no unauthorized or duplicate approvals.

After verification, the container is destroyed. No production Supabase connection, service-role token, Auth GoTrue token, browser cookie, active employee session or external notification is used. These are **synthetic PostgreSQL auth claims in distinct database connections**, NOT production-issued signed browser sessions.

**Observed:** `CP_CRM_NATIVE04B1_CROSS_SESSION_DISPOSABLE_PASS`.

The earlier CP-CRM-NATIVE-04A suite remains the acceptance baseline for the four individual application write/Board/audit/denial lifecycles. This additional test specifically strengthens durable **cross-connection** TradeLink readback beyond a single transaction-local test.

### QA designation manifest (offline, no execution)

```bash
node scripts/cp-crm-native04b1-qa-manifest.mjs --manifest /path/to/private-qa-plan.json
```

The manifest is deliberately kept **outside the repository and CI artifacts**. It includes:

- Existing project and Work Management workspace UUIDs.
- Unique `QA-NATIVE04B1-...` run ID and record prefix.
- Nine **explicitly designated** account UUIDs for attendance, Finance request/review/GM, fuel request/review and TradeLink author/two independent reviewers. Reusing a real employee by assumption is not permitted.
- Separate actual QA designation and archive-policy references.
- Positive business boundaries for attendance times, no real bank transfer, no physical fuel dispensing, no unintended third-party notifications, clearly labeled documents and immutable audit preservation.
- `executionMode: "manual-approval-required"` and `productionWriteEnabled: false`.

The validator checks required fields, UUID shapes, role separation and business safeguards. It does **not** contact Supabase and cannot confirm that supplied IDs are genuine QA identities, actually have assigned roles or are approved for particular transactions. A complete plan returns `READY_FOR_INDEPENDENT_HUMAN_REVIEW`, **never** production-write authorization. Invalid or missing identities return `BLOCKED`.

Automated tests check complete/invalid plans, reviewer separation, workspace/project drift, fail-closed business boundaries, and non-execution without a manifest. The CI job validates these assertions and reruns the isolated cross-session test.

## Remaining production certification gates

| Gate                                                         | Status        | Required before execution                                                                                        |
| ------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Production deployment and four signed application reads      | VERIFIED      | Existing deployed session evidence                                                                               |
| Synthetic four-domain transaction lifecycles                 | VERIFIED      | CP-CRM-NATIVE-04A                                                                                                |
| Synthetic distinct-session durable TradeLink readback        | VERIFIED      | This milestone                                                                                                   |
| Explicit live QA account designation and identity validation | BLOCKED       | Named/approved pre-existing accounts or separately approved new accounts with no collateral impact               |
| Existing QA workspace activation                             | NOT PERFORMED | Separate approval for any membership/role/session change; never assume historical identities are still available |
| Production attendance write and signed source readback       | PENDING       | Approved test employee, genuine clock event/GPS consent and preserved audit                                      |
| Production FRT financial request/approval/liquidation        | PENDING       | Approved test company, financial accounting policy and distinct authorized actors; no actual bank transfer       |
| Production FuelTrack+ request/approval/closure               | PENDING       | Approved no-physical-refuel test and distinct actors                                                             |
| Production TradeLink two-account document review/PDF         | PENDING       | Approved test document with distinct authorized reviewer sessions and notification policy                        |
| Real production independent-session readback/replay          | PENDING       | Completed approved production test records and two genuine signed sessions                                       |
| Production final operational certification                   | BLOCKED       | All preceding gates and authoritative source/audit reconciliation                                                |

## Security and authority boundary

No new restrictions or application-role hierarchy changes were introduced. All existing authorization checks, RLS and workspace isolation remain unchanged. This QA manifest is a **test execution safety gate**, not a new application permission requirement.

Do not alter or delete actual attendance, real financial vouchers, physical fuel transactions, TradeLink documents or append-only audits to manufacture acceptance evidence. Record identifiers and approvals should remain private and available for audit. Favor isolated or approved reversible test data; archiving is preferred where lifecycle allows it.

## Next milestone

**CP-CRM-NATIVE-04B2 — Designated QA Account Verification, Approved Production Transaction Execution, and Genuine Two-Session Operational Closeout**

This becomes executable only after the designated QA accounts, test company/records, independent reviewers and bounded production write actions have been explicitly approved. If those prerequisites are not supplied, do not launch production writes and keep final certification **PENDING**.

**No production business-data, credential, role, membership, grant, or policy changes were performed under CP-CRM-NATIVE-04B1.**
