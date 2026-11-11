# BS05 — Email-bound board and application invitations (staged)

**Branch:** `feat/board-scoped-guest-invites-20261110`  
**Deployment:** NOT ACTIVE. No changes to main, Supabase Auth, live SQL, SMTP, workspace membership, role assignments, or Storage.

## Product behavior

The APSYNTRA **Share & access** panel now presents **Invite by email** instead of generating an open or forwardable invitation link. It shows a single recipient email field, **Viewer · Board only** (or an application label), and **Send invitation**, currently disabled by the backend readiness gate. Existing **People with access** opens the signed board-member interface. The separate BS01 local demo is retained in a collapsed developer section.

Long-term UX: a signed resource manager supplies one email → a trusted service checks the recipient/resource/role → stores a one-use, email-bound invitation → an authorized email provider delivers an acceptance URL → the recipient signs in or verifies an eligible account → a server transaction matches the authenticated verified email and creates **only** a precise board guest grant or approved application capability. No public invite, company workspace membership, or inherited employee/platform role.

A receipt that an invitation email was submitted does **not** prove it was delivered, accepted or that a permission grant exists.

## Existing schema reference (sanitized design)

Uploaded November 2026 schema establishes:
- `public.profiles` → `auth.users`, with `platform_role` default `employee`;
- `public.workspace_members` (workspace-level membership);
- `public.work_boards`, `public.work_board_members` with `owner/editor/viewer`;
- `public.module_role_assignments` with module-specific roles;
- independent module tables such as TimeTracker, Fund Released Tracker, Employee Evaluation and others.

**Never put external guests into `workspace_members` solely to make board viewing work.** Never treat application access as implicit full table, storage or module-RPC access. A guest account may have `profiles.platform_role='employee'` as a legacy default, but that string cannot be used as authorization for external users. Existing account bootstrap and registration triggers must be independently audited and secured before onboarding unregistered guests.

### Small additive backend model — proposed, not deployed

Choose a private schema owned by the approved backend:
1. `resource_sharing_policies`: exact `resource_kind` and `resource_id` (board UUID / validated application module identifier), default private, independent application review, revision and reviewer.
2. `resource_email_invitations`: UUID, unique request ID scoped to inviter/resource, normalized recipient email (protected), private random one-time token digest, expiry, viewer role (initial release), `pending/accepted/revoked/expired` state and audit. Do not expose token/email by unrestricted queries.
3. `resource_guest_grants`: verified `auth.users.id`, exact resource, effective permission, invitation link, revocation state and audit; never a workspace member.
4. `resource_access_events`: append-only, protected event log with minimal metadata.
5. Default-off activation flag per pilot resource. Guard against replay, concurrency, link forwarding, duplicate delivery, archived resources and privilege escalation.

The current BS01 **disposable-only link-based SQL prototypes are not the BS05 production migration**. Do not run or weaken their `workspace_disposable` guards. Before any same-project migration, author new additive SQL based on **live** RLS/trigger/RPC and Storage inventory, then get the IT partner's approval.

## Implemented source (staged)

- `frontend/resource-email-invitations.js`: strict single-email normalization, board/application target parsing, fixed viewer role, request-idempotency, signed transport and strict response validation; `RESOURCE_EMAIL_INVITES_ENABLED=false`.
- `frontend/board-share.js`: compact email-first preview, disabled Send invitation until safely authorized; no browser-side Supabase mutations.
- `frontend/board-share-clean.css`: accessible responsive styling.
- `server/bs05-resource-email-invite-boundary.mjs`: **unmounted** signed HTTP abstraction, exact-origin and JWT-gated, strict request shape, trusted adapter delegation and no automatic retries; `RESOURCE_EMAIL_INVITE_HTTP_ENABLED=false`.
- Tests in `frontend/tests/resource-email-invitations.test.mjs` and `server/tests/bs05-resource-email-invite-boundary.test.mjs`, plus existing board-sharing tests and CI.

The contract deliberately **does not** register users, email recipients, write rows or permit reads. These are required to make it production-functional; do not just change the flags to true.

## Unmet requirements before live activation

- [ ] Read-only export of deployed `pg_policies`, `pg_class.relrowsecurity`, table grants, Storage bucket policies and restricted views for board/application records.
- [ ] Definitions and owners/grants of board security/RPC functions: `work_board_access`, `wm_get_board`, `wm_list_boards`, `wm_auth_access_context`; review any `SECURITY DEFINER` functions and search paths.
- [ ] Account provisioning triggers, email-verification settings, `auth.users` onboarding behavior, legacy admin bootstrap and guest-only landing flow. No auto workspace or global role assignment.
- [ ] Per-module authorized capability matrix (TimeTracker clock-in/out and self-only records are not equivalent to viewer board rows; Employee Evaluation and Fund Released Tracker remain private).
- [ ] SMTP provider, mail templates, expiry, token hashing, rate limiting, bounce/duplicate delivery handling, anti-enumeration and abuse controls.
- [ ] Approved schema migration and rollback rehearsed against a **disposable** clone; same-project pilot permitted only after backup/restore capability verified.
- [ ] Trusted Edge Function/SQL transactional adapters for issue, accept, list and revoke, plus independent guest-only board/application read projections. Server checks email ownership after login, never accepts client-supplied actor IDs.
- [ ] Signed negative tests: foreign resource, unverified guest, private apps, forged scopes, expired/reused/revoked invites, auth session revocation, direct PostgREST, RLS/RPC, export, Storage and Realtime.
- [ ] Reconcile feature branch (behind rapidly changing main) with IT partner before merge. Preserve backward compatibility and no force pushes.

## Local UI test

1. GitHub Desktop: switch to `feat/board-scoped-guest-invites-20261110`, Fetch/Pull.
2. From project folder run `py -m http.server 8001 --bind 127.0.0.1 --directory "C:\Users\lucke\source\repos\APSYNTRACRM"`.
3. Open `http://127.0.0.1:8001`; sign in, open an existing board, choose **Share & access**.
4. Confirm **Invite by email**, email field, Board-only Viewer label, and disabled Send invitation; click **View people** to see existing signed members. No email will be delivered.

## Source compatibility constraints

Do not alter core Work Management RPC contracts, existing `work_board_members`, employee account assignment, `module_role_assignments`, live RLS, board column actions, form and input styling outside the scoped CSS, or the BS01 isolated lab. Email-bound guest application access must be reviewed module by module; no blanket module access.
