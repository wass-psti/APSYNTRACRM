# CP-MS-CRM-02 — Material Sourcing reconciliation contract

Scope: preserve the existing Material Request Hub (MRH) board and the imported standalone baseline; implement a tested read-only bridge contract and disposable pricing compatibility proof. This is not native runtime activation or an applied migration. Source audit: CRM commit ede61e51069644fb4b3890985230907d5a910b56. Live read-only catalog inspection 2026-11-27 confirmed the existing MRH tables and RPCs, six activated ordinary sourcing columns and original Main group, generic bulk exclusion, and absence of the standalone schema. No operational values are copied to GitHub.

## Canonical ownership and route

- Existing board `617c4c0f-e343-4b3b-8456-50d47dcbaf99` (Material Request Hub) and group `21566a87-b287-4a61-b521-bb233956e09e` (Main group) remain authoritative. Existing route `#/boards/:boardId/sourcing` is rendered by frontend/app.js with material-sourcing-tracker.js. Reuse CRM workspace ownership, session, context and existing signed access. No second board, request-domain rewrite or local API in production.
- Identity is work_board_items.id UUID, board_id, actual group_id and board workspace_id. The standalone text IDs and two group labels are not safe substitutes. Preserve old item/group IDs. Plan any new sourcing groups as additive, with explicit mapping and existing group preserved; current create/task/private viewer contracts bind Main group, so compatible changes need review/test before enabling relocation.
- Keep the eight existing domain columns Source Record ID, Source Revision, Sync State, Request Ref, Request Date, Quantity, Approval Status and Stock Ref intact. The source synchronization fields are not UI revision tokens. Retain MRH procurement request tables (requests, subitems, updates, attachments, activity) separately; never equate request IDs with board item UUIDs without a verified linkage.
- Keep public and protected read paths separate. Use existing readProtectedSourcingItem/authorizeMaterialSourcingViewer and existing task/write helpers. Reuse signed workspace and actor context; do not add gates or loosen existing checks. Treat public and protected availability as distinct from empty data. Existing signed board viewer commercial read is deployed by 20261111041157; do not treat the older candidate filename as the current state.

## Field map

| Standalone model field | Canonical CRM mapping | Compatibility |
|---|---|---|
| id, name | work_board_items.id, title | reuse UUID/title |
| group | group_id and actual work_board_groups.title | gap: two standalone labels; retain Main |
| created | created_at | preserve timestamp, derive display day |
| dbRevision | updated_at + per-cell expected value + private revision vector | not one interchangeable token |
| source | Source Type dropdown | Local/Import, missing/other remains unresolved/Unknown display only |
| description | Material description long_text | reuse |
| brand | Brand text | reuse |
| quantity | original Quantity number | legacy zero/null allowed; standalone requires positive |
| rfq | RFQ Ref No text | reuse, not Request Ref |
| requiredDate | Date required date | reuse, not Request Date |
| leadWeeks | Leadtime in Weeks number | preserve legacy values; current edit validation differs |
| buyingPrice, currency | Buying Price, Currency protected cells | reuse legacy values/revisions |
| shipping, shipCurrency | Shipping Cost, Shipping Cost Currency protected cells | reuse, absent is not zero |
| usd, eur | Ex. Rate USD, Ex. Rate EUR protected cells | legacy per-item values; no snapshot metadata |
| vendor | Vendor Details protected cell | reuse |
| account | Accounts protected cell | reuse |
| supplierPo | Supplier PO No. protected cell | reuse |
| requestor | Requestor protected cell | CRM UUID member, not standalone free text |
| savedCosts.php/shipPhp/landed/totalLanded/vatIn | server numeric derivations | gap: no current authoritative stored calculation contract |
| savedCosts.selling | new derived result separate from legacy Selling Price (VAT-EX) | preserve old manual value; reconcile discrepancies before cutover |
| decimalInputs, expectedFxId | exact decimal transport and immutable snapshot ID | gap: current legacy JSON numbers and separate revisions do not certify full precision |
| starred | actor-specific item preference | gap: no verified sourcing contract |
| tasks | private.mrh_board_item_tasks | reuse UUID/revision; extend statuses/order/deletion safely |
| activity | work_board_events and work_board_item_updates | preserve separate namespaces, flat comments/audit vs threaded history |
| archived state | work_board_items.archived_at | reuse identity, verify restore/readback |
| legacy_source, legacy_id, legacy_payload | external identity mapping/retained source payload | proposed explicit mapping, not inferred from part number |
| saved views, preferences | scoped CRM preference contract | identify compatible store later; no demo/local actor |

The pure adapter in reconcile.mjs uses the existing field catalog and approved public-column helper. It represents unavailable, absent, present and unsupported distinctly. It returns a transitional projection, NOT a standalone Material with invented defaults. Unloaded tasks/activity/stars remain null, costs unavailable, legacy selling separate. Foreign scopes, duplicate cells and column identity drift are rejected as data inconsistencies. It does not read from the network or grant authority. No secret or protected value is stored.

## Operation / gap decisions

| Existing contract | Reuse or gap |
|---|---|
| wm_get_board + board pagination | public projection; partial page cannot imply complete aggregates |
| mrh_sourcing_board_viewer_read(uuid,uuid) | existing signed per-item commercial read; avoid N+1 in eventual batch projection; maintain current server scope |
| mrh_create_material_atomic(uuid,text,jsonb,jsonb) | single item, 7 public + 5 private allowed, stable request receipt; existing Main group; extend only where full draft fields and FX atomicity require it |
| wm_set_board_cell_if_current / mrh_sourcing_sensitive_write | per-cell CAS; multi-field edit must be single transaction for full standalone parity, not client loop |
| wm_set_board_item_archived / wm_move_board_item | existing signed operations; verify scope/group compatibility and preserve ID; do not assume generic permissions permit MRH |
| wm_board_bulk_mutate | 1–50 status/archive/restore, explicitly excludes protected MRH board in live catalog. Do not use it or split a 5000-row transaction into chunks; dedicated MRH transaction with operation receipt and scoped revisions required |
| mrh_board_item_tasks_read/write | existing task UUID, positive bigint revision, not_started/working_on_it/done and 100-row read limit. Retain Not started, add Stuck only via compatible explicit extension; ordering/removal/operation retry not implemented by existing RPC |
| wm_add_board_item_update / wm_delete_board_item_update | existing flat bigint board-item updates; no verified edit/parent/mention/tombstone semantics. Preserve original text/author/time/ID; extend rather than convert bigint IDs through JS unsafe numbers |
| wm_list_board_events | existing latest-200 board audit window filtered to item by current UI; not complete history. Keep existing audit and add item-scoped pagination later |
| material_request_hub_bootstrap, api.context, api.allowed, verified user | existing access/session/workspace contract; no new roles or permissions |

Exact pricing candidate in pricing-contract.sql is temporary and test-only. It checks the existing standalone PostgreSQL calculation view for all 81 source/currency/boundary cases. Missing rates/inputs return no authoritative cost; explicit zero and Unknown-source null selling are distinct. Do not overwrite historical manual selling values or restamp materials. The eventual immutable FX snapshot should record rate, date, provider and provenance; existing per-item rates cannot be assigned an invented observation timestamp. Quote previews can use decimal.js; committed API values must be decimal strings, aggregated/exported without number truncation.

## Implementation sequence and compatibility gates

1. Native route/frontend: scoped rendering in current CRM shell, real board/group identity, explicit unavailable state and signed adapter; no demo fallback, localhost or source fixture in runtime. Preserve existing route and navigation, theme, responsive layout and permissions. Keep original source attestation frozen, not a permanent hash gate on evolved code.
2. Backend candidates: additive MRH-scoped transaction/read contracts where gaps exist, immutable FX reference, full pricing, bulk receipts, task state/order, thread metadata and paged item audit. Reuse existing tables/IDs rather than duplicate records. No production migration in this phase.
3. Data migration/reconciliation: inventory and preserve source IDs, field revisions, archived rows, relationships and historical pricing provenance; explicit identity/group mapping with unmatched/conflicting rows reported, no merge on part number. Compare before/after counts and hashes in disposable fixtures. No import of local demo data or local browser storage. Operational data movement separately authorized.
4. Drafts/preferences: use current signed actor/workspace, isolate on session change; preserve recovery without persisting protected commercial values to unapproved browser stores. Existing CRM access policy remains authoritative.
5. Certification: actual signed CRM browser matrix (allowed/denied existing permissions), CRUD with readback, stable exact pricing, full batch rollback/replay, collaboration and reports, unchanged legacy records and other apps. Production activation only after explicit migration/data approval.

## Acceptance and limits

Run the focused reconciliation tests, existing MRH frontend tests, disposable MRH SQL fixtures, standalone pricing compatibility and baseline regression in CI. Fixtures use fake auth settings only; do not claim genuine signed or deployed acceptance. The module is not yet wired to the CRM route, and no schema changes are deployed. Unknown field mappings or incompatible statuses must remain visible instead of silently defaulting.
