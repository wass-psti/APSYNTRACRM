# FuelTrack+ v3 — Atomic Recovery Set Staging

Date: November 10, 2026
Classification: LOCAL RECOVERY COMPONENT VERIFIED IN DISPOSABLE TESTS
Release: PR #185, recovery blocker #189

## Implemented

The script scripts/ft3-recovery-set-stage.mjs takes an EXISTING verified
logical SQL database and private Storage archive plus its owner-only
SHA-256 manifest, copies all file bytes into an owner-only local temporary
directory, verifies both original and copied hashes against the preexisting
manifest, and publishes the complete set with a single directory rename.

A partially copied set is not deliberately published. Existing completed
set IDs are rejected. Source and destination must be separate owner-only
directory trees. The tool rejects changed bytes, missing archive files,
symlink archive sources, unsafe manifest paths, insecure destinations and
path traversal.

Each published set has an archive directory containing the original SQL and
private Storage bytes, a private manifest.json, and private provenance.json
marking source capture time UNATTESTED, independentBackupCapture=false,
offsiteRetention=false, immutableRetention=false, and productionRelease=NO_GO.

This is a reusable packaging component for later approved backup
infrastructure. It is NOT a live production backup generator, provider
physical-backup copy, recurring snapshot scheduler, independent offsite
retention, immutable archive service or valid rolling 24-hour RPO proof.

## Verification

Seven focused disposable synthetic tests passed, checking full SQL+Storage
staging, overwrites, tampering, unsafe manifest paths, destination nesting,
symlink sources, open directories and invalid arguments.

No private backup file or manifest was committed to GitHub. No production
credentials, Supabase database, Storage, roles or permissions were changed.

## On-demand operation after destination approval

Example only; no new destination has been approved for production operations:

    node scripts/ft3-recovery-set-stage.mjs \
      --source /private/already-verified-archive \
      --source-manifest /private/source-manifest.json \
      --destination /private/owner-only-staging-root \
      --set-id recovery-set-unique-identifier

The output is a copy of the SAME historical backup, not a new independent
capture even when it has a new ID. Never count it toward rolling capture
cadence or multiple recovery points. File creation time is not the original
database/Storage capture point.

## Remaining separate approval

Operational backups still require an approved encrypted offsite destination,
budget, credentials, immutable retention and deletion controls, authenticated
database and Storage capture, frequency, retention period, completeness,
error response, and a measured whole-project 24-hour RPO/RTO. Replacing the
mandatory provider physical-backup rehearsal also requires separate policy
approval. No ongoing agent or scheduled backup has been installed.

PR #185 remains draft and production release NO-GO.
