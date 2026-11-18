# CP-TB-NATIVE-01J — Historical Source Lineage and Controlled Migration Preflight

Date: 2026-11-18
Repository: wass-psti/APSYNTRACRM
Supabase project: existing jtlusodorfnyzgyuewkz
Status: **Source issue/reply identity VERIFIED; full legacy parity BLOCKED; production migration NOT EXECUTED**

## Authoritative evidence observed

The authenticated monday.com board export for source board 18370784140 was acquired in CP-TB-NATIVE-01E and preserved outside the repository. SHA-256:

fcd0893d2f3e9a4f631a0a160f638b7641c39ab82a1b379e6f8379e3d86b667a

The strengthened read-only verifier produced:

- 87 unique issue IDs: statuses Done 66, Working on it 12, Stuck 9.
- 1,129 distinct discussion post IDs; all 1,129 reference one of the 87 source issues.
- 70 explicit reply-to-post relationships spanning 46 distinct parent posts.
- Zero missing parent post IDs, zero cross-issue references, zero self-references and zero cycles.
- 51 discussion posts with asset ID references. The workbook preserves the *references*, not independent proof that original attachment bytes are available for migration.
- All export discussion author and created-at cells were populated; 0 update text cells exceeded the existing 20,000-character RPC cap.
- The additional Time tracking worksheet has three populated source rows beyond its heading; do not infer imported tracking semantics from these raw rows.

## Outstanding subitem provenance

All 87 source issue cells in the exported Subitems column are empty and the authenticated Excel export, despite selecting Subitems, produced no independent subitem-ID sheet. A direct authenticated navigation to reported source subitem board 18371220520 previously redirected to source parent board 18370784140. The existing CRM legacy projection reports a different subitem board 18370784141. **These observations do not prove historical subitems never existed**, nor establish any source subitem ID/parent relationship.

Consequently, source subitem lineage remains NOT ESTABLISHED. No title-based, position-based or cross-board inferred matches are permitted.

## Current destination baseline (read-only production SQL)

- Four existing CRM Toolbox issue rows, all archived; zero active.
- No existing issue has a stored authoritative monday source ID.
- Three CRM discussion rows, one CRM subitem, no CRM update rows with parent_update_id.
- This is an administrative *read-only* destination baseline; it is not a complete authenticated signed-user archived-record snapshot. The older signed listing excluded archived records.
- Two original archived CRM records and two previously disposed acceptance records remain preserved.

## Executable-free migration preparation

- scripts/talkbox-source-audit.py now validates reply-to-post identity, same-issue lineage, cycles, missing IDs and source count; reports only aggregate data.
- scripts/talkbox-migration-manifest.py creates a local private JSON manifest of original source item IDs, issue fields, post IDs, original author/date/content, reply-parent IDs, asset references and raw tracking rows, with **parent posts before children**.
- The manifest generator requires a pinned source workbook SHA-256; refuses unexpected source count or broken relationships; refuses writing inside repository; writes mode 0600 using exclusive create (no accidental overwrite).
- Private output: ~/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01J-private-migration-manifest.json (NOT committed, shared or uploaded).
- Deterministic manifest SHA-256: ffd63a92a83c2284f7f75d454bcd55eb0fe00c061c482853ade1dc4f825decbf.
- The manifest unconditionally marks source subitem provenance NOT_ESTABLISHED, original author mapping NOT_ESTABLISHED, history-preserving destination RPC NOT_IMPLEMENTED, ready_for_migration=false and production_writes_authorized=false. It is **not a migration executor**.

Rebuild privately, choosing a NEW output filename (existing files are not overwritten):

```sh
python3 scripts/talkbox-migration-manifest.py \
  "$HOME/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01E-authenticated-source.xlsx" \
  --expected-count 87 \
  --expected-sha256 fcd0893d2f3e9a4f631a0a160f638b7641c39ab82a1b379e6f8379e3d86b667a \
  --output "$HOME/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01J-new-private-manifest.json"
```

## Why the historical import is blocked

The existing signed toolbox_issues_create_issue RPC can retain additional payload metadata, but toolbox_issues_add_update creates records as the *current signed user at the current time*, does not accept original source post IDs or original parent-post IDs, and cannot restore original author/time. Replaying 1,129 historical posts with this RPC would create new records with fabricated provenance, flatten 70 replies, and lack a verified idempotency key. Assets and time-tracking relationships also remain unresolved.

A complete migration requires independently authoritative subitem provenance (or verified absence), a complete signed archived-inclusive destination snapshot, a history-preserving and workspace-scoped import contract with source-ID uniqueness/idempotent receipts and rollback, original author mapping rules, asset and time-tracking disposition, a fresh source snapshot/reconciliation, and the applicable production-data write approval. No production write was attempted.

## Verification

- Synthetic Python source lineage + private manifest tests: 11/11 PASS.
- Authenticated original source audit: PASS, all 70 replies verified.
- Pinned-source manifest regeneration: deterministic SHA-256, parent-first order and mode 0600 PASS.
- Existing frontend TalkBox tests: 15/15 PASS.
- Full frontend regression and production Vite build: see current PR CI and local test results.
- No RBAC/RLS policies, roles, grants, database migrations, credentials or production issue content changed.

**Closeout:** Source issue, post, and reply lineage verified; deterministic private manifest implemented. Production migration and final source-to-CRM parity remain BLOCKED on evidence/fidelity and an authorized data-write path. Continue as CP-TB-NATIVE-01K instead of claiming signoff.
