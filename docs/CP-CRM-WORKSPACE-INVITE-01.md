# CP-CRM-WORKSPACE-INVITE-01 — Integrated disposable invitation lifecycle

## Established baseline

On 2026-11-20 a genuine signed Administrator browser confirmed that Workspace → Invite Members rendered successfully, while sending and manager refresh were disabled by existing feature flags. Live Supabase read-only inventory confirmed deployed `ws02d-invite` and `ws02d-accept` are immutable HTTP 503 placeholder routes, the `ws02d-manage` endpoint is absent, and private invitation schema/routines are not installed. Do not confuse a repository trusted-handler candidate with a deployed function.

## Completed implementation scope

The existing **CP-WS-01B disposable PostgreSQL 17** pipeline already installs the synthetic GoTrue/workspace base, WS02D invitation issue/accept/revoke, signed session and email-binding tests, provider receipts and expiry fixtures. The prior pipeline did not install the existing **WS11 manager wrapper** together with the newer **token-free delivery reconciliation ledger**, nor exercise their composed path to acceptance.

This checkpoint adds the two existing staged SQL files to **the isolated CI runner only**, then runs a combined transaction test proving:

- Signed synthetic owner issues a single Member invitation and receives one nonreplayable one-time token.
- One local workspace-specific pending invitation is visible to the scoped manager, while a trusted delivery status advances from `prepared` to `submitted` (provider-simulated, never real email).
- Same request ID is idempotent and exposes no second token; before acceptance the recipient has no membership.
- Distinct signed recipient with the matching confirmed email accepts once. A new membership appears **only** for the intended workspace, without switching the active workspace or granting any board access. Consumed tokens cannot be replayed.
- Manager then observes the accepted state, can revoke an independent pending invitation, and reads back `revoked`.
- Complete transaction rollback restores original synthetic membership counts, invitation, event and delivery rows and disabled feature flags.

The original SQL ACLs/RLS, module access assignments and frontend flags are unchanged; no new project, provider or dependency is introduced. This is an **isolated SQL integration test**, not an actual email-provider or signed real-user browser delivery test.

## Next acceptance boundary

To finish the requested genuine two-account staging verification, an **existing isolated staging environment** must have the signed private routines and trusted Edge handlers installed with their off-by-default feature flags, a verified email sender and two willing test users. The repository integration CI is necessary but not sufficient: perform genuine GoTrue signed send → provider accepted → recipient email → signed accept → membership, selector and URM readback, expiry/replay, wrong-workspace and denied tests without adding production permissions or changing production data. Provider API acceptance is not proof of inbox delivery. Retain production invite/accept/management flags disabled until this succeeds.

**If this gate is not met:** `CP-CRM-WORKSPACE-INVITE-01B — Trusted Edge Signed-Staging Transport, Verified Provider Delivery, and Two-Account Membership Acceptance`.
