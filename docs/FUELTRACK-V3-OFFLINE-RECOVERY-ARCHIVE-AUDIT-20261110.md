# FuelTrack v3 — Offline Recovery Archive Integrity Audit

Date: 2026-11-10
Classification: VERIFIED LOCALLY, NOT PROVIDER PHYSICAL RESTORE
Linked release: PR #185; recovery blocker #189.

## Purpose and boundaries

This one-shot local audit verifies SHA-256 integrity of the November 9
WatchdogWorkspace logical SQL archive and the actual private Storage object
bytes. It is not a backup agent, fresh backup, provider physical restore,
hosted recovery rehearsal, Storage RPO monitor or RTO certificate.

It does not contact Supabase, modify the production database or Storage,
upload files, install software, or put private backup content into GitHub.

The existing archive contains the SQL exports full-schema.sql, data.sql,
remaining-data.sql, local-roles.sql and real private Storage objects under
storage/. The tool requires nonempty regular files with owner-only permissions,
rejects symbolic links, checks SHA-256 for each file and creates an owner-only
manifest outside the archive. Verification rejects changed file count, path,
size or checksum. The manifest contains relative paths and hashes and must
remain on the owner's machine, since file names may reveal identifiers.

## Actual November 10 result

- SQL files: 4
- Private Storage objects: 5
- Total checked payload: 13,209,995 bytes
- Manifest: owner-only, filesystem mode 0600, outside repository
- Integrity verification: ARCHIVE_INTEGRITY_PASS
- Negative tests: missing SQL, tampered Storage, symbolic links, insecure
  permissions, misplaced manifest and empty Storage are all rejected
- Unit tests: 8/8 PASS
- Provider physical recovery, hosted RTO and rolling RPO: UNVERIFIED
- Production release: NO_GO

## Manual on-demand verification

Run from the APSYNTRA CRM checkout:

    umask 077
    ARCHIVE="$HOME/WatchdogWorkspace/.recovery-rehearsal/ws02d-20261109"
    EVIDENCE="$HOME/WatchdogWorkspace/.recovery-rehearsal/ft3-integrity-evidence"
    mkdir -p "$EVIDENCE"
    chmod 700 "$EVIDENCE"

First-time create (fails if the manifest exists):

    node scripts/ft3-recovery-archive-audit.mjs --archive "$ARCHIVE" --create-manifest "$EVIDENCE/ws02d-20261109-sha256.json"

Subsequent verification:

    node scripts/ft3-recovery-archive-audit.mjs --archive "$ARCHIVE" --verify-manifest "$EVIDENCE/ws02d-20261109-sha256.json"

Do not commit or paste the manifest or raw archives. Do not silently
regenerate checksums when an existing source file changes.

## Outstanding release requirements

This historic copy cannot establish the mandatory rolling 24-hour RPO,
measured 24-hour hosted RTO or recoverability of provider physical backups.
Recovery issue #189 and production NO-GO remain active. A provider exception
or separately authorized recovery architecture decision is still required.
