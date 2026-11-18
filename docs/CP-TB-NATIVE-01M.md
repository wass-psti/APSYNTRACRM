# CP-TB-NATIVE-01M — Authoritative provider-readiness preflight

Date: November 18, 2026
Repository: wass-psti/APSYNTRACRM
Scope: read-only historical monday.com source provenance. No production-data or authorization changes.

## Actual provider evidence status

The signed source board in Brave remains accessible. Its previously exported XLSX is authoritative for **87 original issue IDs, 1,129 discussion post IDs, 70 reply relationships and 148 distinct asset references across 51 posts**, but does **not** independently establish original child IDs or asset bytes. The reported hidden subitems-board URL redirected to the source parent board. Do not equate a redirect or blank export cells with a provider-confirmed zero-subitem count.

During CP-TB-NATIVE-01M the Mac's remote-command channel stopped responding. The terminal environment did not expose MONDAY_API_TOKEN when it was last checked. No successful official monday API request or attachment download was established. No provider-source completion or production parity is claimed.

## Official read-only API contract

The pinned provider recovery module is `scripts/talkbox-provider-evidence.py`. It uses documented monday.com GraphQL queries:

- `boards(ids:) { items_page { cursor items { id name subitems { id name parent_item { id } board { id } } } } }`, and `next_items_page` for all pages.
- `assets(ids:) { id name file_extension file_size created_at uploaded_by {id name} }` in bounded batches.

Documentation: https://developer.monday.com/api-reference/reference/subitems, https://developer.monday.com/api-reference/docs/querying-board-items and https://developer.monday.com/api-reference/reference/assets-1.

The provider client requires a runtime `MONDAY_API_TOKEN` environment variable; it does not read authentication cookies, write credentials, issue GraphQL mutations or log private source content. It validates **all 87 pinned parent IDs** before treating subitem enumeration as complete and validates **all 148 asset IDs** against provider metadata. Missing pages, null subitem collections, missing assets, wrong parents, duplicates and other identity conflicts fail closed. Even complete asset metadata is **not** file-byte verification: downloaded bytes and original file hashes would still have to be checked separately. No temporary provider `public_url` is persisted.

The output is private exclusive-create JSON (mode 0600), located outside the repository. Provider access without a token returns BLOCKED_PROVIDER_CREDENTIAL, not a fabricated success. A complete provider response only yields PROVIDER_METADATA_RECONCILED and **ready_for_production=false**.

## Locally reproducible provider call

Run on the authorized Mac with a separately available approved **read-only** monday.com API token in process environment; never put it in the command, repo, CI variables, screenshots, or ChatGPT:

```sh
python3 scripts/talkbox-provider-evidence.py \
  --manifest "$HOME/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01J-private-migration-manifest.json" \
  --inventory "$HOME/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01L-private-media-inventory.json" \
  --output "$HOME/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01M-provider-reconciliation.json"
```

The script reads `MONDAY_API_TOKEN` only from the environment. It does not retrieve or store original media bytes. To avoid overwriting previous evidence, use a new output name for each distinct capture.

## Existing and remaining acceptance

The previously merged 01K/01L isolated PG17 candidates stage authentic source metadata, verify original authors/time strings, maintain 70 reply-parent relationships, and reject real shadow activation when child or media evidence is unavailable. They do not modify production CRM records.

The new 01M CI workflow uses synthetic-only fixtures to validate provider response completeness, exact identity, parent lineage, asset batches and private output behavior. No real user account or token is required in CI.

**Final production gates:** independent provider-backed original subitem IDs/parent mapping (or complete provider-confirmed zero), attachment byte retrieval and checksums for the 148 source assets or explicit source-missing disposition, genuine signed archived-inclusive CRM reconciliation, approved history-preserving activation and rollback acceptance, and separate approval before real production backfill. No RLS/RBAC policy, role, permission, Supabase project, credential or production historical data change is included.

**Closeout classification:** provider-reader IMPLEMENTED-UNVERIFIED on live account; synthetic CI verification pending; actual source subitems and attachment bytes BLOCKED; production migration PENDING.
