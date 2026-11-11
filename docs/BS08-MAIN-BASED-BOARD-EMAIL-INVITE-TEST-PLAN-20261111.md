# BS08 — Main-based exact-email board invitation integration

**Date:** 2026-11-11  
**Source branch:** current `main` when this work began  
**Integration branch:** `feat/bs08-email-invites-main-20261111`  
**Deployment state:** UI and contracts only — actual Supabase email invitations **NOT ACTIVE**.

## What was ported from the prior demonstration branch

- Board toolbar **Share & access** opens a compact email-first panel.
- **People** opens the existing board-signed, verified member list with circular initials/photo avatars and hover/focus names.
- Email field and **Viewer · Board only** label; **Send invitation** is disabled.
- No public copy-link issuance, public board, new workspace member, application grant, authentication setting change, schema migration, SMTP call or production database mutation.
- Frontend contracts are staged in `frontend/resource-email-invitations.js`. Do not enable its transport flag until the deployed Edge Function, verified onboarding and guest reads all pass independently.
- Existing invitation-development branch and its local BS01 simulator remain separate. Do **not** merge or rebase its 77 commits blindly onto main.

## User-visible tests available now

1. Switch GitHub Desktop to `feat/bs08-email-invites-main-20261111` and pull. Serve the project folder on `127.0.0.1:8001` using Python.
2. Sign in with an **existing** approved APSYNTRA employee test account. Open a non-sensitive QA board.
3. Open **Share & access**: verify the board title, single-email field, fixed Viewer scope, disabled Send Invitation and explicit explanation.
4. Open **View people**: verify only signed direct board members appear, one hover tooltip, keyboard focus and optional authenticated avatar loading.
5. Confirm board items/activity and existing login still work.
6. **Do not** enter genuine client addresses expecting delivery. No email is sent or guest rights changed.

## Next SAFE test: production metadata inventory (zero writes)

In Supabase SQL Editor on the authorized APSYNTRA project, run:
`sql/tests/bs08-email-board-invite-readiness-readonly.sql`

The query returns only:
- Public table existence, RLS flags, number of policies, basic role grants;
- Function *names/presence* (no source);
- Whether known legacy signup and membership triggers are enabled.

It does **not** return personal records, emails, UUIDs, tokens, policy definitions, or function bodies. It cannot certify authorization correctness. Review the result against company disclosure policy before sharing. If the table/policy/trigger inventory differs from expected, stop and review with the IT partner.

## Hard blockers for real external invites

1. **Unsafe legacy signup triggers.** The main source documents `public.handle_new_user` and `public.ensure_default_workspace_membership` automatically admitting/registering users with workspace privileges. `REGISTRATION_ADMISSION_ENABLED=false` protects the frontend but not a direct Auth admin call. Never call `supabase.auth.admin.inviteUserByEmail()` for new clients on this project until the deployed triggers are independently hardened and admission verified. Existing employee accounts must not be mutated.
2. **Backend guest-only scope.** Current `wm_get_board`, `wm_list_boards` and `work_board_access` assume workspace membership and may reveal/authorize unrelated resources. Guest-only users require a purpose-built authenticated exact-resource landing, server read projection, RLS/RPC/Storage/export/realtime deny checks, plus live revocation.
3. **Email delivery.** A trusted server must hold Supabase secret credentials. Supabase's built-in SMTP limits external recipients and is unsuitable for real client onboarding; configure an approved custom SMTP or Email Hook, verified redirect allowlist, rate limits and provider credentials securely.
4. **New private tables and transactional APIs.** Require email-bound one-use invitation, audit, expiration, idempotency, single exact-board Viewer grant, revocation and server-enforced absence of workspace membership. Module/application invitations require their own operations policy, not an unrestricted board Viewer role.
5. **Deploy & rollback.** Obtain current live function/RLS/trigger source from the IT partner, inspect recent migrations, preserve backups and run negative tests on disposable copy. Only then apply additive reviewed changes to the existing project with a default-OFF per-board pilot. No direct edits to `main`.

## Proposed actual end-to-end test (after hardening and approval)

- Create fictional **QA Board A** (guest eligible) and **QA Board B** (private); ensure HR/Finance/TimeTracker remain private.
- Prepare a **verified external test account** with **no** `workspace_members` row. Do not create this user with the currently unsafe signup triggers.
- Manager invites `recipient@example.test` specifically to QA Board A. Server binds one-use invite to that exact verified address. Test wrong-email and forwarded-link denial.
- External guest signs in from a second browser profile and accepts. Confirm Board A read-only; Board B/private modules/other users/files denied by *direct API requests*, not just hidden navigation.
- Revoke grant. Next server request and stale-session request are denied. Verify email, grant, audit and rollback status with sanitized test output.
- Run employee login/board edit/role/settings/regression suite again. Enable no other boards until full acceptance.

**Important:** A local frontend at `127.0.0.1:8001` still calls the configured Supabase backend. Never equate local hosting with database isolation. The old `127.0.0.1:8765` BS01 lab remains a separate simulated test and is not proof of server authorization.
