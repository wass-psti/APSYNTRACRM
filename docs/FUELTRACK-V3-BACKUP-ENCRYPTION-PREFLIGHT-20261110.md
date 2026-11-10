# FuelTrack+ v3 — Authenticated backup encryption preflight

Date: 2026-11-10. Classification: ISOLATED COMPONENT ONLY.
PR #185; mandatory recovery blocker #189.

## Implemented

scripts/ft3-backup-crypto.mjs encrypts an existing local backup FILE with
AES-256-GCM and a new random nonce per invocation. The output envelope has
a versioned header and authentication tag. Decryption writes a new local
file only when authentication succeeds. Existing destinations are protected
from overwrite; truncated or modified ciphertext and incorrect keys are
rejected. Output permissions are owner-only.

The tool accepts an exactly 32-byte raw key from an owner-only local FILE.
It does not create keys or provide key escrow. It does not export a live
database, package folders, transfer data offsite, schedule backups, implement
immutable storage or perform Supabase provider physical restoration.

## Synthetic test evidence

Seven disposable local tests cover ciphertext integrity, authenticated
roundtrip, incorrect key refusal, overwrite denial, unsafe permissions,
truncation and invalid inputs. No private production archive or key was used.

## Operational approval remains outstanding

The requested offsite backup activation requires the specific approved
provider/bucket and cost, the retention duration, capture cadence,
credential and encryption-key custody, permission/deletion controls,
failure handling, and an explicit decision regarding the mandatory
provider physical-backup rehearsal. These details are not present in
the current approval record, and no destination is configured.

This increment uses no live production data, no outside network transfer,
no new background agent and no new provider configuration.

## Example for disposable local data only

    node scripts/ft3-backup-crypto.mjs encrypt /private/test.tar /private/test.tar.ft3enc /private/owner-only-key
    node scripts/ft3-backup-crypto.mjs decrypt /private/test.tar.ft3enc /private/restored-test.tar /private/owner-only-key

Do not commit encryption keys, plaintext data or private manifest files.
A lost encryption key makes backup files unrecoverable. Production remains
NO-GO pending provider physical-backup recovery or approved alternative
and full 24-hour RPO/RTO acceptance.
