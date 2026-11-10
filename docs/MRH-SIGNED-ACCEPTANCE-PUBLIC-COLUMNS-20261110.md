# Material Request Hub — Signed Acceptance and Public Column Integration
2026-11-10. Branch feat/mrh-public-column-projection-acceptance-20261110.

## Authoritative preflight
Existing production project: jtlusodorfnyzgyuewkz, workspace 00000000-0000-4000-8000-000000000001. Board 617c4c0f-e343-4b3b-8456-50d47dcbaf99 remains active with exactly one original group, ID 21566a87-b287-4a61-b521-bb233956e09e, title `Main group`, position 0; eight custom columns, zero items, zero protected records. No production database writes performed in this increment.

## Implemented
1. Fixes a proven frontend presentation deficiency: the six approved ordinary sourcing fields are shown after authorized schema activation even when optional board customization status is unavailable. Exact board identity, column custom prefix, field name, field type, visibility and non-system status must match. All sixteen restricted/derived fields remain excluded from generic board grid. The record heading shows **Part number** without changing the database title field or group.
2. Adds explicit **Verify signed sourcing readiness** control on the actual Material Request Hub board. It checks live signed user, workspace, board-view permission, exact original group identity and eight authoritative domain columns, domain ADMIN bootstrap and six approved columns. Where there is an actual persisted item in Main group, it exercises the existing protected read RPC through already revalidated signed item access. Returns **only** bounded status/counts; never returns prices, user identifiers, vendors, or account details. Makes zero writes, creates zero fixtures, stores no persistent report, and explicitly labels live write acceptance and other-role denial as NOT EXECUTED.
3. Preserves the existing signed interactive create/edit flow delivered in PR #197. No new backend auth service, Supabase instance, permission elevation, schema changes, or behavioral rewrite.

## Production acceptance boundary
The current production board has no item. Consequently: live signed create/reload, private field write/reload/CAS persistence, revoked-session and non-ADMIN denial with genuine accounts remain **PENDING**, not PASS. Six public columns are not created by this release. They require the existing explicit, signed administrator activation button in **Board options → Advanced board settings & views**. A successful activation should yield 14 columns, preserving all original eight columns and `Main group`. Do not create synthetic operational rows to pass checks.

The on-demand readiness control is a non-mutating probe, **not** a substitute for signed negative security tests or production-write acceptance. Financial formulas, tax/FX semantics and approval flows remain separate incomplete application requirements.

## Verification
Run `node --check frontend/app.js`, `node --check frontend/board-grid.js`, `node --test frontend/tests/*.test.mjs`, repository security CI, browser smoke and production Pages verification. If any outcome is uncertain, stop; do not rerun schema writes blindly.
