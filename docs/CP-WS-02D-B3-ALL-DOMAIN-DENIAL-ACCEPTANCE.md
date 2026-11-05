# CP-WS-02D/B3 — 24-Entrypoint Denial Acceptance and Production Source Integrity

**Status, 2026-11-05:** **VERIFIED — isolated denial acceptance; valid domain transactions and production invitation activation PENDING.** Branch: `main`.

## Acceptance boundary

This checkpoint continues the existing [B3 domain-write/delivery gate](./CP-WS-02D-B3-DOMAIN-WRITES-DELIVERY-READINESS.md). There were 30 original independent write-path review candidates. Seven have prior positive/negative transactional evidence in disposable PostgreSQL (two board-creation, four module-state/lock, FuelTrack Admin import). An additional **24** functions, including the already-reviewed FuelTrack import, were staged via a source-preserving SQL candidate. Consequently, **30 distinct identified functions are covered by staged upper-bound code**, but **only 7 have individual authorized-business-transaction acceptance**. The other **23 still require successful original domain write, CAS, record ownership, audit, concurrency and rollback coverage**. Do not treat denial-only tests as proof of those business invariants.

### Staged test and static integrity

- `sql/tests/cp-ws02d-b3-remaining-domain-manifest.json` records exactly 24 original production function signatures, definition MD5 hashes, the proposed maximum workspace action and preexisting client EXECUTE grants.
- `sql/cp-ws02d-b3-remaining-domain-ceiling-candidate.sql` preserves the original functions, inserts one signed workspace upper-bound `AND` predicate, and aborts on a source-fingerprint mismatch. The staged guard denies the logged-out caller, workspace Viewer writes, workspace Member manage privileges, and expired sessions before the original mutating code executes.
- `scripts/ws02d-b3-source-check.mjs --check` verifies all 24 source bodies reproduce their original fingerprints after removing exactly one inserted guard. `--emit-fixture` builds isolated fake dependencies; **it does not reproduce all production domain tables or authorization providers**.
- `sql/tests/cp-ws02d-b3-all-24-entrypoint-denial.sql` invokes all 24 functions with synthetic signed identities and no valid domain payload. It verifies the precise upper-bound denial message for callable functions as `authenticated`, for three internal-only functions in a privileged disposable fixture, and for expired sessions. It also checks that existing `anon` and `authenticated` execution grant boundaries remain unchanged.
- `sql/tests/cp-ws02d-b3-remaining-domain-acceptance.sql` separately exercises an editor-denied TradeLink action and a Member-denied manage operation. These are synthetic pre-mutation assertions, **not valid TradeLink or Charter business operations**.
- `sql/tests/cp-ws02d-b3-import-role-preservation.sql` protects a previously authorized FuelTrack flow: a workspace Member who is also a **FuelTrack module Admin** can still import synthetic activities, with duplicate suppression. A workspace Viewer with the same domain Admin role cannot import. Activity-table assertions are performed by the fixture owner rather than granting the signed client unrestricted table reads.
- **CI evidence:** [Workspace Lifecycle PG17 Run #142](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41997607247), completed **SUCCESS**. All new and historical workspace/board/invitation module tests passed. Intermediate runs #140/#141 failed as new tests exposed mismatched import action classification and test-fixture table SELECT privileges; the aggregate import action was corrected from `manage` to `edit` to preserve the earlier accepted module Admin behavior. No production change was involved.

### Live read-only source and default-off check

The checked-in, reproducible `sql/tests/cp-ws02d-b3-24-live-original-preflight.sql` was executed against the **existing** Supabase project `jtlusodorfnyzgyuewkz` and returned:

```text
CP_WS_02D_B3_24_LIVE_ORIGINALS_VERIFIED_DEFAULT_OFF
expected_count=24
unchanged_count=24
changed_count=0
current_workspace_count=2
current_active_memberships=40
```

This confirms all 24 live production source definitions match the manifest, core private invitation tables/functions are absent, and workspace creation/switch RPCs are absent. The earlier B3 production preflight also verified lifecycle flags were disabled and other board/module function fingerprints unchanged. This does **not** confirm actual live signed write denial because none of the proposed role-ceiling functions is installed on production.

### Authorization review distinctions and blockers

| Dimension | Verified | Not yet accepted |
| --- | --- | --- |
| Original SQL body preserved apart from ceiling guard | 24/24 staged source candidates | Production migration execution |
| Individual function negative authorization entrypoints | 24/24 in synthetic PostgreSQL | Genuine GoTrue/HTTP denied mutations |
| Individually tested original positive business transactions | 7/30 distinct domain candidates | 23 remaining valid domain workflows |
| Authenticated / internal EXECUTE boundaries | 21 client-callable, 3 nonclient, none anonymously executable (staged candidate manifest) | End-to-end server-to-database privilege bridge |
| Stored provider delivery outcome | Mock backend + synthetic private ledger | Approved provider, verified sender DNS, webhook signature/bounce reconciliation |
| Workspace selection after invitation | B4 remains disabled | Approved B4 or independently secured workspace-scoped acceptance |

**Caution:** The staged action map (`edit` vs `manage`) for the other domain-specific administrative workflows is a *proposed upper bound*, not an approved business-role matrix. Before activation, check each valid domain role (Employee Evaluation admin/supervisor, Order Intake stage owner, TradeLink cleanup operator, TimeTracker clock user, Charter/platform admin) against the workspace-level Admin/Member/Viewer expectations. Reject any mapping that silently removes an existing authorized operation or grants beyond platform/domain ceilings. Keep both `advanced_roles_enabled` and email delivery disabled until this comparison and genuine signed acceptance pass.

## Next required checkpoint

**Continue CP-WS-02D/B3 — Individual Domain Valid-Write and Record-Authorization Acceptance**, prioritizing TimeTracker attendance, Employee Evaluation and Order Intake; follow with TradeLink, remaining FuelTrack actions and platform administration. For each, verify permitted edits, Viewer denials, current/foreign workspace isolation, expired sessions, stale revisions, record ownership, idempotency, audit and rollback. Then complete separately approved trusted provider/GoTrue integration, genuine invitation delivery and B4 workspace-selection dependency. No production schema, grants, user roles, memberships, email delivery or external provider setting was changed by this checkpoint.
