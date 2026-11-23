# CP-FT-UI-03 — Station Contract Verification and Signed-Session Read Acceptance

## Objectives and verified baseline (2026-11-23)

The 19 user-provided FuelTrans Support Portal screenshots are design references. They are not an authoritative station database, credential source, or proof that those tickets exist in APSYNTRA CRM.

Read-only inspection of the existing **APSYNTRACRM** Supabase project `jtlusodorfnyzgyuewkz` identified the FuelTrans tickets/memberships/sessions/notifications/audit/events/user-state/IT-issue tables and existing ticket administration RPCs. It found **no authoritative station registry table, station manager RPC, station deployment contract or remote-access credential store**. The connected FuelTrans tickets table has one row in the Work Management workspace overall and one row with a station ID. The genuine signed-in native dashboard displayed zero accessible tickets; these observations do not prove the row is accessible to that user or that any external screenshot dataset has been migrated.

The CRM module manifest maps native FuelTrans to the **FuelTrans Standalone** board. The separately named **FuelTrans Support Portal** board is a conventional CRM board and is not currently the native application's host. No alias, record migration or cross-board data merge was introduced.

## Delivered

- **Recorded Stations** sidebar route inside the existing native FuelTrans application.
- Server-side workspace/client-scoped ticket-derived station filtering, with an optional station ID search.
- Read-only, minimally projected PostgREST fields: `id`, `workspace_id`, `client_code`, `ticket_number`, `status`, `updated_at`, `station_id:payload->>stationId`, and `station_name:payload->>stationName`. Entire ticket payloads and remote credentials are never requested by this view.
- Pagination using 50 visible tickets plus one lookahead row. No global `count=exact`, continuous polling, or inferred totals. Deduplication is **page-scoped**, never represented as a complete station count.
- Station cards show client, station name and ID, latest ticket reference/status/update, and number of source tickets on the visible page. All values are based on accessible source records, not fabricated.
- Explicit notice: **ticket history is not an authoritative station directory**, may be incomplete/outdated, and does not verify deployment or remote-access credentials.
- Scoped stylesheet and six unit tests; browser fixture extends CP-FT-UI-02 to exercise the new route, empty results, client search and responsive layouts.
- Preserved existing CRM authentication, memberships, RLS, ticket lifecycle, source wizard and previous UI design. No database schema, role, permission, or production record changes.

## Acceptance evidence

### Implemented and verifiable

- Unit tests enforce workspace/client matching, bounded output, sanitized server filter inputs, deduplication, minimum fields, and no invented names.
- Synthetic signed-user browser fixture verifies dashboard, creation wizard navigation without submission, ticket list, ticket details, L1, handover, reports, issue severity, and station-history browsing/search/empty state at 1200 / 768 / 540px.
- The browser fixture disables all server mutations and uses entirely synthetic test records.
- Verified from a clean `npm ci` installation: `npm test` **3,419/3,419 PASS**; `npm run build`, `npm run check`, `npm run lint`, targeted ESLint, syntax and `git diff --check` **PASS**. Synthetic Chromium acceptance **PASS** at 1200/768/540 with no page errors.
- Real Chromium signed-in read-only browser acceptance established that the **FuelTrans Standalone** host and its Dashboard, Create Ticket, Reports, Ticket Queue, Report Issue, L1, L2 and Shift Handover routes are reachable. No production mutation was attempted.
- A public/anonymous REST probe returned HTTP 401 (existing privilege denial), consistent with the established API boundary. No attempt to bypass it.

### Pending and deliberately not inferred

- A 48-station authoritative source, hardware/deployment records, AnyDesk/BOS/POS credentials, and trusted original ticket migration were not supplied or discovered; the screenshot's counts and credentials are not imported.
- Cross-account and create → claim → escalate → resolve persistence acceptance cannot be called verified without disposable nonproduction data and genuine independent user sessions. No production tickets were created just for testing.
- Exact parity with all 19 reference screens cannot be certified when the original station registry, personnel roster, and ticket dataset are absent.
- Live signed-in acceptance of the **newly deployed** Recorded Stations route must be performed *after* GitHub Pages deployment.

## Next necessary scoped checkpoint if acceptance remains open

**CP-FT-UI-04 — Authoritative Station Registry Source Reconciliation, Nonproduction Workflow Acceptance, and Final Reference Parity.** Identify a trusted, owner-approved station export/API or equivalent record source, reconcile client/station IDs and approved non-secret deployment metadata, design a compatible workspace-bound import contract, and implement only the necessary server-backed registry. Keep remote-access secrets out of generic ticket payloads and do not weaken existing access boundaries. Validate with two genuine accounts and disposable nonproduction ticket records, then complete all 19 visual references and reliable persistence readback. If the authoritative source remains unavailable, stop short of inventing an inventory.

No gradient descent, backpropagation, training/retraining/fine-tuning, model-weight updates, or training dependencies were added.
