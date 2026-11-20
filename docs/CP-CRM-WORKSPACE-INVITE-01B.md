# CP-CRM-WORKSPACE-INVITE-01B — Genuine two-account staging readiness and trusted Edge contract verification

**2026-11-20 verified outcome: BLOCKED on staging prerequisites, NOT a production activation.**

## Confirmed isolated staging inventory

Parent production project: `jtlusodorfnyzgyuewkz`. Existing nonproduction branch `apsyntra-invites-staging`, project ref `jeqwjlxubntsddeauvqa`, healthy. No new Supabase project is required.

Read-only inspection of the **staging database** returned: `auth.users=0`, `public.workspaces` ABSENT, `public.profiles` ABSENT, `public.workspace_members` ABSENT, `private.ws02d_invitations` ABSENT, `private.ws02d_issue` ABSENT, `private.ws02d_accept` ABSENT, `private.ws02d_invitation_delivery` ABSENT. Therefore it is not possible to certify two signed user accounts, invitation persistence, workspace membership or email delivery against this branch.

Staging Edge functions `ws02d-invite` and `ws02d-accept` are both present as version 2 and use `ws02d-inactive.mjs`, returning a controlled `503` without calling Auth, SQL or an email provider. The manager route `ws02d-manage` is ABSENT. A function marked `ACTIVE` by Supabase only means it is deployed, **not that the invitation lifecycle is enabled**.

The repository differs intentionally from deployed staging: `supabase/functions/ws02d-{invite,accept}/index.ts` contain the candidate trusted router `ws02d-trusted.ts` guarded by `APSYNTRA_INVITES_EDGE_ENABLED === 'true'`; it has not been deployed on this staging branch. A pair of old tests incorrectly asserted that the *repository* was already using the deployed dormant entrypoint; these are now corrected to explicitly test candidate behavior and the independent dormant-handler contract.

## Implemented scope

- `server/ws02d-staging-readiness.mjs`: deterministic credential-free gate verifying isolated branch, two actual verified users, existing workspace schema, private invitation SQL, delivery ledger, manager/invite/accept trusted Edge deployments, signed GoTrue session acceptance and provider/inbox delivery. It never enables production flags and treats unknown metadata as BLOCKED.
- `server/tests/ws02d-staging-readiness.test.mjs`: tests the observed staging shortfall, false positive cases, missing/invalid metadata and fully verified readiness without automatic production permission.
- `server/tests/ws02d-dormant-edge-handlers.test.mjs`: repairs two stale source assertions while retaining dormant 403/405/503, no-token and no-mutation negative tests.
- CI checks the full existing WS02D provider/HTTP/GoTrue/acceptance/client test suite and migration manifest.

**Isolated SQL lifecycle** was already merged in PR #646 and verifies issue, pending manager listing, provider-simulated `submitted`, matching synthetic signed recipient acceptance, revocation, replay denial and rollback in PostgreSQL 17. Existing real GoTrue isolated tests verify authentication independently; they are not proof of real email receipt or integrated staging membership acceptance.

## Next necessary execution gate

1. Reconstruct an isolated **staging** workspace/profile/membership baseline from reviewed schema migrations or synthetic fixtures (not production private user data), preserving existing contracts and auth triggers. Verify dependency ordering, RLS, and reversible rollback; do not apply 200+ historical migrations blindly.
2. Install the pre-existing private WS02D/WS11 issuance, acceptance, management and delivery-ledger candidate routines **only in staging**. Run the previously passing disposable SQL tests against an equivalent staged baseline before any live invitation.
3. Deploy the trusted Edge handlers in staging with JWT gateway validation and server-held database/provider credentials. Keep `APSYNTRA_INVITES_EDGE_ENABLED` and staging SQL invitation issuance flag OFF until deployment and negative-test acceptance are complete. Verify the provider credentials' existence without printing values, and use a verified staging sender and test inbox.
4. Establish two actual distinct **staging test users** through GoTrue with verified email ownership. Execute genuine signed owner invitation → provider submission → inbox receipt → signed recipient acceptance → workspace membership/selection/URM readback → refresh/re-authentication.
5. Prove failure modes: wrong recipient, unverified/expired/revoked sessions, cross-workspace issuance, duplicate requests, concurrency, expired/revoked token, token replay, uncertain provider outcome and no implicit board/module access.
6. Only after positive and denied real staging outcomes are verified, request a separate controlled production activation of its existing Edge routes, private schema and frontend flags, without changing unrelated authority policies.

## Classification

- Existing staging discovery: **VERIFIED**.
- Current staging readiness: **BLOCKED (1/10 prerequisites confirmed)**.
- Source-regression repair and negative-case tests: **IMPLEMENTED, to be CI verified**.
- Real two-account staging invitation, inbox delivery, membership acceptance and cross-session UI readback: **NOT EXECUTED** because zero Auth users, missing workspace/SQL foundation and dormant Edge routes.
- Production changes: **ZERO**.

**Next implementation if still blocked:** `CP-CRM-WORKSPACE-INVITE-01C — Isolated Staging Workspace Foundation, Trusted WS02D/WS11 Activation Prerequisites, and Genuine Signed Recipient Onboarding`.
