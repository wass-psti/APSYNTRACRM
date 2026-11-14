# CP-DB-CPU-07 — Effective-Access Read-Path CPU Reduction

**Status:** Deployed to the existing Supabase project `jtlusodorfnyzgyuewkz` at 2026-11-14 04:07:31 UTC
**Source baseline:** `98d0aee6cf0a2388b760dd8bd7289ada713b2625` (CP-DB-CPU-06 merge)
**Target RPC:** `public.apsyntra_crm_my_effective_access()`
**Migration:** `20261114040731_cp_db_cpu_07_effective_access_read_path.sql`

## Scope

Reduce redundant database work in the signed, read-only effective-access snapshot. The implementation changes only the function body and PostgREST schema-cache notification.

Explicitly unchanged:

- `auth.uid()` self-only identity source and zero-argument RPC signature;
- `current_workspace_id()` signed workspace-selection resolver;
- `apsyntra_role_is_bootstrap()` bootstrap verifier;
- platform-role fallback mapping and personal-workspace owner override;
- explicit workspace-role ceiling and module-role rank rules;
- the exact 12-module inventory and admin role mapping;
- active-workspace board filtering and view/edit/manage formulas;
- JSON schema version 1 and all response keys;
- function ownership and existing execute grants;
- all RLS policies, table grants, roles, memberships, session rules, and workspace-selection behavior.

No index was added. The production `workspace_members` table currently contains 44 rows; the measured fallback query plan uses a sequential scan and sort at approximately 0.27 ms. An additional index would not be justified for this small relation without a future measured plan change.

## Query changes

The previous RPC separately resolved:

1. active profile/workspace membership and host platform role;
2. inherited effective platform role through `apsyntra_crm_effective_role()`;
3. explicit workspace role through `apsyntra_crm_explicit_role()`.

The replacement performs the same membership/profile/role resolution in one SQL query. It preserves the personal-workspace owner check and the exact fallback mapping. The existing workspace-selection and bootstrap helpers remain authoritative and are not rewritten.

The live post-deployment role/module parity checks returned 43 active membership pairs with zero platform-role mismatches and 516 membership/module pairs with zero module-role mismatches.

The previous module projection evaluated `apsyntra_crm_module_role_rank()` twice for each of 12 module rows and recalculated the effective platform rank for each row. The replacement computes the effective platform rank once and each module rank once through a one-row lateral expression.

## Pre-deployment parity evidence

Read-only comparison across all active profile/workspace memberships returned:

- 43 active membership pairs;
- 0 differences between `apsyntra_crm_effective_role()` and the consolidated role expression;
- 0 differences between `apsyntra_crm_explicit_role()` and the consolidated assignment join.

Existing RPC privilege inventory before deployment:

- `anon` execute: false;
- `authenticated` execute: true;
- authenticated table SELECT on `apsyntra_crm_platform_roles`: false.

The migration does not issue any GRANT or REVOKE statement.

## SQL-fragment microbenchmark

A single pre-deployment `EXPLAIN (ANALYZE, BUFFERS)` comparison of the old three-read role-resolution fragment and the consolidated fragment, using the same representative active membership lookup, reported:

| Fragment | Execution time | Shared buffers hit |
|---|---:|---:|
| Separate host/effective/explicit reads | 2.303 ms | 204 |
| Consolidated profile/membership/role read | 0.546 ms | 10 |

This is a small SQL-fragment microbenchmark, not an end-to-end RPC benchmark and not a measured PostgreSQL CPU percentage. The timings are a single sample and should not be presented as a controlled load test.

## Post-deployment signed runtime sample

The active CRM browser continued to show `Secure session` and `Live synced`. Supabase Edge request logs recorded the following signed RPC samples:

| Window | Requests | Distinct signed actors | Errors | p50 origin | p95 origin | Max origin |
|---|---:|---:|---:|---:|---:|---:|
| Pre-deployment, 03:07:31–04:07:31 UTC | 32 | 2 | 0 | 292.5 ms | 319.95 ms | 408 ms |
| Post-deployment, 04:07:31–04:09:00 UTC | 2 | 2 | 0 | 266 ms | 266.9 ms | 267 ms |

The two post-deployment requests were HTTP 2xx. This small post sample shows lower observed origin latency (about 9.1% at p50 and 16.6% at p95), but it is not a controlled workload and is insufficient to establish a durable latency or CPU reduction percentage.

The Supabase dashboard showed a CPU usage point of 1.75% at approximately 04:10 UTC (12:10 PM GMT+8). An earlier dashboard snapshot showed 86% at approximately 03:36 UTC. These are different traffic moments; the lower point is observed, but cannot be attributed solely to CP-07. No CPU setting or statistics reset was used.

## Runtime and production acceptance limitations

The Supabase SQL connection has no authenticated request identity (`auth.uid()` is NULL), so it cannot legitimately execute the signed self-only RPC. The available local Chromium profile was signed out when opened to the QA board. The separate authenticated browser context can be read, but the available browser connector exposes no interaction controls. No JWT was fabricated and no production authorization was bypassed.

The signed endpoint has now returned two successful post-deployment requests from two distinct actors, but the response JSON has not been directly captured for a before/after deep comparison. The latency sample and CPU dashboard point are observational only; a sustained, controlled CPU delta remains pending. The approved CP-05 same-value QA import also remains pending: the local Chromium profile opened on the Mac was signed out, while the authenticated Browser context is readable but does not expose click/type controls through the available connector. The approval is not treated as evidence that the write occurred.

## Verification results

- CP-07 focused and related signed-access/workspace regression suite: 89 passed, 0 failed.
- `git diff --check`: passed.
- Production migration version `20261114040731` is recorded.
- Production function remains `SECURITY DEFINER`, owned by `postgres`, with empty `search_path`; `anon` execute remains false, `authenticated` execute remains true, and authenticated direct SELECT on the role table remains false.
- The deployed function body matches the versioned migration exactly (MD5 `8df0c6f46e2417ba52645880fb15cd22`). It has one active `workspace_members` join, one `apsyntra_crm_platform_roles` join, zero calls to the two redundant role helper functions, and one module-rank expression per module.

## Verification commands

```sh
node --test frontend/tests/cp-db-cpu-07-effective-access.test.mjs
node --test frontend/tests/signed-effective-access.test.mjs frontend/tests/signed-effective-access-ui.test.mjs
node --test frontend/tests/cp-urm03-workspace-role-consistency.test.mjs frontend/tests/cp-rc03-workspace-scoped-mrh-role.test.mjs
```

Run `sql/tests/cp-db-cpu-07-effective-access-parity-readonly.sql` after deployment for live formula parity and grant verification. It performs read-only SELECT statements only.
