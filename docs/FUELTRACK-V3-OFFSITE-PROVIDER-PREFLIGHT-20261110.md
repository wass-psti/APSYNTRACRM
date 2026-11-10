> **Superseded recovery policy — 2026-11-10:** The owner retired mandatory
> 24-hour RPO/RTO, disaster-recovery rehearsal and AWS/offsite backup
> release gates across WatchdogWorkspace/APSYNTRA CRM. References below
> to their mandatory status are historical only. Existing backups,
> authentication, RBAC/RLS, audit and signed acceptance remain required.
> See [current owner decision](RECOVERY-POLICY-RETIREMENT-20261110.md).

# FuelTrack+ v3 — Offsite Provider and Immutable Retention Preflight

Date: November 10, 2026.
Status: PROVIDER EVALUATION AND OFFLINE CHECKS IMPLEMENTED; ACTIVATION NOT AUTHORIZED.
Related: PR #185 and recovery issue #189.

## Provider selection

**Candidate A — AWS S3 with Object Lock COMPLIANCE.** Amazon documents
version-level protection against deletion and replacement, including by
the AWS root user, until a specified retention time. This is the preferred
candidate for strict non-bypassable retention. Activating Compliance mode
is consequential and irreversible during the configured retention period
and can incur costs; no bucket or mode was activated.

https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html

**Candidate B — Cloudflare R2 with bucket locks.** R2 lock rules prevent
deletion/overwriting under configured scopes, but authorized administrators
can alter/remove the lock rules. Acceptability depends on the threat model.

https://developers.cloudflare.com/r2/buckets/bucket-locks/

No provider account, bucket, region, retention period, budget or credentials
were selected or authorized. The recommendation is not an approval.

## Implemented isolated policy evaluator

scripts/ft3-offsite-policy-preflight.mjs checks a private, non-secret JSON
plan against the existing project, supported providers, private access,
authenticated client encryption, recoverable key custody, DB/Auth/private
Storage capture coverage, a sub-24-hour capture interval, owner-approved
duration and budget, separate writer/restore/admin principals, an append-only
writer, strong S3 Compliance settings or full-prefix R2 lock rules, actual
provider verification, restoration and project-wide recovery requirements.

The evaluator rejects fields that appear to contain credential material.
It does NOT call an external cloud provider or inspect real IAM settings.
Even a fully conforming declarative plan cannot attest that provider
controls were activated or that recurring backups exist. The evaluator
always reports NO_GO, external verification false, and no activation.

Twelve disposable synthetic tests cover safe-looking plans, unsafe
provider settings, mutable locks, privileged writer actions, incorrect
cadence, missing Storage coverage, secret fields, invalid roles and
missing encryption key custody.

## Outstanding approval boundaries

The authorized record still lacks offsite provider account/bucket,
retention duration, cost approval, capture cadence, credential and
encryption-key custody, scheduled execution and any separate approval to
replace the mandatory provider physical-backup rehearsal.

This increment does NOT create cloud infrastructure, move real production
data, set immutable retention, install backup jobs, mint new credentials or
modify production SQL. Such steps require separate scoped authorization
and genuine provider-side read-only and restore evidence.

PR #185 remains DRAFT; production remains NO_GO.
