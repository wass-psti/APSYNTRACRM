# CP-CRM-WORKSPACE-INVITE-01C — Isolated staging workspace and trusted invitation backend

Date: 2026-11-20. **Live staging deployment VERIFIED; genuine signed invitation acceptance NOT VERIFIED.**

## Target and isolation

- Existing Supabase production parent: `jtlusodorfnyzgyuewkz` (left unchanged).
- Existing isolated development branch: `apsyntra-invites-staging`, project ref `jeqwjlxubntsddeauvqa`.
- Before activation: branch had zero `auth.users`, no `public.profiles`, `public.workspaces` or `public.workspace_members`, no WS02D private routines and deployed dormant 503 handlers.

## Executed staging database changes

1. Applied reviewed isolated staging-only `sql/staging/cp-crm-workspace-invite-01c-foundation.sql` transaction: minimal established profile/workspace/membership structure from disposable baseline, composite `(workspace_id,user_id)` membership primary key, FK to real Auth users, native workspace resolver and signed-session guard. Three public tables have RLS enabled and no `anon`/`authenticated` table grants. No seeded test users and no production data cloned.
2. Installed the **existing** candidate files in their dependent order, without editing the source or granting direct browser access:
   - `sql/cp-ws01b-lifecycle-contract-candidate.sql`
   - `sql/cp-ws01c-b3-create-contract-candidate.sql` (creation remains OFF)
   - `sql/cp-ws02d-invitation-schema-candidate.sql`
   - `sql/cp-ws02d-invitation-issue-candidate.sql`
   - `sql/cp-ws02d-invitation-accept-candidate.sql`
   - `sql/cp-ws02d-invitation-revoke-candidate.sql`
   - `sql/ws11-invitation-management-CANDIDATE-NOT-APPLIED.sql`
   - `sql/ws02d-invitation-delivery-ledger-STAGING-CANDIDATE.sql`
3. Readback: workspace tables, signed session guard, private issue/accept, manager list and delivery ledger all present. `private.ws02d_invitation_flags.enabled=false`, advanced roles false; workspace creation/selection flags false; zero Auth users, workspace memberships, invitations or delivery records; direct authenticated role has no EXECUTE access to invite/accept/manager private functions.

## Executed staging Edge changes

Deployed the already-reviewed repository trusted handler `supabase/functions/_shared/ws02d-trusted.ts` (pinned `npm:postgres@3.4.5`) through the existing staging-only function definitions:

- `ws02d-invite`: v3, `verify_jwt=true`
- `ws02d-accept`: v3, `verify_jwt=true`
- `ws02d-manage`: v1, `verify_jwt=true`

Each deployment preserved the explicit `APSYNTRA_INVITES_EDGE_ENABLED` default-off gate and verified GoTrue user/session before private SQL; the browser never receives a service-role credential or issuance token. Real HTTPS POST requests without bearer tokens returned **401 for all three staging functions**. No provider email was sent.

Do not interpret status `ACTIVE` as successful live invitation or email delivery. The SQL invitation feature flag is also OFF.

## Verification and remaining blockers

- Existing isolated PostgreSQL 17 invitation issue → manager pending → mock delivery submitted → synthetic signed recipient acceptance → membership → revoke → rollback passed in PR #646.
- Staging schema/source, JWT gateway anonymous denial and current no-write default-off state verified in this checkpoint.
- **Not performed:** creation of genuine staging verified test users, actual external provider email, recipient inbox receipt, signed accept, workspace selector/UI membership readback and reauthentication. The branch still has zero Auth users and membership rows. Nothing is certified by synthetic SQL results alone.
- **Production impact:** no changes to production SQL, production Edge functions, production invitations, roles, memberships or feature flags.

## Remaining execution gate

Use the existing isolated branch and an explicitly approved test email sender and inbox. Establish two independent staging GoTrue accounts with confirmed email, provision their real staging profiles and personal workspace memberships using existing registration rules, configure staging-only server-held sender credentials, validate signed negative cases, then enable **staging-only** Edge/SQL gates for a controlled send → provider accepted → actual delivered → signed recipient acceptance → cross-session workspace/URM readback. Verify duplicates, expiry, revocation, concurrency and restored state. Preserve production OFF until signed acceptance has been recorded.

**Next milestone if the genuine staging users/sender remain unavailable:** `CP-CRM-WORKSPACE-INVITE-01D — Two Verified Staging Test Identities, Controlled Provider Delivery, Signed Recipient Acceptance, and Cross-Session Membership Closeout`.
