# CP-TB-NATIVE-01Q — Signed monday.com readback without extracting API credentials

Date: November 20, 2026 (Asia/Manila).
Repository: wass-psti/APSYNTRACRM.
Scope: source-only historical reconciliation; no CRM historical production writes or authorization changes.

## Signed provider authentication

The authorized MacBook's authenticated Brave monday Developer Center contains an API Playground at the signed-in account's /apps/playground route. Executing a read-only GraphQL me ID query returned a valid server response. This is a real signed provider connection; no token was read, extracted, regenerated, persisted or sent to ChatGPT. Official monday.com documentation confirms that the signed-in API Playground can execute GraphQL queries without re-authentication.

The previous terminal-only helper returned BLOCKED_PROVIDER_CREDENTIAL because MONDAY_API_TOKEN was not configured. The browser-connected source capture implementation removes this dependency without weakening provider authentication or touching session secrets.

## Genuine parent and child enumeration

The original private 01J manifest is pinned to SHA-256 ffd63a92a83c2284f7f75d454bcd55eb0fe00c061c482853ade1dc4f825decbf. It provides 87 distinct canonical original parent IDs. A single large GraphQL items(ids:) query returned only 25 results despite requesting 87. Therefore the new implementation uses five separate items(ids:) queries with at most 20 IDs each. It compares the exact provider-returned set in every batch with the requested set, verifies each item's board is 18370784140, and independently confirms original child IDs and parent_item IDs, with no inference from blank workbook cells.

The genuine authenticated readback returned 87/87 parent IDs and 0 currently accessible subitems, using the expected source IDs and a complete non-null subitems array for every parent. This does not independently establish an immutable historical zero for previously deleted or inaccessible subitems.

## Genuine asset metadata and original bytes

The private 01L inventory is pinned to SHA-256 82e4d064ce924d1f6e004104b21a7099cb25e93fb35572f445d4e870f289477e. The live signed provider API returned metadata for 148/148 original asset IDs in eight bounded batches (20 or fewer IDs). Declared total source binary size is 441,065,131 bytes (~420.63 MiB), with largest file ~93.08 MiB.

scripts/talkbox-authenticated-playground.py uses the signed-in browser GraphiQL editor, submits only read-only queries, and copies the entire response via the browser's CodeMirror UI to avoid virtualized/truncated DOM text. No tokens or credentials enter the script. It never commits or logs original user content, filenames, or expiring original asset URLs.

The 01N/01O private recovery validates approved HTTPS/CDN hosts, original file sizes, computes SHA-256 receipts, refuses to overwrite verified assets, and independently rehashes on replay. The browser bridge feeds provider-issued short-lived URLs directly to the on-Mac downloader, keeping asset bodies and source-only receipts under the private TalkBox evidence directory. Six bounded workers may download independent source files concurrently. Final real acceptance comes from independent source-readiness rehash, not merely the GraphQL metadata response.

## Genuine source recovery outcome (November 20, 2026)

The authenticated private end-to-end run exited 0 and returned SOURCE_RECOVERY_BYTES_RECONCILED. Independent local inventory checks confirmed:
- 87 of 87 original parent identities matched, zero currently accessible child subitems across those parent IDs;
- 148 of 148 original asset IDs retrieved through the signed provider API;
- 148 binary bodies and 148 private receipt files, each with source ID, original filename, declared byte count, and computed SHA-256;
- 441,065,131 original binary bytes on the authorized Mac, no incomplete .part files;
- every source binary/receipt private to the local user, without world/group access;
- source-only report ready_for_production=false, production_writes_authorized=false.

Source original file bytes and historical source names remain exclusively in the private directory. No source binary or personal author metadata was uploaded to GitHub/CI or supplied to a third party.

## Production CRM read-only destination reconciliation

A fresh, strictly read-only Supabase query on the existing APSYNTRACRM project jtlusodorfnyzgyuewkz found: 4 Toolbox issues (all 4 archived), 3 updates, 1 subitem, 0 attachment records; zero issue payloads matching the three sampled legacy source mapping keys monday_item_id, source_item_id, or legacy_monday_id. These are aggregate destination measurements only, not evidence that all alternative external ID mappings have been excluded.

The historical 87 issues, 1,129 posts, 70 replies and 148 original attachments **have not** been imported to those production Toolbox tables. Thus the signed source recovery and attachment completeness gate is VERIFIED, while CRM historical data parity, original author/time presentation, archived-inclusive readback and real production migration remain PENDING.


## Authorized local execution

Open the authenticated monday API Playground in Brave on the authorized Mac. In the repository worktree:

    python3 scripts/talkbox-authenticated-playground.py

For parent lineage only:

    python3 scripts/talkbox-authenticated-playground.py --parents-only

For provider metadata only:

    python3 scripts/talkbox-authenticated-playground.py --metadata-only

The program creates fresh immutable private files with mode 0600 under ~/.apsyntra-work/talkbox-source-evidence. Original assets live under CP-TB-NATIVE-01Q-private-assets. On retries it validates existing immutable file receipts and resumes missing assets, without overwriting original evidence.

## Boundaries

- Original posts: 1,129; original reply edges: 70; historical post author/date strings retained by existing 01K/01L private staging/shadow design.
- Authenticated source readback is not a production migration. Source-only success always reports ready_for_production=false and production_writes_authorized=false.
- No production Toolbox issues, posts, subitems, attachments, roles, grants, or RLS/RBAC altered.
- Archived/deleted historical subitems are not proven absent by a current-provider zero count; the source export has no independent child-ID ledger.
- Final real data migration requires transactional source-ID mapping, original author/time preservation, signed archived-inclusive CRM readback, and separate approval for material production historical writes.

See PR acceptance evidence for CI and deployment. Never claim production source-to-CRM parity from read-only source capture. Next solid implementation is CP-TB-NATIVE-01R — Reversible Historical Migration Mapping, Archived-Inclusive Signed CRM Readback, and Approved Production Activation.
