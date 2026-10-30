# CP-SB08 — Signed native Issue acceptance evidence

**Date:** October 30, 2026 (Philippines)
**Result:** ACCEPTED, supported APSYNTRA native Issue subset only
**Primary frontend:** https://wass-psti.github.io/APSYNTRACRM/#/acceptance
**Backend:** Supabase project `jtlusodorfnyzgyuewkz`, deployed function `apsyntra-native-issues` (ACTIVE, `verify_jwt=true`)

## Browser acceptance results

User-provided genuine signed-session result: **PASS 6/6**.

| Gate | Outcome | Evidence |
| --- | --- | --- |
| Existing authorized nonproduction board edit access | PASS | User-reported native QA |
| Server-native Issue create, independent read at revision 1 | PASS | User-reported native QA, PostgreSQL corroboration |
| Server-native title and `$inc` update at revision 2 | PASS | User-reported native QA, PostgreSQL revision corroboration |
| Mismatched actor rejected | PASS | User-reported signed API negative test |
| Cross-workspace mutation rejected | PASS | User-reported signed API negative test |
| Tombstone at revision 3 and exact actor-scoped audit | PASS | User-reported native QA, independent PostgreSQL evidence |

The previous signed direct-RPC Pages persistence test also returned **6/6 PASS** and is not repeated here.

## Independent database inspection

Read-only SQL inspection of `huly_rewrite.documents`, `huly_rewrite.transaction_events`, and the existing `APSYNTRA QA` board returned **three** QA documents, including one with the `APSYNTRA-NATIVE-QA-` title prefix. All three have:

- `revision = 3`, `deleted_at IS NOT NULL`;
- exactly three events ordered `create`, `update`, `remove`;
- exact event revision array `[1,2,3]`;
- one consistent actor matching the updated document actor.

No database writes were performed by this independent audit. The negative signed-user checks (actor forgery, cross-workspace denial) are supported by browser acceptance and were not independently replayed in SQL.

## Deployment and architecture

- The production Issue subset uses the existing signed Auth, Work Management board RPCs, forced RLS-backed data, and Supabase Edge runtime. No local `127.0.0.1:5173` process is needed for this accepted subset.
- GitHub `main` reference before this evidence commit: `8eba820dab9fefbec89d4f862e36bc87372d62c9`. Associated frontend CI and Pages deployment were successful.
- Internal API and storage identifiers are intentionally unchanged; user-facing branding is APSYNTRA CRM.

## Exclusions and deferred work

Full upstream transaction processor parity, websocket collaboration, attachments, unported Node-only services, role-revocation scenarios, and the 12 application boards are **not certified by SB08**. **12-board operational acceptance is deferred by explicit user direction.**

The accepted native Issue subset is a bounded, host-independent milestone, not a representation that all APSYNTRA CRM application development is complete.
