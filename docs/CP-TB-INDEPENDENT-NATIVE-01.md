# APSYNTRA CRM TalkBox — Independent Native Functionality 01

Date: November 20, 2026. Repository: wass-psti/APSYNTRACRM.

## Architecture and independence

TalkBox is the existing native APSYNTRA CRM route #/talkbox hosted by the existing Toolbox Issues board. The runtime uses CRM's signed DomainApi, existing Supabase project, Toolbox RPCs and private Toolbox attachments Storage bucket. There is **no runtime call to monday.com**; no provider API token, external database, federation, synchronization, mirroring or runtime dependency. Original provider audit scripts remain offline and separate; none of the recovered historical source assets are copied into the CRM production database.

The existing backend contracts, workspace membership, authentication, roles, permissions and RLS remain intact. No new project, service or authorization gate was added.

## Features implemented

- Server-backed title/status filtering, cursor pagination, refresh and workspace-scope reset. Issue detail is independently re-fetched during list refresh.
- Native issue create and edit, status, optional target date and version-checked signed second-read persistence verification.
- Existing comments and subtask creation/status writes retained; subtask name editing with signed second-read check added.
- Manual persisted time-tracking hour/minute corrections, separated from ordinary issue edits so no unrelated tracking metadata is overwritten.
- Confirmed archive action with all-page active-list readback using the existing archive RPC; no existing records archived during this implementation.
- Native private issue attachments upload/download using the already-existing private bucket and register_attachment RPC. Files are validated against the bucket's 50 MiB cap, written using the current CRM JWT (not a service-role key), registered against the exact issue and path, read back through a signed issue GET, and binary-verified against the original SHA-256. Download always revalidates the signed issue's attachment record and byte size. A failed registration is treated as uncertain, not blindly retried.
- Escaped issue, subtask and attachment labels; update author/timestamp display; removed obsolete provider synchronization notice.
- Exact existing domain RPC mutation allowlist and CSS bundle rebuilt for cache coherence, without changing permission rules.

## Verification and boundaries

Focused native tests exercise successful and denied mutations, input validation, list filtering, archive pagination, native attachment integrity and write/read mismatches. The complete frontend regression and production build are required in CI. Production bucket and RPC signatures were independently confirmed with read-only Supabase queries.

**No production Toolbox issue, update, subtask or attachment was created, edited or archived during acceptance.** The frontend feature contracts are implemented and locally unit-tested, but genuine signed-user production write/read/refresh testing still requires a disposable test record and operational approval.

Remaining incomplete native feature parity: workspace-wide assignee picker (the existing Toolbox module directory lists only the caller), reply threads, running timer semantics, attachment removal and genuine two-account cross-session acceptance. These are separate from historical source migration, which the user has not requested for this independent architecture.

## Next milestone

CP-TB-INDEPENDENT-NATIVE-02 — CRM-Native Workspace Assignee Directory, Threaded Updates, Running Time Tracking, Complete Private Attachment Lifecycle, and Genuine Signed Two-Account Refresh/Reopen Acceptance.

No monday.com dependency or new authorization restrictions should be introduced. Material production data changes require their separate approval.
