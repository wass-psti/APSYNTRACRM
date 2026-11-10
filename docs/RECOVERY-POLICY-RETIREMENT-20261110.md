# WatchdogWorkspace / APSYNTRA CRM — Recovery Policy Retirement Decision

**Status: OWNER AUTHORIZED. Effective November 10, 2026.**

The owner explicitly retired these release requirements across the
entire WatchdogWorkspace, APSYNTRA CRM and integrated applications:

- Mandatory 24-hour Recovery Point Objective (RPO).
- Mandatory 24-hour Recovery Time Objective (RTO).
- Mandatory provider physical-backup or disaster-recovery rehearsal.
- Mandatory independent or immutable offsite backups.
- AWS S3/IAM/Object Lock backup project from the active roadmap.

These constraints are retired permanently unless a later owner decision
changes the policy. They are not deferred mandatory release checkpoints.
This record and config/production-release-policy.json supersede older
issues, CI gates and documents that treated these requirements as binding.

## Controls retained

- Existing Supabase provider backups remain enabled where available.
- No backups, actual private Storage objects, local archives or encryption
  keys are deleted by this policy change.
- Signed authentication, RBAC/RLS, workspace isolation, existing private
  Storage receipt policy, database integrity, audit, deployment protections,
  operational ownership and safe migration practices remain required.
- Real application validation includes valid and denied actions, revoked
  sessions, cross-workspace isolation, durable persistence and signed UI.
- This policy change is not itself authorization to change production
  data, roles, IAM, credentials, or previously protected access policies.

## Roadmap and release consequences

- AWS backup deployment work in draft FuelTrack PR #185 is RETIRED from
  mandatory scope, not authorized for activation.
- Existing archive/recovery/encryption tools can remain optional utilities
  and historical evidence but cannot block application release.
- Supabase provider physical restoration, mandatory recovery drill,
  measured 24h RPO/RTO and sustained offsite cadence are NOT APPLICABLE
  as project release requirements.
- FuelTrack production acceptance now concerns its approved schema,
  exact workspace/Board scope, Option A receipt visibility, signed
  authorization/denials, audit, persistence, CI and deployment.

## Risk and verified scope

Retiring numerical objectives means there is no guaranteed maximum
loss of data or duration of an outage, and hosted recovery has not been
certified. Preserving native backups is prudent but does not guarantee
a successful restore. This explicit project-wide policy decision
does not imply that the risk disappears.

Policy retirement: AUTHORIZED/IMPLEMENTED.
Data/security protections: RETAINED.
Existing backup deletion: NOT AUTHORIZED.
Production app activation: PENDING genuine contract and security evidence.
