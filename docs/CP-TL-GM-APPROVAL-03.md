# CP-TL-GM-APPROVAL-03 — Release candidate

- Migration: `20261125012603_cp_tl_gm_approval_exemption.sql`
- SHA-256: `d2417020aae9aa021386daba47966e94f923bfa57203cd7aba35f9476bfb93c7`
- Production project: jtlusodorfnyzgyuewkz
- Production read-only baseline: PostgreSQL 17.6; ledger max version 20261125005115; exemption table absent; one GM-created active For Approval document.
- Exact existing function fingerprints checked by migration preflight; unchanged existing function ownership and grants checked by postflight.
- No backfill or production document update in the migration.

## Release rehearsal and additional correction

The first rehearsal with the full bulk-actions baseline exposed the already
deployed manager-only guard on public.tl03_document_read. It replaced the
creator-read branch established in migration 20261119073346. The new
migration restores that exact existing capability predicate, retains
SECURITY INVOKER, existing RLS, execution grants, and the deleted-record
filter. It is not a new role or general permission grant.

The exact migration rehearsal uses synthetic rows in a network-isolated
PostgreSQL 17 container, with captured production function definitions
loaded from an explicitly provided local baseline SQL file. The migration
must reject any production function fingerprint drift rather than applying
to an unverified baseline.

Run:
```sh
CP_TL_GM_BASELINE_FILE=/tmp/cp-tl-gm-live-baseline.sql \
 bash scripts/cp-tl-gm-approval-03-release-disposable.sh
```

The baseline file contains function definitions only; it is not committed.
The migration and manifest are the authoritative release source; the earlier
SQL candidates remain development evidence, not separate deployment steps.

## Production gate and coordinated activation

Obtain explicit approval for this exact migration, including the existing
creator-read regression restoration. Verify GitHub CI before merge, deploy
the compatible frontend first, then apply the migration and verify the
production ledger, live function contracts, exemption table and existing
record counts. The new GM editor preview is prospective until database
activation. Do not submit or approve the affected document during the short
frontend/backend release interval. Refresh open clients before signed review.
Do not create or alter production business documents as a deployment test.

After activation, the GM may intentionally re-save the existing pending
quotation and record the applicable Management validation. Verify the same
document number and Board item, one newly recorded exemption, one authentic
Management review, no primary review, Approved state and printable history.
Preserve ordinary-user two-review behavior. Do not remove any exemption
evidence if rolling back after exempt approvals exist.
