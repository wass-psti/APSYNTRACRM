# CP-FRT-BOARD-03D — Genuine signed GoTrue QA acceptance

Date: November 12, 2026.

## Verified: isolated native Supabase stack

GitHub Actions successful run: https://github.com/wass-psti/APSYNTRACRM/actions/runs/43175945439

The new runner reuses the pre-existing SEC10 CI02/CI03 native disposable Supabase stack. It installs the canonical restricted FRT read projections and the already approved date/assignee RPC definitions **only on that disposable stack**. It uses actual GoTrue-issued sessions and PostgREST bearer authentication, not `set_config('request.jwt.claim.sub',...)` as a substitute for sign-in.

The final check report showed `status=PASS`, three genuine GoTrue sessions (finance editor, foreign-workspace user, editor re-login), one signed QA request creation, one date update, one person assignment, successful persistence in a new login session, two stale-write denials with unchanged data and audit, four foreign-workspace denials, restored original date and null person assignment, and exact QA fixture cleanup. The workflow's disposable stack teardown step also passed. Credentials, bank information, and account identifiers are not included in report output.

The original SEC10 CI03 finance role/approval checks remain prerequisites and were executed in the same isolated stack. This does not change production roles, workspace permissions, RLS, storage, or financial records.

## Remaining production-browser boundary

The current ChatGPT Browser integration cannot control the signed APSYNTRA CRM tab from this conversation. Production currently has no FRT request for browser interaction, and generating a production financial request merely for acceptance would leave voucher sequence and audit side effects even after archiving. Therefore **genuine production-browser interaction and production request persistence remain PENDING**, not failed. Never describe this isolated signed GoTrue test as proof that the production UI was clicked, refreshed, or reopened.

## Final acceptance classifications

| Area | Status |
|---|---|
| Genuine GoTrue session with disposable signed FRT request creation | VERIFIED |
| Signed date and person update and independent login readback | VERIFIED |
| Stale and foreign-workspace denial | VERIFIED |
| Original fields restored and targeted fixture cleanup | VERIFIED |
| Ephemeral Supabase stack teardown | VERIFIED |
| Real signed production browser interaction | PENDING |
| Live business record changes | NOT APPLICABLE; none performed |

Only the last browser/UI evidence remains outstanding. Do not add new roles, projects, users, or broaden FRT authority to obtain that evidence.
