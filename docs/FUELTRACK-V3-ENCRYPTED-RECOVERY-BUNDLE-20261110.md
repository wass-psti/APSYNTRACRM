# FuelTrack+ v3 — Encrypted recovery bundle integration

Date: November 10, 2026.
Status: VERIFIED IN ISOLATED DATA; AWS AND PRODUCTION NOT ACTIVATED.
Related: PR #185; recovery blocker #189.

## Scope of implementation

The new one-shot local integration at
scripts/ft3-encrypted-recovery-bundle.mjs consumes a previously staged,
integrity-verified local logical PostgreSQL and private Storage recovery
set. It does not capture new database transactions or Storage versions.

The integration:
- Requires a private staged set with an existing SQL and Storage SHA-256
  manifest and provenance explicitly identifying a historical copy.
- Confirms the staged files match the manifest before packaging.
- Packages the complete set, including its manifest and provenance,
  into an on-demand local tar file.
- Encrypts that file with the existing AES-256-GCM helper, using a caller-
  supplied owner-only 32-byte key file. No key is generated or exported.
- Decrypts the final encrypted file to a temporary local verification copy.
- Restores the temporary archive contents and verifies SQL and private
  Storage payload hashes and recovery-set provenance.
- Cleans temporary plaintext packaging and verification files.
- Refuses to overwrite an existing finished encrypted output.
- Explicitly reports no independent new snapshot, no offsite transfer, no
  immutability guarantee and production release NO_GO.

This is an integration of already existing staging and cryptographic
components, not new AWS/S3 client integration. No production credentials,
AWS account, IAM principal, bucket or hosted recovery provider were
used. The previously created CloudFormation blueprint remains
non-deployed pending its separate approval.

## Isolated verification

Six synthetic integration tests passed:
1. Full staged SQL+private Storage encrypted roundtrip.
2. Refusal to overwrite existing ciphertext.
3. Invalid encryption key rejection with no finished output.
4. Tampered source refusal before encrypted publication.
5. Forged new-capture provenance rejection.
6. Source-nested encrypted output refusal.

The test suite uses only disposable files and ephemeral keys and is
wired into existing GitHub FuelTrack backend acceptance CI.

## Explicit limitations

The existing archive reflects a historical recovery set. Repackaging
it cannot establish new capture time or rolling database/Storage RPO.
The encrypted bundle has not been uploaded to an offsite provider, and
its recoverability depends on securely retained key custody.
Successful local decryption does not demonstrate AWS Object Lock,
provider physical-backup restore, complete hosted service restoration,
or the binding 24-hour RPO/RTO.

No scheduled backups or background agents were added. No production
data, permissions or infrastructure were changed.

## Remaining approval and execution requirements

- Approved AWS account/region/bucket, Compliance retention duration,
  IAM trust principals, expense limits and encryption-key custody.
- Provider-side read-only evidence of S3 Object Lock, public access
  blocking, SSE, versioning and effective IAM allowed/denied operations.
- A reviewed whole-project live database/Auth/private Storage capture
  protocol, safe data export, consistent snapshot boundaries and actual
  encrypted offsite upload using scoped credentials.
- Sustained capture cadence and immutable retention evidence, full
  isolated restoration, 24-hour project-wide RPO/RTO assurance.
- Official Supabase physical-backup rehearsal or an explicit
  separately approved recovery architecture exception.
- Genuine signed FuelTrack functionality acceptance before release.

PR #185 remains draft and the production release is NO_GO.
