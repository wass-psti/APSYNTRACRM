# CMP-02 — Staged Native Phone / Rating / Percentage Columns

**Checkpoint:** CMP-02
**Repository:** wass-psti/APSYNTRACRM
**Date:** 2026-11-05
**Status:** IMPLEMENTED — DISPOSABLE POSTGRESQL VERIFIED — FRONTEND REGRESSION VERIFIED — LIVE ACTIVATION PENDING

## Objective and approved boundary

Extend the existing 11 native board types with three *independent* typed contracts. Do not introduce separate backends, databases, storage systems, or artificial type aliases. Reuse signed board schema management, typed inline editors, authenticated item CAS, board import mapping, PostgreSQL row-level authorization and audit.

The new types remain **hidden from production column creation** by the explicit `CMP02_SCHEMA_ACTIVATED=false` flag until the required separate production database/schema activation approval and signed-browser acceptance. Frontend representation of pre-existing typed columns is supported, but no live backend mutation has occurred.

## Verified live baseline (read-only)

The existing WatchdogWorkspace Supabase project reports:
- `work_board_columns_data_type_check` admits only 11 types, without Phone, Rating or Percentage.
- `public.work_board_normalize_column_config(text,jsonb)` MD5: `0246a27eb7e8428575188f31d0a48148`.
- `public.work_board_validate_column_value(uuid,uuid,jsonb)` MD5: `0f027e692f487ca637bdaab7e52af5d5`.
- Native CMP-02 column count in production at the post-implementation read-only check: **0**.

This is why simply adding frontend dropdown options would be incorrect.

## Native contracts

| Type | PostgreSQL JSON value | Configuration | Valid values | Explicit exclusions |
| --- | --- | --- | --- | --- |
| Phone `phone` | String | No options | E.164, literal `+` plus 7–15 digits with nonzero leading country digit | Local-only formats, extensions, implicit normalization |
| Rating `rating` | Integer-valued JSON number | `max` integer 3–10 (default 5) | Whole numbers 1 through configured maximum | Fractions, zero, out-of-range, string numbers |
| Percentage `percentage` | JSON number | `decimals` integer 0–4 (default 2) | 0–100 percentage points with configured precision | Automatic fractional scaling, locale guessing, excessive decimal places |

`0` in a Percentage is a valid stored value and is distinct from null. Empty optional fields are null. The frontend renders `12.25%`, `3 / 5`, and full E.164 phone strings; the backend validates types independently.

## Changes delivered

- `frontend/board-typed-cmp02.js` — pure shared normalization and configuration, explicit activation flag, supported values and display helpers.
- `frontend/board-inline-items.js` — Phone `tel` field, Rating select, Percentage range-aware numerical control, typed parsing and rendering; preserves authenticated cell revision CAS.
- `frontend/board-import-core.js` — detects source Phone/Rating/Percentage and maps only to **existing** typed columns, validates original source values and converts explicit `12.25%` to **12.25 percentage points**. No unapproved automatic creation.
- `frontend/board-column-catalog.js` — staged registry entries exist but do not appear as production-available types while `CMP02_SCHEMA_ACTIVATED=false`.
- `frontend/board-structure-admin.js`, `frontend/app.js` — staged type-specific `max` and `decimals` controls use the existing manager-authorized `wm_board_schema_mutate` contract only once activated.
- `sql/cmp02-staged-typed-columns.sql` — transactional, preflight-pinned type CHECK extension and additive branches in exactly two existing PostgreSQL functions; unchanged signatures, ownership, grants, roles, RLS and authentication.
- `sql/cmp02-guarded-rollback.sql` — restoration of exact baseline function definitions and CHECK, but deliberately denies rollback while any CMP-02 columns exist.
- `sql/tests/cmp02-disposable-production-contracts.sql` and related disposable acceptance/cleanup/rollback tests — reproduce the baseline and verify controlled setup and recovery.
- `.github/workflows/cmp02-disposable.yml` — PostgreSQL 17 disposable acceptance and fail-closed rollback verification.
- `frontend/tests/cmp02-columns.test.mjs` — imported value conversion, typed editors, formula-like invalid values, empty/null/zero, config limits, production-gating, and row diagnostics.
- `scripts/pages-smoke.mjs` — includes CMP-02 frontend modules in deployed asset checks.

## Acceptance evidence

1. Exact production baseline and matching CHECK verified read-only — **VERIFIED**.
2. New typed configuration and value validators — **VERIFIED in disposable PostgreSQL**.
3. Signed mock owner/editor, stale CAS, revoked-session and cross-workspace column-manager denials — **VERIFIED in disposable PostgreSQL**.
4. Guarded rollback is denied if new typed columns remain, and exact original functions are restored after test cleanup — **VERIFIED in disposable PostgreSQL**.
5. Frontend source tests passed: **992/992**, all associated isolated DB and live Pages validation jobs passed in the tested commit — **VERIFIED**.
6. Actual production SQL activation, genuine signed user column creation, refresh persistence, CAS writes, filtering, audit, and cross-session behavior — **PENDING**.

- [CMP-02 isolated PostgreSQL acceptance](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41977824995)
- [992 passing frontend tests](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41978229961)

## Production change gate (not authorized by this staged milestone)

A separate approval is required to activate the production CHECK and replace security-relevant functions. Before activation recheck function-definition hashes, backup/rollback readiness, valid active signed user sessions, role ceiling and foreign-workspace denials; verify migration against a disposable database and a concrete ordinary-board fixture. Afterwards enable the frontend feature gate in a separate reviewed code change and perform genuine browser create/edit/import/persistence/audit regression. **Never treat a successful Pages deployment, an automated test, or a standalone SQL stage as proof that native production columns are available.**

No production SQL, production data, RLS, role assignments, credentials, or authentication controls were modified in this milestone.

**Evidence-based milestone gate completion: 5/6 (83%).** This measures the scoped CMP-02 gates and does not assert overall column-type inventory completion or production readiness.
