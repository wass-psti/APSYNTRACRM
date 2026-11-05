# CP-WS-02D — Workspace Invitation UI Reference and Implementation

## Scope and evidence

**Status: UI IMPLEMENTED, AUTOMATED VERIFICATION PASSED; PRIVATE INVITATION BACKEND VERIFIED IN DISPOSABLE PG17; LIVE SIGNED BROWSER ACCEPTANCE AND DELIVERY PENDING.**

The user provided three screenshots of a monday.com work-management invitation flow as *visual and interaction references*, not as proof of APSYNTRA CRM behavior. The reference shows a visible **Invite members** action, invitation email entry, optional custom message, and role picker with **Admin**, **Member**, and **Viewer**.

The APSYNTRA CRM implementation adopts those interaction patterns using its existing light-theme workspace shell and accessible modal infrastructure. It does not copy monday.com branding, app behavior, or third-party directory integrations.

## Implemented frontend

- `frontend/workspace-ui.js`: exports `renderWorkspaceInviteLaunch()`, `openWorkspaceInvitationDialog()`, `validateWorkspaceInvitationDraft()`, and the explicitly disabled `WS02_INVITATIONS_ENABLED=false` guard.
- Visible **Invite members** triggers appear in the signed **workspace sidebar**, **top bar**, and **workspace-switcher menu**. Their workspace names and labels derive from the current validated signed context, not arbitrary workspace input.
- Modal includes: current workspace name, 1–10 comma/semicolon/newline-separated recipient addresses, an optional message (up to 500 characters), role selection (Admin, Member, Viewer), context suggestions, keyboard Escape/Tab focus management, accessible labels and review feedback.
- The roles in this preview refer only to the target workspace. They never modify `public.profiles.platform_role`, grant platform administration, or assert that the current actor has invitation authority.
- **Send invites — pending activation** is disabled. The enabled review operation validates a transient draft and explicitly states **No invitations were sent**. No call to RPC, GoTrue invite, SMTP, browser storage, or membership mutation occurs.
- Modal closes through Escape, outside click, explicit close, sign-out, and session-expiry cleanup using existing `closeWorkspacePanels()`. The invited email addresses are not persisted by the UI.
- `frontend/workspace-ui.css` styles the responsive dialog and launch controls with focus, mobile and reduced-motion behavior; `frontend/app.js` connects actions without changing routing, login or board authorization.

## Role mapping and safety boundary

The deployed private workspace role contract currently supports `owner`, `member`, and `collaborator`; **Admin** and **Viewer** are approved *product/UI draft roles*, not implemented database entitlements. CP-WS-02D must establish an independently reviewed mapping or additive private role model, default permissions and denial tests before any invitation may be sent. **Owner is never available as an invitation role**; ownership transfer requires a distinct authenticated acceptance process.

Sending must be server-authorized against current signed GoTrue session, workspace membership, owner/delegated administrator permission, recipient verified-email binding, role ceiling, rate limit and audit. Tokens require hashing, expiry, one-time use and replay denial. Invitation creation must not automatically grant membership. Existing and new accounts require separate accepted-invitation flows; a new account still receives its own independent Main Workspace. No Google Workspace import/connector is implied by the screenshots.

## Automated verification evidence

- `frontend/tests/workspace-ui.test.mjs`: validates signed-context launch visibility, escaping untrusted workspace names, role allowlist, duplicate email rejection, invalid recipient rejection, 10-recipient cap, optional-message restrictions, no-send boundary and frontend wiring.
- [Workspace lifecycle PostgreSQL CI run #65](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41982420164): **SUCCESS**.
- [Frontend Validation CI run #857](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41982419802): **SUCCESS**.
- [GitHub Pages build/deployment run #1063](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41982418526): **SUCCESS**.

These checks establish that the UI code and deployment pipeline passed. They do **not** independently prove the modal's placement/appearance in a genuinely authenticated browser or that email invitations function.

## Private invitation backend progress — 2026-11-05

The [dormant server-side invitation contract](./CP-WS-02D-SERVER-INVITATIONS.md) has now passed [disposable PostgreSQL 17 CI #75](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41985272232). It covers owner-scoped issuance, hashed single-use tokens, confirmed-email recipient acceptance, atomic non-owner member creation, revocation, audit and signed-session/foreign-scope denials. No production function, email provider, client grant or permission activation has been installed. The original preview-only frontend and disabled send button remain unchanged.

## Next required acceptance (CP-WS-02D server stage)

1. Independently verify the new modal on GitHub Pages with a real signed user at desktop and mobile breakpoints; keyboard focus, screen-reader labels, role descriptions and no-send behavior.
2. Define/reconcile database role permission mapping for Admin/Member/Viewer without replacing existing `owner/member/collaborator` entries or elevating global `platform_role`.
3. Stage disposable SQL/contracts for invitation token lifecycle (pending, accepted, declined, expired, revoked), sender authority, recipient matching, idempotency and audit.
4. Verify role ceiling, unauthorized sender denial, foreign-workspace denial, revoked/expired session denial, duplicate email processing, replay prevention and concurrent acceptance.
5. Only then request the separate production schema/permissions/delivery approval and perform real invitation send and acceptance testing, without using real employee accounts or production email delivery as uncontrolled fixtures.

**No production Supabase schema, membership, permission, Auth setting, email provider, invitation record, or workspace record was changed by this UI implementation.**
