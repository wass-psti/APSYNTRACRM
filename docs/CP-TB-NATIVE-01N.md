# CP-TB-NATIVE-01N — Read-only provider readback and original media integrity

Date: November 19, 2026.
Repository: wass-psti/APSYNTRACRM.
Scope: source-only evidence acquisition, never production CRM data writes.

## Source and operational evidence

The authorized Mac Desktop Commander endpoint was recovered and the pinned private original monday workbook, immutable source manifest and media inventory are intact. The official read-only provider collector was executed and returned BLOCKED_PROVIDER_CREDENTIAL. The Monday token was not present in the Mac terminal process. No real provider API response, signed provider subitem enumeration, or original attachment bytes were obtained. An authenticated monday.com browser session is not equivalent to a terminal-usable official GraphQL credential.

Source workbook SHA-256: fcd0893d2f3e9a4f631a0a160f638b7641c39ab82a1b379e6f8379e3d86b667a.
Original issue IDs: 87. Discussion posts: 1129. Threaded reply links: 70. Asset IDs: 148 (referenced across 51 posts).
Subitem identity and historic zero-subitem claim remain NOT_ESTABLISHED. File byte count verified from authoritative provider: 0.

## Implemented asset-byte recovery

- scripts/talkbox-provider-evidence.py now requests the officially documented, one-hour-lived public_url from monday's assets GraphQL API, without persisting it in the metadata evidence manifest. The output also records a provider readback timestamp.
- scripts/talkbox-provider-byte-recovery.py runs the same pinned private manifest and inventory checks and validates all 148 returned provider asset identities before downloading files. Requires an approved process-scoped MONDAY_API_TOKEN; never reads browser cookies and never posts data to CRM.
- Each source asset downloads to a file named for its immutable provider ID in an outside-repository, private local directory. It validates HTTPS and supported provider/CDN hostnames through redirects, rejects size mismatches and partial responses, computes SHA-256 on actual bytes, and creates a mode-0600 independent JSON receipt with the original filename/size/ID. Existing receipts are read back and rehashed; corrupt or conflicting files are refused, not overwritten. Incomplete downloads are not promoted to verified files.
- scripts/talkbox-recovery-readiness.py verifies original issue-ID count, provider child-to-parent IDs and all 148 asset IDs against the pinned source. It independently rehashes every original file/receipt and produces an exclusive-create private readiness *evidence* report. It never grants production-write approval: ready_for_production=false regardless of a successful source-only capture.
- No historical author or timestamp is fabricated or rewritten; the existing isolated 01K/01L original-history staging candidates remain unchanged.

Use only on the authorized machine with an approved read-only provider token present in its environment. Do not put tokens in the repository, shell transcript, CI, or ChatGPT. The original, pinned source files stay outside Git.

First run provider metadata collection using the 01M documented command. Then:

```sh
python3 scripts/talkbox-provider-byte-recovery.py \
  --manifest "$HOME/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01J-private-migration-manifest.json" \
  --inventory "$HOME/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01L-private-media-inventory.json" \
  --output-dir "$HOME/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01N-assets"

python3 scripts/talkbox-recovery-readiness.py \
  --manifest "$HOME/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01J-private-migration-manifest.json" \
  --inventory "$HOME/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01L-private-media-inventory.json" \
  --provider-evidence "$HOME/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01M-provider-reconciliation.json" \
  --asset-directory "$HOME/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01N-assets" \
  --output "$HOME/.apsyntra-work/talkbox-source-evidence/CP-TB-NATIVE-01N-source-readiness.json"
```

The two tools must not run without an actual authorized provider token and complete source-backed metadata. Asset download URLs are short-lived and must be fetched afresh.

## Verification and remaining blockers

The new focused tests exercise byte download/replay/size/host/checksum failures, original receipt mismatch, incomplete provider evidence and the synthetic complete-source path. Synthetic fixtures never carry real personal data or original assets.

Full original source parity, historical archived items, original provider subitem IDs (or authoritative provider-confirmed zero), byte-verified original 148 assets, signed CRM archival reconciliation, target migration and original-timezone semantics still require real evidence and separate production-data write approval.

No Supabase migrations, new project, RLS/RBAC/grants/roles, production issue records, source records, or secrets were changed. The user's functionality-first baseline remains intact.

**Closeout:** Source recovery tooling VERIFIED on synthetic acceptance; live source API and original bytes BLOCKED by unavailable provider read credential; historical production migration and final parity PENDING.
