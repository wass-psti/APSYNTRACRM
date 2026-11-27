# CP-MS-CRM-01 — Repository-first transition

This directory is the preserved standalone Material Sourcing source baseline, not a second production application. APSYNTRA CRM is now the canonical repository. No separate developer Mac, local clone or local database is required for future changes; validation should run in isolated GitHub Actions jobs.

## Baseline and status
- Source snapshot contains previously accepted frontend and CP-MS-BACKEND-01–04 code, plus discovered CP-MS-BACKEND-05 implementation files and tests. CP05 is not yet certified.
- SOURCE-MANIFEST.json records original file sizes, SHA-1 Git object hashes and SHA-256 content hashes. All imported files matched the original Git object hashes and sizes during transfer.
- Existing CRM Material Request Hub / Material Sourcing files, signed board/RPC access, protected commercial fields, group identities, other application routes and deployment pipeline remain unchanged.
- The preserved development server uses a local test actor and disposable database credentials. Never deploy it or use it to replace CRM authorization. Migrations and seed here are isolated candidates, not production migration history. Historical docs describe the old standalone environment, not required setup.
- No operational rows, browser storage, environment files, database dumps, credentials, installed dependencies or compiled output are imported. Synthetic source fixtures remain for parity tests. Local-only Docker rebinding utility is intentionally excluded.

## Integration gates
1. GitHub-hosted baseline build, regression and bulk acceptance using disposable PostgreSQL and Chromium; reconcile failures, preserve exact pricing and recovery.
2. Map existing signed MRH sourcing board identity, item/group fields, private commercial fields and existing data to the standalone model; resolve authority and workflow compatibility without changing existing permission policy. Establish a nonproduction migration/reconciliation plan.
3. Embed the approved interface in the existing native application route, scope styles, integrate shared CRM session/workspace, use existing signed backend contracts or reviewed compatible extensions. Preserve existing routes and records; no demo fallback or localhost dependency in CRM.
4. Prove signed browser workflows, data parity, transactional CRUD/bulk retry, exact pricing, task/comment integrity, exports and CRM regression. No automatic production schema/data migration; obtain explicit approval for production activation or data movement. Only merge/release via existing repository policy after relevant checks.

This commit is source preservation only. Do not mark the native runtime integrated or CP05 accepted until actual evidence exists.
