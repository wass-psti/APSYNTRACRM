# CP-TL-LEGACY-WORKFLOW-05 and CP-TL-REVISION-HISTORY-01

**Application:** APSYNTRA CRM — TradeLink
**Repository:** wass-psti/APSYNTRACRM
**Base:** main at 75ae2877d28092303d9f0895513f3bd48ad8483a
**Scope:** Signed Analytics deployment reconciliation and immutable document revision retrieval/reprinting.

## Analytics reconciliation

- The current source sets TL03_ANALYTICS_ENABLED=true and keeps automatic document numbering disabled.
- The User Manual source describes the existing signed, read-only aggregate RPC. The earlier browser tab displayed older manual copy and had not been refreshed after the current main deployment.
- The existing public.tl03_analytics_summary function is installed. Catalog inspection verified authenticated EXECUTE, no anon EXECUTE, SECURITY INVOKER and an empty search_path.
- Production aggregate inspection returned three active Quotations, zero approved ESI invoices with due dates and zero completed Payment AR records. Empty tax/aging results must remain explicitly unavailable/empty, never fabricated.
- GitHub Pages and APSYNTRA CRM Frontend Validation both completed successfully for main commit 75ae2877d28092303d9f0895513f3bd48ad8483a.
- Genuine signed-browser navigation, network observation of tl03_analytics_summary, rendered aggregate verification and refresh acceptance remain pending because the authorized Desktop Commander connection is paired but its monthly remote-control quota is exhausted. Do not claim browser acceptance from CI or the feature flag.

## Immutable revision snapshots

The current TradeLink document row stores only the latest payload. Existing event rows contain metadata rather than the full historical payload, so earlier overwritten document contents cannot be reconstructed.

The forward migration adds:

- private.tradelink_document_revision_snapshots, keyed by document_id and revision.
- A baseline snapshot of each existing document's current revision, clearly marked baseline.
- Automatic snapshot capture for each new revision.
- A database guard requiring document content/number/type changes to advance the revision exactly once.
- Append-only snapshot behavior.
- public.tl03_document_revision_bundle for current revision metadata and exact selected-revision retrieval.
- Existing TradeLink manager checks are reused; the new read RPC is granted to authenticated only, and snapshot-table access is not granted directly.

All Documents adds a revision history view. Every revision is selectable; only a revision with two distinct assigned reviewer records whose signed actor emails match the saved assignments is marked Approved and offered for reprinting. Historical output uses the saved payload, original company/template assignment and exact revision number.

## Compatibility and limits

- Existing tl03_document_read and current document-save contracts remain unchanged.
- Reviewer assignments, review RPCs, approval transitions, automatic numbering behavior and the six company templates remain unchanged.
- Existing records receive only their current payload as a baseline snapshot. Missing pre-activation revisions are shown as unavailable rather than reconstructed.
- Browser Print / Save as PDF remains a print copy, not electronic PDF issuance.
- The official template documentation reports A4; the existing print CSS was Letter. This implementation aligns the two @page rules to A4. Browser visual/PDF inspection remains part of signed-runtime acceptance.

## Verification plan

- PostgreSQL 17 disposable setup: existing save and two-review migrations, pre-migration record fixture, revision snapshot migration, immutable/update guards, exact historical retrieval, approved-only print eligibility and existing manager-boundary acceptance.
- Frontend tests: signed revision-bundle normalization, exact revision RPC arguments, revision history UI, historical print gating, analytics flag/manual consistency and truthful empty analytics states.
- CI and Pages deployment must be rechecked against the resulting commit.
- Production migration application and live signed-browser acceptance are separate runtime gates; no production business record is created or altered by the migration backfill.

## CP-TL-REVISION-HISTORY-02 — deployment-order compatibility

A frontend deployment may precede production activation of the new immutable
revision-bundle RPC. The signed TradeLink client now handles **only** the exact
PostgREST `PGRST202` (missing function) response by retrieving the current
signed document via the pre-existing `tl03_document_read` RPC. This temporary
path does not fabricate historical snapshots, revisions, or approval evidence;
revision history is shown as unavailable and an attempted historical revision
remains unavailable. Current approved-document printing retains the existing
signed workflow-state, current-revision, current Board linkage and workspace
checks. Other errors, including authorization denials, never use the fallback.

After migration activation, the revision-bundle RPC remains authoritative and
all historical print eligibility uses two independent saved reviewer events.
The compatibility path adds no role, policy, privilege, database write or
credential requirement. Migration approval, live signed historical reprint and
PDF visual acceptance remain independent pending steps.
