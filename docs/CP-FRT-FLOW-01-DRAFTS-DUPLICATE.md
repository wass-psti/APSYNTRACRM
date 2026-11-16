# CP-FRT-FLOW-01 — Request Draft Recovery and Duplicate Submission Warning

## Scope

Implement the first operational parity increment from the supplied Fund Release Tracker workflow in the existing APSYNTRA CRM FRT request wizard.

- Automatically save a local draft 10 seconds after the latest form change.
- Retain the draft for 24 hours after its latest successful save.
- Restore the selected company, request fields, expense lines, and wizard step when New Fund Request is reopened in the same browser profile and workspace.
- Detect a recent same-company, same-payee, same-total submission made by the same signed-in user in the same browser profile within 10 minutes.
- Show a potential-duplicate warning and require a second submit action to continue. The operator may proceed; this is a warning, not a new permission or lifecycle gate.
- Clear the local draft only after \`createSignedFRTRequest\` has returned a verified saved result.

## Local draft data contract

The draft is keyed by workspace ID and signed user ID in the current browser's local storage. It includes request classification, date, fund-source label, check/reference fields, request description, payee/bank names, expense categories and amounts, and the current wizard step.

It deliberately excludes bank account numbers, account-holder names, saved-recipient identifiers, and QR/file bytes. Those fields must be re-entered or selected when the draft is reopened. No draft data is sent to Supabase and no database or API contract is introduced.

The draft is schema-versioned and expires 24 hours after the most recent successful save. Invalid or expired entries are discarded. Storage errors do not block request creation.

## Duplicate-warning contract

The browser stores only bounded, non-reversible fingerprints and submission timestamps; it does not retain raw payee names or account information in the duplicate history. The fingerprint is a local deduplication key, not a cryptographic security control.

The warning compares company, normalized payee name, and exact decimal total. It covers the current browser profile and signed user/workspace only. It is not a global or cross-device duplicate check. A confirmed operator submission continues through the existing one-shot \`frt_create_request\` workflow and its authoritative readback.

## Preserved behavior and exclusions

- Existing signed session, workspace, company, membership, and request-creation checks are unchanged.
- Existing \`frt_create_request\` and \`frt_board_list_safe\` contracts are reused without changes.
- Existing voucher allocation, approval, GM verification, bank execution, liquidation, audit and Board behavior are unchanged.
- No new roles, permissions, RLS policies, grants, RPCs, migrations, database tables, production financial writes, telemetry, or background processes.
- No retry is added to ambiguous financial creation outcomes.

## Verification

Focused tests cover 24-hour expiry, malformed storage, sensitive-field exclusion, company-scoped restoration, multiple expense-line recovery, exact decimal duplicate matching, 10-minute expiry, user/workspace separation, and app wiring.

Full frontend regression, JavaScript syntax, and production browser acceptance remain required before merge. This increment does not claim cross-device draft synchronization or system-wide duplicate detection.
