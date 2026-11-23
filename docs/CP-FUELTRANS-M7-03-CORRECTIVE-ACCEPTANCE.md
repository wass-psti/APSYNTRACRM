# CP-FUELTRANS-M7-03 — Corrective Preparation and Disposable Acceptance

| Property | Value |
|---|---|
| Date | 2026-11-23 |
| Branch | `feat/fueltrans-m7-02-20261123` |
| Base | M7-02 implementation, commit `1adf72f` |
| Status | IMPLEMENTED — VERIFIED IN DISPOSABLE ENVIRONMENTS |
| Production activation | PENDING |
| Genuine CRM-host two-account acceptance | PENDING |

## 1. Scope

This checkpoint corrects the ticket creation timestamp source before production numbering activation. It does not apply the migration to the production Supabase project, deploy GitHub Pages, create production tickets, or change existing role and authorization contracts.

## 2. Corrective implementation

The pending M7-02 ticket-number allocator migration now:

- Sets `created_at` from PostgreSQL `clock_timestamp()` on every new ticket insert. Browser-supplied creation timestamps are not authoritative.
- Sets initial `updated_at` to the same database timestamp.
- Derives the ticket year from that timestamp in `Asia/Manila`, independent of UTC date and browser clock.
- Synchronizes `payload.createdAt`, `payload.updatedAt`, and `payload.ticketId` with the database row.
- Synchronizes the `ticket_created` activity timestamp and its ticket-number metadata.
- Preserves the supplied operational date, reporting shift, workflow data, counter upsert, high-water seeding, uniqueness index, and existing trigger authorization contract.

The correction is implemented in the existing not-yet-applied migration. No additional migration version is created.

## 3. Disposable acceptance improvements

The CP-FT-UI-06 disposable GoTrue/PostgREST runner now:

- Seeds high-water ticket references using the current Philippine calendar year rather than a fixed test year.
- Sends deliberately stale 2001 browser creation timestamps and verifies that PostgreSQL replaces them with its own current timestamp.
- Verifies exact timestamp parity across row columns, JSON payload, and creation activity.
- Verifies the ticket number year matches the database timestamp's Philippine local year.
- Tests the 2026/2027 Asia/Manila year boundary directly against the same timezone conversion used by the trigger.
- Retains rollback, high-water, 12-way concurrency, client prefix, workflow, compare-and-swap, and independent-session acceptance.

All test users, tickets, databases, GoTrue services, PostgREST services, and Docker network resources are disposable. The runner removes its containers and network on exit.

## 4. Verification evidence

| Check | Result |
|---|---|
| Disposable PostgreSQL 17 migration application | PASS |
| Existing high-water seed (UNIOIL 037 / ARAMCO 012) | PASS |
| Legacy ticket-reference preservation | PASS |
| Counter RLS and API-role privilege baseline | PASS |
| Stale client clock replaced by database clock | PASS |
| Row `created_at` / `updated_at` parity | PASS |
| Payload creation/update timestamp parity | PASS |
| Creation activity timestamp and ticket reference parity | PASS |
| Current Philippine-year numbering | PASS |
| Asia/Manila year boundary 2026 → 2027 | PASS |
| 12 concurrent UNIOIL inserts | PASS — unique consecutive numbers |
| Transaction rollback | PASS — counter increment rolled back |
| Client prefixes | PASS — UNIOIL, ARAMCO, REPHIL, PETRON |
| GoTrue independent identities | PASS — 9 disposable accounts |
| GoTrue/PostgREST integration | PASS — 75 HTTP checks |
| Two-session L1/L2 lifecycle and CAS | PASS |
| Competing L1 claim race | PASS — one winner |
| Browser reporter/L1/L2 ticket workflow | PASS — disposable browser sessions |
| Full repository test suite | PASS — 3,500 / 3,500 |
| `npm run check` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| Migration source manifest | PASS — 222 recovered baseline + 76 forward migrations |
| Git whitespace check | PASS |

The disposable browser workflow confirms reporter ticket creation and rendering, L1 claim/escalation, L2 claim/resolution, and other-client read denial. Its CRM host handshake is emulated; it is not genuine production CRM-host two-account acceptance.

## 5. Existing limitations preserved

- Call Center claim/transition capability remains constrained by the existing workflow authority contract.
- Client Manager viewer client-scope behavior remains unchanged.
- No role, membership, grant, policy, RLS, or Auth setting was changed.
- No new dependency was introduced.
- No gradient descent, backpropagation, training, retraining, fine-tuning, model-weight update loop, or training dependency was introduced or executed. The existing inference-only architecture remains unchanged.

The production build retains the repository's existing non-module startup-guard bundling notice and large application/PDF chunk warnings. The build completed successfully; no unrelated bundling refactor was included.

## 6. Production state and next gate

The M7 allocator migration remains unapplied in production. GitHub Pages remains on the existing production deployment. No production ticket, membership, account, role, or permission was changed.

The live production migration ledger and genuine CRM-host two-account acceptance remain separate acceptance gates.

**Next implementation: CP-FUELTRANS-M7-03B — Production Ticket Numbering Activation, Fast-Forward Frontend Release, Genuine CRM-Host Two-Account Acceptance, and Final Runtime Reconciliation.**

That phase must apply the reviewed migration to the existing APSYNTRACRM project, deploy the feature through the repository's existing release path, and verify actual production ticket creation and readback using two independently authenticated existing FuelTrans accounts. The production test ticket must be clearly labeled and recoverably soft-deleted after verification. No permanent deletion is authorized.
