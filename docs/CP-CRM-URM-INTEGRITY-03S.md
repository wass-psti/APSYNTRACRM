# CP-CRM-URM-INTEGRITY-03S — TradeLink role-aware native readback

## Production findings — November 20, 2026

Two independent signed active users share the same Work Management workspace: pseudonymous Employee key `b1e02906d0de0c62` and Administrator key `74085cf92fe5c39a`. Both were verified by signed `wm_auth_access_context` and `apsyntra_crm_my_effective_access` HTTP 200 responses.

The genuine Employee's four existing application assignments were verified via read-only database readback:

| Application | Persisted native role | Signed native initial + refresh |
|---|---|---|
| TimeTracker | Employee | VERIFIED / VERIFIED |
| Fund Tracker | REQUESTOR | VERIFIED / VERIFIED |
| FuelTrack+ | User | VERIFIED / VERIFIED |
| TradeLink | User | VERIFIED / VERIFIED |

For all eight Employee phases, matching canonical native Boards and domain HTTP 200 responses were observed with zero HTTP/page errors. No production role or business data was written.

### TradeLink Administrator false negative

The earlier native acceptance probe expected only `tl03_assigned_documents` for TradeLink. This is the Employee/reviewer read endpoint. The Administrator uses `tl03_documents_page` for server-wide authorized documents (with the existing `tl03_documents_list` compatibility fallback). The older probe marked the Administrator's native TradeLink page FAILED even while it returned a correct native Board HTTP 200 and no page/HTTP errors, because it ignored the successful manager domain endpoint.

The only source change adds both pre-existing Administrator endpoints to TradeLink's signed native readback contract. The same verifier still requires a signed account, expected native module/Board, successful domain HTTP 200, rendered application, and zero unexpected errors on initial navigation **and refresh**. It neither adds permissions nor changes role assignment logic.

With the corrected verifier, the genuine Administrator TradeLink native readback passed both phases: native Board HTTP 200, `tl03_documents_page` HTTP 200, zero HTTP/page errors.

### Role-mutation disposition

Existing Work Management Employee assignments are already persisted and effective across four applications, including the Fund Tracker native role-source fix in merged PR #642. A production assignment mutation or restoration was not executed because the current assignments were correct and making an artificial change would affect a live employee. Existing nonproduction role-writer/contract tests remain applicable; this checkpoint makes no role, grant, RLS, workspace, or domain-data writes.

**Acceptance:** Employee native four-app persistence/refresh VERIFIED; Administrator TradeLink role-aware readback VERIFIED; signed role mutation **NOT EXECUTED / NOT REQUIRED FOR THIS DEFECT**. No additional production defect established.
