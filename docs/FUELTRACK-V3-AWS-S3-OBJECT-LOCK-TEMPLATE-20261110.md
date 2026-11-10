> **Superseded recovery policy — 2026-11-10:** The owner retired mandatory
> 24-hour RPO/RTO, disaster-recovery rehearsal and AWS/offsite backup
> release gates across WatchdogWorkspace/APSYNTRA CRM. References below
> to their mandatory status are historical only. Existing backups,
> authentication, RBAC/RLS, audit and signed acceptance remain required.
> See [current owner decision](RECOVERY-POLICY-RETIREMENT-20261110.md).

# FuelTrack+ v3 — Non-deployed S3 Compliance Object Lock Blueprint

Date: 2026-11-10. Release PR #185. Recovery blocker #189.
Classification: INFRASTRUCTURE TEMPLATE IMPLEMENTED — NOT DEPLOYED.

## Scope

The CloudFormation template at
infra/fueltrack-recovery/s3-object-lock.template.json represents a
candidate AWS S3 recovery bucket with:

- Versioning Enabled
- S3 Object Lock Enabled, Compliance mode only
- A REQUIRED approved retention duration parameter, with no default
- Public access blocked (all four settings)
- BucketOwnerEnforced ownership
- Default server-side AES256 encryption, intended in addition to
  existing client-side authenticated AES-256-GCM backup file encryption
- Bucket-wide HTTPS-only policy
- Retain deletion/replacement protections for the bucket resource
- A dedicated IAM upload role limited to PutObject and AbortMultipartUpload
- A separate restore role limited to GetObject, GetObjectVersion and
  ListBucketVersions
- Explicit existing writer and restore principal ARNs as required inputs
- No broad IAM role administrative permissions and no delete access
- No access keys, profile settings, hardcoded AWS IDs or secret values

The CloudFormation stack would create a new billable AWS bucket and IAM
roles. It has NOT been deployed, previewed against an AWS account or
tested against live provider state. The currently authorized Mac has no
AWS CLI or existing configured backup destination. The local tests
validate JSON structure and the specified security invariants, NOT AWS
CloudFormation template service acceptance, IAM behavior or real
Object Lock compliance.

IMPORTANT: S3 Compliance retention cannot be shortened for protected
versions during the retain-until period. Even the root user cannot
delete those versions early. Versioning allows later new versions, so
the backup application must still employ unique immutable object keys.
An approved retention period, actual account/bucket identity and billable
deployment approval must precede any apply.

## Approval and production dependencies

Do not supply guessed values to CloudFormation or execute a deployment.

Before infrastructure activation, an owner must explicitly confirm:
1. AWS account, region, globally unique bucket name and organization policy
2. Exact retention duration and ongoing cost budget; who may later extend
   retention or manage IAM and what deletion behavior is permitted
3. Separate existing IAM trust-principal ARNs; key custody and recovery
4. Consistent database/Auth/private Storage backup capture, encryption,
   offsite upload and a sub-24-hour proven cadence
5. Read-only AWS confirmation after deployment of bucket versioning,
   public-access blocks, encryption, Object Lock mode/default days and
   actual IAM effective permissions, including explicit denials
6. Successful isolated restore of DB and actual private Storage bytes,
   rolling 24-hour RPO and full hosted 24-hour RTO
7. Supabase physical-backup rehearsal or separately authorized policy change
8. Genuine signed FuelTrack functionality acceptance before production DDL

No backup service, scheduler, credentials, data export, cloud account or
production migration was created by this increment.

## Verification

Nine synthetic infrastructure contract tests detect lock/versioning
downgrades, unapproved retention defaults, public access regression,
missing TLS enforcement, writer deletion and read privilege escalation,
restore-role mutation, wildcard trust changes, and destructive resource
types. The test suite is wired into FuelTrack disposable backend CI.

Official references:
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-configure.html
- https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-s3-bucket.html

Status remains NO-GO until independent recovery and authorization gates pass.
