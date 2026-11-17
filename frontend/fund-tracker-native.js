/**
 * Fund Tracker native adapter entrypoint.
 *
 * Existing FRT domain clients remain authoritative for signed reads, request
 * search, financial projections and lifecycle operations. This adapter gives
 * the CRM host one stable application-facing contract without creating a
 * parallel RPC client, state store, schema or financial workflow.
 */
import {
  loadFRTFinanceReadOnly,
  projectFRTAging,
  searchFRTRequestsReadOnly,
} from "./frt-finance-readonly.js";

export { projectFRTAging };
export {
  parseFRTAccountingCents,
  formatFRTAccountingCents,
  projectFRTAccountingSnapshot,
  validateFRTAccountingLines,
} from "./frt-accounting.js";
export { projectFRTCompanyProfile } from "./frt-company-profile.js";
export { projectFRTWorkflowProgress } from "./frt-workflow-progress.js";
export { projectFRTVoucherSnapshot } from "./frt-voucher.js";
export { validateFRTReceipts } from "./frt-liquidation.js";
export { describeFRTBankExecution } from "./frt-bank-execution.js";

export class FundTrackerNativeClient {
  constructor({ auth, api } = {}) {
    if (!auth || !api)
      throw new TypeError("Fund Tracker requires the existing signed AuthClient and DomainApi.");
    this.auth = auth;
    this.api = api;
  }

  snapshot({ companyCode = null, includeIntercompany = false, searchQuery = "" } = {}) {
    return loadFRTFinanceReadOnly({
      auth: this.auth,
      api: this.api,
      companyCode,
      includeIntercompany,
      searchQuery,
    });
  }

  searchRequests(query, { limit = 20 } = {}) {
    return searchFRTRequestsReadOnly({
      auth: this.auth,
      api: this.api,
      query,
      limit,
    });
  }
}
