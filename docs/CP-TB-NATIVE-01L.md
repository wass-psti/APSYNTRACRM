# CP-TB-NATIVE-01L — Authenticated provenance and controlled shadow activation

Date: November 18, 2026.
Status: **SHADOW ACTIVATION VERIFIED LOCALLY; HISTORICAL PRODUCTION ACTIVATION BLOCKED.**

## Authenticated source findings

The signed monday TalkBox parent board 18370784140 remains accessible. The available authenticated XLSX export SHA-256 is fcd0893d2f3e9a4f631a0a160f638b7641c39ab82a1b379e6f8379e3d86b667a. It contains 87 issue identities, 1,129 post identities, 70 same-issue reply links and 51 posts with source asset IDs.

A fresh examination of the original private manifest established **148 unique numeric asset IDs** across those 51 posts. No original binary files are embedded in the XLSX. The reported subitem-board URL 18371220520 still redirects to parent board 18370784140. There are no independent subitem identity/parent records in the exported sheets, and the parent sheet's Subitems values are blank for all 87 source rows. **Do not treat blank cells or the redirect as verified zero historical subitems.**

Source-created timestamps are exported as display strings (day/month name/year and 12-hour clock). The migration staging contract retains original raw date strings rather than guessing timezone or silently changing temporal meaning.

## Private asset inventory

scripts/talkbox-media-inventory.py reads the previously pinned private manifest, validates the source workbook SHA-256, and creates a deterministic, restricted (0600), exclusive-create JSON inventory **outside the repository**. Each unique asset ID retains its referencing source post IDs; source URL, filename and file SHA-256 are explicitly null, with state BYTES_UNVERIFIED. This tool does not download files or claim missing bytes are verified.

Private inventory location on authorized Mac:
~/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01L-private-media-inventory.json

Inventory SHA-256: 82e4d064ce924d1f6e004104b21a7099cb25e93fb35572f445d4e870f289477e.

No personal source content or private manifest has been uploaded to GitHub or CI.

## Shadow-only activation candidate

supabase/migration-candidates/cp_tb_native_01l_shadow_activation.sql extends the verified CP-TB-NATIVE-01K isolated staging contract. It creates private shadow receipt, issue and post tables to exercise source-to-destination mapping **without touching any production or real Toolbox tables**. It is deliberately not a Supabase deployment migration.

The private stage/activate functions preserve unique source IDs, original author names, raw export timestamps, original text, reply links, and asset references. A transaction-level advisory lock prevents concurrent duplicate shadow activation. A second run is idempotent; any conflicting source or evidence receipt is rejected. Missing evidence and null JSON fields are rejected explicitly (a real defect surfaced by the synthetic negative tests and corrected).

Shadow activation requires **independent zero-subitem evidence** and a complete media evidence inventory keyed by the source's unique asset IDs, including nonempty byte size and hashes. These are evidence *claims* only; independent verification of the claimed source binary against an authoritative provider receipt remains necessary before a production import. Synthetic fixtures can exercise the positive path; the authentic source cannot.

private.tb_legacy_verify_shadow independently checks record counts, source IDs, preserved author/date/body, parent reply IDs, source asset reference strings and row digests. A modified shadow author is rejected on replay. The candidate returns ready_for_production=false even after successful synthetic activation. It grants no access to authenticated or anonymous roles. Existing CRM functionality, RLS/RBAC, account permissions and production historical data remain unchanged.

## Local acceptance

Executed on an isolated Docker PostgreSQL 17 database without production credentials or public exposed ports. Synthetic tests verified:
- missing zero-subitem proof / media array / media checksums / history policy -> denied;
- valid fully synthetic evidence -> shadow activation, idempotent replay;
- source asset ID mismatch / missing claimed bytes -> denied;
- original author, timestamp and threaded post source identities -> preserved;
- altered evidence -> rejected;
- tampered shadow record -> detected;
- concurrent identical requests -> serialized into one activation and one no-op;
- private shadow tables remain unavailable to normal application roles;
- no public Toolbox issue tables were created or changed.

Authentic pinned 01J source manifest was staged read-only, then deliberately **denied** shadow activation because its subitem provenance is unverified and the source asset bytes have not been collected. 87 historical issues and 1,129 discussions remain unimported to the production CRM.

Full automated synthetic checks also run in CI. No real source history is ever uploaded to CI.

## Remaining production gates

1. Obtain an authoritative provider-backed subitem enumeration with original child ID and parent source issue ID, or a verifiable provider-side zero count. The URL redirect is not sufficient.
2. Retrieve the 148 historical source assets with verified original IDs, bytes, filenames/MIME/checksums; account for deleted/unavailable media without inventing data.
3. Confirm original source authorship/timezone semantics and render that history distinctly in a signed CRM view, not under the importing operator's identity.
4. Review and implement the **separate** production-target transactional activation/reconciliation design, including archived-inclusive signed readback, unique source mapping, concurrency, rollback and all denied paths. The current SQL creates private *shadow* records only, not live Toolbox issues.
5. Obtain the required separate approval for material historical production writes before any backfill; then run genuine production readback and parity reconciliation.

**Closeout:** CP-TB-NATIVE-01L implements verified media inventory and safe shadow activation. Historical source retrieval and real production parity remain BLOCKED. Next milestone CP-TB-NATIVE-01M — provider-backed source retrieval and production activation readiness.
