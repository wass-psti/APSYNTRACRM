# CP-BOARD-DELETE02 — Selection-aware permanent deletion

## Root cause

On the Contacts board screenshot, all **three** items are selected. Before this checkpoint, the selected-items toolbar created a disabled **Delete item** button unless `itemSelection.size===1`. Its handler also returned without feedback unless exactly one item was selected. This was the direct reason the displayed button was nonfunctional.

## Authoritative production contracts (read-only verified)

- `wm_delete_board_item(uuid)` exists, is executable by authenticated users and not anonymous users, enforces authoritative board `edit` permission, obtains a scoped board advisory lock and item lock, refuses file-backed records, writes `item.deleted` audit, and deletes the requested one item.
- This legacy function **has no server-side expected-revision CAS** and no atomic multi-item batch contract. A frontend fresh-row comparison narrows but cannot eliminate concurrent-edit TOCTOU risk. Do not claim an atomic multi-delete.
- A read-only inspection confirmed Contacts contains **3** items, **0** attached file rows at the inspection time. This checkpoint does not mutate them.

## Implemented behavior

1. **One selected item:** The toolbar enables **Delete item**. Confirmation requires typing the exact record title. The already available signed, role-checked, fresh-timestamp-checked `deleteOneAuthorizedItem` call runs only after confirmation and independently checks persisted absence and audit where available.
2. **Two or more selected items:** The toolbar becomes **Delete one of N…** and remains enabled on authorized ordinary boards. A modal presents a list of the exact selected records, including an ID fragment for disambiguating duplicate names. The user chooses **one** record and types its exact title. Changing the chosen record resets the confirmation input. The modal prominently states that only **one** item will be deleted, not the entire selection.
3. **Post-operation:** The board reload reconciles selected IDs against the authoritative remaining items. Remaining rows keep their selections so users can repeat the action intentionally. The code performs exactly **one** server deletion call and never silently loops through multiple production items.
4. **Safety:** A hardened `selectedDeleteCandidates` helper rejects archived, missing, cross-board, stale/invalid, or protected-board rows. The action revalidates board, workspace, signed user, original selection, confirmation title, server editing permission, original title and timestamp before the existing RPC. PostgreSQL retains its own mandatory checks. No production schema, roles, permissions, RLS, audit history or data are altered by the deployment.
5. **Scope:** The user-requested multi-selection experience is now functional for intentional **one-item-at-a-time** deletion. **Atomic delete-all-selected** is a separate feature requiring a designed, tested signed transactional CAS RPC and distinct production function/grant approval; it is not simulated with unsafe loops.

## Acceptance

- Automated tests: one- and three-selected action paths, changed selection rejection, different titles with unique IDs, archived/missing/foreign board denials, exact title confirmation, signed permission denial, stale timestamp denial, audited single-item RPC, no legacy multidelete loop, and selection persistence.
- Live browser: after refresh, select the three Contacts rows and verify **Delete one of 3…** opens and lists the three choices. Cancel first; no data changes. For destructive acceptance, use an explicitly authorized disposable ordinary-board QA record, never a production contact. Verify exact-title denial, success, audit event, refresh, and remaining selection. A denied board viewer must not acquire deletion capability.

**Status gate:** Frontend implementation and CI evidence are tracked against the final commit. Genuine signed browser mutation and CAS-concurrency tests are pending.
