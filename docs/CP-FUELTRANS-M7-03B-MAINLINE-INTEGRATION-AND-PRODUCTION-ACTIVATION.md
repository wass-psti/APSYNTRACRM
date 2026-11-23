# CP-FUELTRANS-M7-03B — Mainline Integration and Production Activation

| Property | Value |
|---|---|
| Date | 2026-11-23 |
| Branch | `feat/fueltrans-m7-03b-20261123` |
| Mainline base | `26d3ea0` — CP-CRM-SESSION-CPU-04 (also includes CP-TT commit `3fcced5`) |
| Integration commits | `6c3bcad`, `88622f1`, `66907da` |
| M7 corrective commit | `40f87e0` |
| Status | MAINLINE INTEGRATED — LOCAL/DISPOSABLE ACCEPTANCE PASS |
| Production migration | APPLIED — version `20261123081039` |
| GitHub Pages release | PENDING |
| Genuine two-account CRM-host acceptance | PENDING |

## 1. Mainline integration

Integrated mainline commits `3fcced5` (CP-TT-MANUAL-OT-01) and `26d3ea0` (CP-CRM-SESSION-CPU-04) into the FuelTrans M7 branch.

The integration preserves the M7 work while incorporating CP-TT-MANUAL-OT-01, including the manual overtime workflow, employee review path, TimeTracker UI, tests, and disposable SQL acceptance. It also integrates CP-CRM-SESSION-CPU-04 session recovery, preserving a separately verified Auth identity during workspace-context failures while retaining the existing sign-in path for genuine Auth identity denial.

The migration source manifest conflict was resolved by unioning both branches' forward migrations by version. Shared recovered baseline entries, project reference, source metadata, and remote ledger were verified identical before merging.

The Supabase migration API applied the M7 allocator and recorded production version `20261123081039` (UTC). The local migration filename and SHA-256 manifest are reconciled to that exact ledger version. The allocator is independent of the CP-TT migration and has no dependency on its execution order.

Final manifest verification: 222 recovered baseline migrations and 77 forward migration files match their SHA-256 manifests.

## 2. Production read-only preflight

| Project | Database |
|---|---|
| `APSYNTRACRM` — `jtlusodorfnyzgyuewkz` | PostgreSQL 17.6.1 |

- One legacy FuelTrans ticket exists and is already soft-deleted.
- Active FuelTrans ticket count is zero.
- No duplicate nonblank ticket numbers exist.
- No existing ticket matches the new `UNI|ARA|REP|PET-YYYY-NNN` format.
- Before activation, no allocator table, trigger, or unique index existed.
- Migration `20261123081039` is now recorded in production.
- The private counter table has RLS enabled; the allocation trigger and unique index are installed.
- The counter table currently has zero rows; no production ticket number has been allocated.
- Authenticated and anonymous API roles cannot select/insert into the counter table or execute the trigger function directly.
- Existing legacy ticket identifiers and row data remain unchanged.
- The signed current administrator session has active FuelTrans membership and view/edit CRM access.

No production data was changed during preflight.

## 3. Production-schema transaction and post-application smoke test

The complete migration was first exercised inside a production database transaction and rolled back. It was then applied through the Supabase migration API and recorded as version `20261123081039`.

After application, an authenticated production transaction inserted a deliberately stale client timestamp (2001-01-01) and verified the live trigger generated:

- Ticket number: `UNI-2026-001`
- Database-authoritative `created_at` and initial `updated_at`
- Matching `payload.createdAt` and `payload.updatedAt`
- Matching `payload.ticketId`
- Matching `ticket_created` activity timestamp and metadata

The post-application smoke-test transaction ended with `ROLLBACK`. The temporary ticket and counter increment were removed. A subsequent read confirmed the production table still contains exactly one legacy soft-deleted ticket, zero active tickets, zero counter rows, and no temporary preflight ticket. No production acceptance ticket has been created.

## 4. Local and disposable acceptance

| Check | Result |
|---|---|
| Full repository unit tests | PASS — 3,511 / 3,511 |
| `npm run check` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| Migration source manifest | PASS — 222 baseline + 77 forward |
| Git whitespace checks | PASS |
| CP-FT-UI-06 disposable GoTrue/PostgREST | PASS — 75 HTTP checks |
| CP-FT-UI-07 disposable browser reporter/L1/L2 lifecycle | PASS |
| 12 concurrent ticket allocations | PASS — unique consecutive numbers |
| Stale browser clock replacement | PASS |
| Philippine year boundary | PASS |
| CP-TT manual OT disposable acceptance | PASS |
| Full CP-TT CI disposable PostgreSQL 17 chain, including LIVE-01 and GPS-04 | PASS after fixture correction |
| CP-TT GPS and atomic projection acceptance | PASS |
| TimeTracker browser acceptance | PASS — desktop/tablet/mobile and axe checks |
| GitHub Actions workflow-dispatch validation `45136146844` | PASS — all validation jobs; Pages deployment correctly skipped on feature branch |
| Supabase health advisor | PASS — no health findings |
| Supabase security advisor | INFO — private counter table has RLS with no policies; intentional because API grants are revoked and only the trigger accesses it |
| Supabase performance advisor | No M7-specific issue; one unrelated existing duplicate index warning in Material Tracker |

The CP-FT-UI-07 CRM host handshake is emulated in the disposable browser fixture. CP-TT disposable acceptance uses role simulation, not genuine signed-in production sessions.

## 5. Scope and safeguards

- No Supabase project was created.
- No production ticket, account, membership, role, or permission was modified.
- No RLS policy or existing workflow authority contract was changed.
- The existing soft-deleted legacy ticket remains untouched.
- No permanent deletion was performed.
- No new dependency was introduced.
- No gradient descent, backpropagation, training, retraining, fine-tuning, model-weight update loop, or training dependency was introduced or executed.

## 6. Remaining production gates

1. Merge PR `#805` after its validation checks pass.
2. Verify GitHub Pages deployment against the exact merged commit.
3. Perform genuine CRM-host acceptance with two independently signed-in existing administrator accounts.
4. Create a clearly labeled production acceptance ticket only after the second account is ready; verify create, number, persistence, lifecycle, dashboard and reports; then soft-delete it through the existing workflow and verify cleanup.

The current signed-in administrator session is available. Two other existing FuelTrans administrator accounts have active sessions and existing FuelTrans module access; no second independent browser profile is currently open on the controlled Mac. The inspected L2 account does not have FuelTrans module access and is not selected. Use one of the two already-assigned administrator accounts in a separate browser profile or device; no assignment, role, or permission change is needed or authorized.

## 7. Next gate

**CP-FUELTRANS-M7-03B-PROD — GitHub Pages release, genuine two-account CRM-host acceptance, and final runtime reconciliation.**

The production migration is applied and verified. Pages deployment and genuine two-account acceptance remain pending.
