# CP01 — Workspace Identity and Ownership Foundation

- **Checkpoint:** CP01 — Workspace Identity and Ownership Foundation
- **Repository baseline:** `f9c00e1a2287518916e17dca9f1af0c8df8e7f75`
- **Working branch:** `cp01-workspace-identity-ownership`
- **Production database:** existing `APSYNTRACRM` project `jtlusodorfnyzgyuewkz`
- **Database inspection:** read-only, 2026-11-23

## Objective

Create one canonical application-to-workspace ownership definition that later workspace-aware navigation and environment initialization can consume. Reuse the existing workspace and personal-workspace records. Do not create a second workspace registry, role model, database, or authentication provider.

## Canonical identity rules

- Work Management is identified only by UUID `00000000-0000-4000-8000-000000000001`.
- A user's Main Workspace is identified only by that user's row in `private.ws02_personal_workspaces`. A workspace name such as `Main Workspace` is not proof of personal ownership.
- Any other valid workspace UUID is classified as `other` until a trusted personal-workspace mapping is supplied.
- New or unclassified workspaces do not inherit application ownership from their display name, owner label, board name, or browser preference.
- All twelve canonical board applications and the three additional CRM sidebar applications are owned by Work Management.
- Board and domain records retain their existing workspace/board associations. This checkpoint does not move or clone records.

## Live production read-only inventory

The existing Supabase project was selected by its `APSYNTRACRM` project name and verified as `ACTIVE_HEALTHY` on PostgreSQL 17.6. No project was created.

| Inventory                                            |    Observed result |
| ---------------------------------------------------- | -----------------: |
| Workspace rows                                       |                  7 |
| Workspace membership rows                            |                 47 |
| Personal Main Workspace mappings                     |                  3 |
| Work Management active members                       |                 42 |
| Work Management boards                               |                370 |
| Canonical application board markers                  | 12, one per module |
| Canonical application boards outside Work Management |                  0 |

Four rows are named `Main Workspace`. Three have a corresponding `private.ws02_personal_workspaces` mapping, active membership, and `owner` relation. One named `Main Workspace` row has one active member with an `owner` relation but no personal-workspace mapping. It is therefore **unclassified**, not automatically adopted as a personal Main Workspace. This may be a legacy personal workspace. A separate aggregate check found that its owner has no other personal-workspace mapping and no second `Main Workspace`-named workspace, but the missing mapping still cannot be inferred safely or written without explicit production-data approval. No membership or workspace record was changed.

The remaining non-Work-Management workspace rows include a zero-member FRT acceptance workspace and a one-member `Watchdog Automation OPC` workspace. Neither has canonical application boards. No assumptions are made from these names.

## Existing schema contracts

- `public.workspaces`: `id`, `name`, `created_at`. It has no explicit workspace type or owner column.
- `public.workspace_members`: `workspace_id`, `user_id`, `active`, `created_at`.
- `private.ws01_member_roles`: `workspace_id`, `user_id`, `relation`, `created_at`.
- `private.ws02_personal_workspaces`: `user_id`, `workspace_id`, `provisioned_at`; its primary key is the user and workspace ID is unique.
- `public.work_boards.workspace_id` is non-null. Child board resources such as items, groups, columns, updates, files and events are associated through `board_id`.
- Application domain tables commonly carry `workspace_id` directly.

The current production personal-workspace mapping table is authoritative for personal Main Workspace identity. This checkpoint deliberately does not add a new `workspace_type` column or infer missing mappings from names.

## Application ownership manifest

`frontend/workspace-application-ownership.js` is the canonical source for:

- Twelve existing `BOARD_MODULES` keys and their canonical board UUIDs.
- The Work Management workspace owner UUID for each board application.
- Existing sidebar labels and route kinds (native route versus board route).
- Three auxiliary CRM navigation entries: FM1 Ticketing, Paseo de Lomboy and TalkBox. TalkBox retains its existing dependency on the Toolbox Issues board being present.
- Workspace-scoped application lookup. It returns the 15 registered applications for Work Management and an empty list for any other workspace.

All twelve board IDs were checked against the live database on 2026-11-23. Each exact ID returned its expected board name, module marker and Work Management workspace UUID. The twelve module-marker groups also returned exactly one board per module, all in Work Management.

`frontend/workspace-identity.js` owns the canonical Work Management UUID and resolves Main Workspace only when an authoritative personal workspace UUID is supplied. The manifest preserves the current sidebar order and TalkBox’s dependency on the Toolbox Issues board. It is ownership metadata, not an authorization or role system.

The four existing native application contexts now explicitly require their canonical Work Management workspace as well as their canonical board ID. This is a functional ownership invariant: it prevents a fixed Work Management application board from being treated as a personal or newly created workspace application. It does not change role grants, membership, RLS or backend authorization.

## Data association findings carried forward

The read-only schema inventory confirms multiple association patterns:

1. Workspace-owned domain tables carry `workspace_id` directly.
2. Board children use `board_id` and inherit their workspace through the parent `public.work_boards` row.
3. Some supporting records use `board_id` without a redundant `workspace_id`, including `private.mrh_material_create_requests`.
4. `public.module_role_assignments` has no `workspace_id`; the separate `public.apsyntra_workspace_module_roles` table does. These are distinct contracts and must not be conflated.
5. `storage.objects` has no `workspace_id` column. Storage bucket/path/metadata ownership must be audited separately before any storage cutover.

These are follow-up inventory items for CP04. No role or authorization model, storage policy, or table schema is changed in CP01.

## Files changed

- `frontend/workspace-identity.js` — canonical workspace identity helpers.
- `frontend/workspace-application-ownership.js` — twelve board application and three auxiliary application ownership manifest.
- `frontend/native-application-access.js` — native application board IDs now come from the manifest and are bound to Work Management.
- `frontend/board/acceptance/security-targets.js` — derives canonical acceptance targets from the manifest.
- Existing board-ID consumers now import canonical IDs rather than repeating literals: app shell, FuelTrack+, Fund Released Tracker, TradeLink, TimeTracker, Material Request Hub, TimeTracker group presentation and related acceptance probes.
- `frontend/tests/workspace-identity.test.mjs` — identity classification tests.
- `frontend/tests/workspace-application-ownership.test.mjs` — manifest completeness, ownership and canonical-ID tests.
- `frontend/tests/native-application-access.test.mjs` — native context ownership regression coverage.
- `sql/tests/cp01-workspace-identity-readonly-audit.sql` — repeatable read-only production inventory queries.

## Explicitly unchanged

- No Supabase migration or production DDL.
- No workspace, membership, role or personal-workspace mapping mutation.
- No existing board or domain record move, clone, delete or reassignment.
- No authentication, RLS, Storage policy, role or permission changes.
- No change to the existing Work Management business data.
- No gradient descent, backpropagation, model training, retraining, fine-tuning or parameter-update mechanism.

## Acceptance evidence

- Canonical manifest contains exactly twelve unique board modules and three auxiliary CRM application routes.
- All 12 canonical board IDs match live production board names, module markers and Work Management workspace ID.
- The four native application contexts are bound to Work Management and reject a matching board payload relabeled into another workspace.
- Main Workspace is not inferred from its name; the unmatched legacy row remains unclassified.
- Focused JavaScript tests and repository-wide checks are required before CP01 can be marked complete.

## Next move

After CP01 passes, proceed to **CP02 — Workspace-Aware Sidebar and Application Route Isolation**. Consume this manifest to render the 15 Work Management application entries only when the active workspace is Work Management. Keep Overview, My Boards, workspace switching and account-level navigation available in every workspace. Guard direct application routes and clear stale application state when the active workspace changes. Do not alter database roles or permission grants for that milestone.
