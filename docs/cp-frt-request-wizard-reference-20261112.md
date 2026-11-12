# CP-FRT-REQUEST-WIZARD-01 — Reference-aligned three-step Fund Request form

Date: November 12, 2026. Scope: the existing APSYNTRA CRM Fund Release Tracker **New Fund Request** frontend only.

## Annotated reference

Six user-supplied screenshots show a centered ~610px modal with bright blue top accent, fixed header and footer, scrollable pale-blue content, three progress indicators, and these step layouts:

1. **Basic Info:** company account, date needed, fund-source account, multiple expense categories with amount in PHP, Add Category, optional check number.
2. **Recipient:** payee/supplier, saved-account selector, account holder, bank, account number and optional QR attachment.
3. **Details:** department, expense description, optional project/order number and check number, optional on-behalf-of, and Submit Request.

## Implemented behavior

- New FRT form now renders as a three-step modal with Back / Continue / Submit, fixed footer, visually distinct completed/current stages, one scrollable body, and a responsive one-column layout on mobile.
- Wizard retains entered values between steps, uses standard constraint validation before continuing, supports adding and removing expense rows, and prevents invalid/missing expense amounts. One bounded, signed request creation occurs only on the final submit. No automatic retry on an uncertain financial write.
- Authorized company options originate from the existing signed FRT company list. The user's selected company is included in `createSignedFRTRequest`'s membership-scoped backend call; changes to the CRM route/session/company during editing still invalidate the submission.
- The existing `frt_create_request(uuid,jsonb)` production contract was verified read-only to accept a JSON array of expense categories and amounts, `recipientName`, `recipientBank`, `recipientAccount`, `checkNo`, and `orderIntakeNo`. These values now reach the existing signed request creation RPC with no schema/RLS/role changes. Description, department, fund source, title and date retain existing validations.
- The current backend does **not** expose signed saved-account lookup, a separate account-holder name field, QR binary upload, or proxy/on-behalf-of storage. Those reference controls remain visibly disabled, with explanatory text; no private data is collected under a false saving promise.
- FRT filing status continues to be `NOT_FILED` on creation; the signed filing CAS workflow, refresh, finance table, and existing approvals remain unchanged.

## Acceptance evidence

- Focused static and signed-RPC tests check authorized company selection, HTML escaping, all three steps, multiple categories, optional backend-supported fields, and invalid input rejection.
- Isolated real Chromium UI interaction runs without backend secrets, validating first-step blocking, Add Category, two expense rows, Back/Continue with preserved values, recipient data, final submit payload, desktop modal 610x578 and mobile 372px single-column presentation.
- Full existing frontend regression, CSS bundle fidelity, Chromium startup/privacy and dropdown layering are unchanged and must pass before merge.
- **No production fund request is submitted** solely to test the design; voucher sequences and audits remain unaffected.

No new authority, administrative controls, permission restrictions, database schema, background monitors, or project dependencies are introduced.
