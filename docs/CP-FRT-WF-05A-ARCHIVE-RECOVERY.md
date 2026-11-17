# CP-FRT-WF-05A — Archive Storage and Soft Recovery

## Scope

Complete the existing Fund Release Tracker Archive Storage interface using the existing request archive field and established General Manager action.

## Implementation

- Add a company-scoped, signed `frt_archive_list` read RPC.
- Return only archive-list metadata: request ID, voucher, title, lifecycle statuses, date needed, creation time and archive time.
- Add a partial index for archived requests by workspace, company and archive timestamp.
- Add `frt_restore_request`, which locks the archived request, reuses the existing General Manager role check, clears only `archived_at`, and appends a `REQUEST_RESTORED` audit event.
- Activate the Archive Storage interface and recovery controls.
- Expose the existing `archive` request action through the current request workflow contract.
- Refresh the active tracker after a successful restore.

## Preserved behavior

- No new tables, roles, authentication framework, RLS policies or approval stages.
- Existing request, voucher, bank execution, liquidation and audit records remain intact.
- Archiving remains soft archival; no permanent deletion is introduced.
- Archive visibility uses the existing FRT Finance role set.
- Recovery reuses the existing General Manager role; no new authority tier is introduced.
- No production financial records are created or modified.

## Verification

- Frontend unit coverage for signed company scope, archive projection, restore readback and role parity.
- Disposable PostgreSQL 17 acceptance for archive, list and restore lifecycle.
- GitHub Actions workflow runs the complete frontend test suite and production build.
- Migration source checksum is registered in `supabase/migration-source-manifest.json`.


## Production activation (CP-FRT-FLOW-03D)

- Migration 20261116104500_frt_wf05a_archive_recovery.sql is applied to the existing production project.
- frt_archive_list and frt_restore_request were verified in the production schema.
- The archive index is present; authenticated RPC execution is retained and anonymous execution is denied.
- No production request or financial record was created, restored, or otherwise modified during migration activation.
