# CP-FT-UI-05 — FuelTrans Persisted RLS Acceptance and Station Activation Readiness

**Date:** 2026-11-23
**Repository:** `wass-psti/APSYNTRACRM`
**Baseline:** merged CP-FT-UI-04 (`c3d43369299fc75e5936dc47b49614a6f35b603e`)
**Production Supabase project:** `jtlusodorfnyzgyuewkz` (read-only inspection only)

## Engineering decision and scope

The requested 48-station, credential-bearing Station Manager **cannot be activated responsibly**. Read-only inspection of the existing production schema found **zero public station/registry tables**, while the `fueltrans_tickets` table exists. Searches across the authorized CRM repository, prior WatchdogWorkspace FuelTrans source, and accessible local export folders found no owner-verified station export or authoritative API. The 19 screenshots are visual references, **not source-of-truth records**. Do not synthesize missing inventory, engineer rosters, AnyDesk credentials, or historic ticket volumes.

**Preserved:** production schema, CRM permissions/RLS, five-stage ticket wizard, local-only station CSV review added in CP-FT-UI-04, current board/module mappings, no extra authority restrictions, and inference-only behavior.

For actionable acceptance without a trusted station source, this checkpoint implements a repeatable, **real PostgreSQL persistence and RLS lifecycle gate** using the source FuelTrans migrations and two distinct user identities.

## Implementation

- `sql/tests/cp-ft-ui05-prerequisites.sql`: minimal disposable equivalents for existing `auth.uid()`, `public.workspaces`, `public.profiles`, and Storage's minimal schema contract so the **original, unmodified** FuelTrans migrations can run in an empty PostgreSQL 17 container.
- `sql/tests/cp-ft-ui05-disposable-lifecycle.sql`: distinct fixture identities for UNIOIL reporter, L1 engineer, L2 engineer, ARAMCO client, and foreign-workspace actor, with ticket creation, claim, escalation, resolution, and actual database readback. PostgreSQL `SET LOCAL ROLE authenticated` and request claim GUC emulate the database-facing identity claims.
- `scripts/cp-ft-ui05-disposable-postgres.sh`: creates a temporary PostgreSQL 17 container with **no network and no published ports**, runs the checked-in FuelTrans migrations (20260928034824, 20260928035728, 20260928035850, 20260928040345, 20260928041601, 20260929005600), executes contract checks and lifecycle acceptance, and **always destroys** the container on exit. It never connects to the user's existing local Supabase stack, any hosted Supabase endpoint, or a production database.
- `.github/workflows/apsyntra-frontend.yml`: adds this gate to the **already existing disposable-postgres CI job**, using an independently created ephemeral database within the CI PostgreSQL 17 service. No additional CI job, cloud Supabase project, new package, or production migration is necessary.

### Verified acceptance scenarios

| Scenario | Expected result |
|---|---|
| UNIOIL reporter inserts ticket using existing RLS | One persisted source ticket |
| Reporter readback | Own-client ticket visible; other-client and other-workspace records excluded |
| ARAMCO client read + attempted UNIOIL update | Cross-client ticket hidden; update affects zero rows |
| L1 engineer claims | Assignment and `Under L1 Review` persist |
| L1 engineer escalates | `Escalated to L2` persists |
| L2 engineer claims | Assignment and `Under L2 Review` persist |
| L2 engineer resolves | `Resolved` and closure payload persist |
| Stale compare-and-swap | Zero affected rows; newer resolved state preserved |
| Disposable L2 membership disabled | L2 ticket access revoked |
| Anonymous ticket read | Denied |
| Final owner readback | Both assigned users, resolved status, and closure date retained |
| Resource cleanup | Test container destroyed automatically; no host port or network |

**Measured local result:** PASS, including original migrations, contract guard, all persistence/denial tests, and container cleanup.

## What is and isn't accepted

The new gate is a **real database test** (not CP-FT-UI-04's in-memory repository emulator). It uses actual PostgreSQL RLS rules and triggers from checked-in migrations, and persists records across separate transactions by distinct PostgreSQL identities.

It is **not** a complete Supabase/GoTrue end-to-end test: the JWT claim is simulated with transaction-local PostgreSQL session settings; no independent GoTrue email/password login, cookie/session refresh, real browser ticket write, Storage object creation, or production API interaction occurs. It does not prove the current hosted database matches every historical migration. The source UI's `buildChange` guards are already exercised in CP-FT-UI-04's unit tests; this additional SQL gate verifies the database-facing persistence and policy layer, not source UI interactions.

## Reference parity status

The CP-FT-UI-04 19-reference matrix remains the visual baseline. Current Dashboard, ticket wizard, queue, ticket details, L1/L2 and handover, analytics and report issue screens remain available. The mismatch categories are:

1. **Unverified authoritative data:** station master, POS/BOS/AnyDesk and deployment details, shift roster, historical ticket records, ticket metrics.
2. **Visual/workflow differences:** reference three-step wizard vs current source-preserving five stages, CRM nested-host shell vs full-screen reference shell, reporting and audit tab parity, source-specific incident workbench behavior.
3. **Cross-account runtime acceptance:** two genuine GoTrue sign-ins and a disposable, fully integrated browser/REST create → claim → escalate → resolve persistence flow.

Do **not** mark these as complete based on synthetic screenshots, repository builds, or this PostgreSQL gate.

## Acceptance and release verification

Run `sh scripts/cp-ft-ui05-disposable-postgres.sh` locally. The executable is opt-in, uses the installed `postgres:17-alpine` Docker image, does not install dependencies, and cannot contact an external database. In CI the existing disposable Postgres job executes the same SQL files in the same order within a separate ephemeral database.

Also require existing `npm test`, `npm run build`, `npm run check`, `npm run lint`, `node scripts/cp-ft-ui04-browser.mjs`, targeted syntax/diff checks and green GitHub validation before merging. Verify Pages deployment and actual signed-in read-only navigation separately; no frontend files were modified in this checkpoint.

## Next checkpoint only if prerequisites appear

**CP-FT-UI-06 — Trusted Station Registry Source Onboarding and Real Two-Session Supabase/Browser Acceptance.**

Entry requirements:
- A verified owner-controlled non-secret station export/API with provenance, expected client/station keys, and update responsibility, so station directory data can be reconciled without guessing.
- An explicitly disposable nonproduction Supabase environment (not a new hosted project, not the existing shared local project) with two authorized independent GoTrue accounts and permitted test-ticket cleanup.

Then implement the smallest compatible persistence contract and finish data-backed 19-screen parity, signed in multi-account lifecycle and regression closure. If either prerequisite remains unavailable, retain the proven CP-FT-UI-05 gate without inventing an inventory or treating mock identities as real sign-ins.

**Training constraint:** No gradient descent, backpropagation, fine-tuning, model-training loops, or model-weight updates/dependencies were introduced.
