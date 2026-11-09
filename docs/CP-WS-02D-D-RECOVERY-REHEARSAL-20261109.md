# CP-WS-02D/D — Recovery Evidence and Production-Schema Reconciliation

**Date:** 2026-11-09. **Authoritative production project:** `jtlusodorfnyzgyuewkz` (WatchdogWorkspace). No second Supabase project was created and production records were not modified during this rehearsal.

## Real production snapshot and isolated recovery

- Supabase CLI 2.121.0 exported the current database schema for all 14 existing application/platform schemas. Initial core data export covered `public`, `private`, `auth`, and `storage`; a second export completed the populated ancillary schemas. The exports were written with restrictive filesystem permissions to the owner's local WatchdogWorkspace recovery directory, not committed to GitHub or shared with the chat.
- A temporary Docker PostgreSQL 17.11 container was started with `--network=none` and no published database port. Its separate `ws02d_fullrestore` database restored the full schema and both data exports successfully. Remote PostgreSQL remained unchanged.
- Verified restored record counts match live reads for: profiles 41, workspaces 4, workspace memberships 42, Auth users 42, private owner role records 2, and Storage object metadata 5. These counts are a point-in-time test, not a guarantee that production cannot change afterward.
- Supabase Storage CLI exported all five private `account-avatars` objects (114,010 bytes). A private bucket in an existing local-only Supabase test stack received the exports through the Storage API; downloading those objects again produced matching SHA-256 hashes and sizes for all five, including duplicate-content files.
- Temporary uploaded objects were deleted through the local Storage API; the empty test bucket remains in the local development stack because Supabase CLI v2.121.0 exposes no bucket-deletion subcommand and the DB explicitly rejects direct bucket deletion. No production bucket was added or modified.
- A completed provider physical database backup exists (listed at 2026-11-08 17:17 UTC), but **PITR is disabled**. Provider physical-backup isolation and production-region restoration were **not** rehearsed; database physical backups exclude Storage objects. Hosted production 24-hour RTO and ongoing Storage 24-hour RPO are **not certified** by a local logical restore or one-time object copy.

## Production-shaped WS02D release verification

- The seven private invitation schema/issuer/accept/revoke/decline/expiry/delivery-receipt candidate scripts installed successfully into the restored database, with both `enabled=false` and `advanced_roles_enabled=false` and no direct `authenticated` issuer EXECUTE grant. No existing memberships changed and no invitations were created.
- The core authorization ceiling and the first five domain-ceiling candidates installed successfully. The sixth originally failed because the specialized FuelTrack backup importer migration rewrote the function, while the remaining-domain candidate expected and overwrote its older original definition. This is an inter-migration composition defect, not a live production function drift: the current original production function MD5 was verified as `2dc777a252161222a3d2e316dd458eb6`.
- `scripts/ws02d-d-compose-production-ceilings.mjs` now generates the production-only final-domain migration, preserving the specialized hardened function and asserting its post-migration fingerprint `6c6767c6982e908b1bfe4e2464d976a8`. This corrected release candidate applied successfully to the restored production database. The disposable original-source candidate and its independent tests remain unchanged.
- The trusted delivery HTTP handler now passes the verified actor and session to `recordDeliveryOutcome` for each request. The regression suite covers concurrent requests and prevents cross-session delivery-audit attribution.

## Release classification and unresolved external prerequisites

**Verified:** isolated logical database restoration, private Storage API round-trip, additive WS02D migrations on the restored snapshot, read-only production inventory, negative/default-deny candidate behavior.

**Not verified:** physical provider-backup isolated restoration, Supabase-hosted recovery with full 24-hour RPO/RTO, approved sender credentials/domain, live trusted SQL issuer/recipient permissions, actual email delivery, signed production invitation lifecycle and revoked-session browser acceptance.

Do not equate this genuine **local logical recovery rehearsal** with a successful hosted physical-backup restore or claim production readiness. Until the user's non-waived recovery objectives and verified sender/provider prerequisites are met, the production Edge functions and browser invitation flags must remain fail-closed. No automatic background backup agent has been introduced.
