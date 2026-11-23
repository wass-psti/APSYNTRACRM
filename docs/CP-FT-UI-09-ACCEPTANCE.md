# CP-FT-UI-09 — Independent approval contract and non-destructive registry-import dry run

**Date:** November 23, 2026
**Repository:** `wass-psti/APSYNTRACRM`
**Base:** `ba69cc1` (CP-FT-UI-08, PR #801)
**Scope disposition:** Implemented dry-run/approval-readiness code; **no actual owner-approved source, production registry import, or complete CRM-host two-account certification**.

## Findings and decision

1. The 19 supplied FuelTrans Support Portal screenshots are workflow and design references, **not an independently verified station registry**, deployment list, access credentials or source-owner approval.
2. Fresh local source search in the accessible project, Downloads and Documents folders did not uncover an owner-approved station CSV/XLSX/JSON. Targeted connected-mail searches for FuelTrans station directories and station-list attachments found no matching messages. Earlier read-only Supabase checks established that no public station/registry table had been activated; **no production schema or data writes** were authorized or required.
3. Existing CP-FT-UI-06/07/08 tests establish genuine **disposable GoTrue credentials and real PostgREST ticket writes** through the actual FuelTrans native module, **but emulate the CRM host API**. They do not certify two independent logins through the complete CRM host.
4. A free-text approval reference from CP-FT-UI-08 is an owner *claim*, not independently verified approval. Simply marking a client flag `authorityVerified: true` would be insufficient.

**Recommendation:** Require a cryptographic receipt signed against an **independently provisioned owner public key** and bound to the exact station metadata SHA-256, workspace ID, owner, source reference and revision. Do not embed any signer key, private key, arbitrary permission changes, hosted DB connections or automatic import logic in the public application. Demonstrate only a **dry-run diff** until verified source and server requirements are available.

## Implemented

### 1. Unsigned owner approval request (browser, no write)

From **FuelTrans → Recorded Stations → Compare an existing station CSV**:

- Validate CSV and produce the existing CP-FT-UI-07 candidate fingerprint and CP-FT-UI-08 owner-review packet.
- New **Download unsigned owner approval request** action creates `fueltrans-station-approval-unsigned-N.json`.
- Request binds the current workspace, exact candidate metadata fingerprint and proposed source-owner information. Its `approvedAt` is `null`, the status is `UNSIGNED_REQUEST_NOT_VERIFIED` and its flags remain `authorityVerified:false`, `registryActivated:false`, `sourceImported:false`.
- The source owner must independently confirm and sign a completed statement; **the application does not sign, approve, or import anything**. A typed reference is never treated as a valid signature.

### 2. Independently verifiable Ed25519 receipt contract

`frontend/fueltrans/station-import-plan09.js`:
- Defines a **stable, explicitly ordered UTF-8 JSON statement**, which includes schema, workspace UUID, source metadata SHA-256, owner, source reference, revision and UTC approval timestamp. The signer must sign the exact output of `stationApprovalMessage(statement)`.
- Requires a receipt with `schema: fueltrans-station-approval-receipt-v1`, `signerId`, `statement` and base64url Ed25519 `signature`.
- Looks up the signer only in a **separately supplied** trusted owner public-key set. A key bundled in the receipt is never accepted. The repository ships **no trusted owner keys**, so without independent key provisioning verification rejects.
- Validates the signature using native Web Crypto Ed25519. Invalid key, signature, workspace, owner, source fingerprint/revision or staging metadata is rejected.

**Important:** A cryptographically valid signature from an arbitrary supplied key does *not* independently establish the key holder's organizational authority. The organization must validate public-key ownership through a separate trusted channel.

### 3. Deterministic and non-destructive registry import dry run

After verifying the receipt, `prepareStationImportDryRun`:
- Re-hashes the staged records and checks the exact source metadata fingerprint and record count.
- Validates that rows contain **only** client, station ID and station name. Rejects conflicting or duplicate source/target IDs and extra fields.
- Produces sorted `add`, `rename`, `unchanged` and `missingFromSource` sets for a **supplied snapshot**. Absent existing records are **never deleted**.
- Returns status `SIGNATURE_VERIFIED_PLAN_ONLY_NOT_IMPORTED` with `registryActivated:false`, `sourceImported:false`, and a warning that the signer trust anchor must itself be vetted.
- Contains **no Supabase, RPC, SQL, network write or hosted registry activation code**.

### 4. Offline verifier

`scripts/cp-ft-ui09-station-import-dry-run.mjs`:

```bash
node scripts/cp-ft-ui09-station-import-dry-run.mjs \
  staging.json signed-owner-receipt.json trusted-owner-public-keys.json \
  00000000-0000-4000-8000-000000000000 current-station-snapshot.json
```

The UUID above is a **syntax-only placeholder**, not a real workspace ID.

- All five inputs are required. Files are read locally with a 2 MB limit; the command uses no network or database.
- A trusted-key file contains a JSON list of `{ "signerId": "...", "publicKey": "<base64url-32-byte-Ed25519-public-key>" }`. This public key must be obtained and authenticated independently; a key copied from the approval receipt is not authoritative.
- The snapshot file is an **explicit user-supplied input**. An empty array means that supplied snapshot is empty; it must not be represented as a verified empty production registry.
- Successful output is **JSON to stdout only**; there is no migration or database import.
- Do not put private signing keys, AnyDesk secrets, passwords, or access tokens in these files or in application source.

## Verification

Tests generate **ephemeral Ed25519 test keys**, not real station-owner credentials. They check:
- Positive cryptographic verification with an explicitly supplied test trust key and correct workspace/fingerprint;
- Deterministic no-op and add/rename/unchanged/missing diff calculation;
- Rejection of an unknown signer, no trust key, wrong public key, changed approval time, wrong workspace, tampered source rows, duplicate IDs and extra credential columns;
- CLI positive output and negative exit code; no files written;
- Unsigned approval request cannot become a signed receipt or activate the registry;
- Existing local source review, Create Ticket, GoTrue/PostgREST RLS and responsive browser regressions.

**Completion gates:** full repository tests, syntax/lint/check/build, synthetic Chromium owner-request download, disposable real-GoTrue/native browser workflow, clean CI, PR merge, main CI, successful GitHub Pages and read-only signed-in production smoke. Record each independently.

## Unresolved reference parity (all 19 supplied screenshots)

| Screenshot group | Existing state | Remaining dependency |
|---|---|---|
| 1 Dashboard | Native summary and source-based metrics | Original historical dashboard figures |
| 2 Client / Location | Four active client cards, verified form interactions, ticket-history suggestions | Canonical source assets, owner-approved station master |
| 3–6 Classification / Create Ticket | Five-stage verified Create Ticket process and private drafts | Reference three-step presentation, exact source template and full visual parity |
| 7 Queue | Source-backed queue and filtering | Original live record set |
| 8–12 Details / Timeline | Real disposable create → claim → escalation → resolution → readback | Original credentials/device deployments, audit/evidence and full CRM-host acceptance |
| 13 Global L1 | Real L1 account in isolated FuelTrans native browser | Genuine full CRM host two-account signed lifecycle and trusted roster |
| 14–15 Shift Handover | Current shift/flag UI | Authoritative engineer roster and shift schedule |
| 16 Station Manager | Candidate CSV review → staging → owner review → unsigned request → signed-receipt dry-run contract | Trusted signer key, exact owner-approved source and reviewed permanent server schema/import |
| 17 Analytics | Existing analytics modules | Source-backed historical metrics and visual certification |
| 18–19 Report Issue | Existing issue workflow | Full source-defined issue/evidence flow and pixel certification |

**These reference screens are assessed, not certified as pixel-perfect.**

## Next dependency-driven checkpoint

**CP-FT-UI-10 — Independently Attested Source Activation, Disposable Full CRM-Host Login Acceptance, and Outstanding Reference Parity.**

Do not initiate server import until an owner-controlled station export/API and independently confirmed approval key/receipt for the **same workspace, SHA-256 and revision** are available. A server import must be atomic, auditable, idempotent, restricted to the approved source, and reversible; its readback and client/workspace isolation must be tested in disposable PostgreSQL first. Genuine CRM host acceptance additionally requires a fully isolated or explicitly approved nonproduction host with at least two independent signed-in users. Remaining reference data/logos/shifts require actual source material.

**Inference-only:** No gradient descent, backpropagation, retraining, fine-tuning, model-weight updates, background training tasks or model-training dependencies were introduced or executed.
