# CP-CRM-NATIVE-04B3 — Finance Workflow Capability and Production QA Designation

**Date:** 2026-11-19 (Asia/Manila)
**Existing Supabase project:** `jtlusodorfnyzgyuewkz`
**Status:** Verified deployed finance capability and read-only role inventory. Production business transactions and genuine independent-session readback **BLOCKED pending explicit QA identity/record designation**.

## Verified correction to the previous prerequisite analysis

CP-CRM-NATIVE-04B2 inventoried zero active `FINANCE_MANAGER` and `FINANCE_APPROVER` **role labels** and treated the absence as an outstanding reviewer-role gate. **Those labels are not mandatory for the deployed finance approval workflow:** the existing production `public.frt_request_action(uuid,uuid,text,jsonb)` and `public.frt_restricted_request_detail(uuid,uuid)` contracts explicitly include `GENERAL_MANAGER` in approval, liquidation approval and closure eligibility. `GENERAL_MANAGER` alone is allowed to confirm transfer.

The deployed `public.frt_request_action` implementation was confirmed to reference the existing `FINANCE_APPROVER`, `FINANCE_MANAGER`, and `GENERAL_MANAGER` roles. The corresponding published migration and disposable domain contract were inspected. No policy or role relaxation is needed.

Run the non-mutating, counts-only capability audit:

```text
sql/tests/cp-crm-native04b3-finance-capability-readonly.sql
```

### Actual current production counts

| Effective domain capability                            | Eligible existing identities | Evidence                                                |
| ------------------------------------------------------ | ---------------------------: | ------------------------------------------------------- |
| FRT requester                                          |                            1 | Active FRT domain REQUESTOR                             |
| Finance approval                                       |                            2 | Existing General Managers satisfy approval predicate    |
| Liquidation approval                                   |                            2 | General Managers satisfy liquidation approval predicate |
| Closure                                                |                            2 | General Managers satisfy closure predicate              |
| Transfer confirmation                                  |                            2 | General Manager capability                              |
| Distinct requester → approver pairs                    |                            2 | Distinct active membership identities                   |
| Distinct approver → transfer actor pairs               |                            2 | Two separate General Managers                           |
| Distinct requester → approver → transfer workflow sets |                            2 | Three different existing identities                     |

These counts are **potential workflow actors**, not a record that they are QA-designated, consented, currently signed in or able to perform every action for a particular request state. Existing sessions in Auth are insufficient evidence of a genuine currently authorized browser acceptance flow.

### Genuine production signed-user preflight

The existing employee-signed Chromium runtime was reused without extracting session secrets. Read-only native application routes for TimeTracker, Fund Tracker, FuelTrack+ and TradeLink: **4/4 PASS**, zero observed Supabase HTTP errors and JavaScript errors. No transaction was submitted.

### Prior reusable isolated transaction baseline

- CP-CRM-NATIVE-04A: four isolated PostgreSQL domain lifecycle suites PASS.
- CP-CRM-NATIVE-04B1: separate synthetic database sessions, committed document readback, independently assigned reviewer read and foreign-workspace denial PASS.
- CP-CRM-NATIVE-04B2: full production role and QA eligibility read-only audit PASS.

## Remaining operational blockers

1. **QA identity designation:** No user has been explicitly designated as the attendance test employee, finance requester/reviewers, fuel requester/approver or TradeLink author/two independent reviewers. The existing historical FRT QA workspace has no active members; prior QA accounts cannot be presumed available. The operator must name/approve participating accounts and intended application roles. No automatic assignment of ordinary employees is permitted.
2. **Test transaction boundaries:** Specify a company/workspace, unique QA record prefix, accounting and audit treatment, approved attendance clock/GPS consent, no live bank transfer, no physical fuel dispensing, TradeLink document recipients/notifications and archive/retention plan.
3. **Genuine signed two-account acceptance:** Once approved, exercise real production domain transaction workflows with those identities and verify committed source, canonical Board projection, exact audit lineage and readback from a second independent real session. Preserve the original audit chain. No test mutation is authorized by this counts-only inventory.
4. **Completion evidence:** Only completed approved production transactions and genuine independent readback can close the original 04B3 production workflow certification. Disposable tests and static capability rules cannot substitute.

## Actions taken

- Added a read-only, counts-only effective FRT capability and independent-actor audit.
- Added tests verifying the deployed contract role predicates and no-write SQL.
- Added a CI workflow to prevent accidental write operations in this audit.
- Made **no** production Auth, account, role, RLS, schema, attendance, finance, fuel, TradeLink, or business-record mutation.

**Decision:** Finance role-label provisioning is **NOT REQUIRED** as a precondition given current deployed workflow semantics. Genuine production QA designation and acceptance transactions remain **BLOCKED**. Next bounded milestone: **CP-CRM-NATIVE-04B4 — Explicit QA Actor/Record Designation, Controlled Signed Transaction Execution, and Cross-Session Operational Closeout**, after bounded account and record approval.
