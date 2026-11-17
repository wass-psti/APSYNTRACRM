/**
 * Fund Tracker native adapter entrypoint.
 *
 * Existing FRT domain modules remain authoritative. This client is the CRM
 * application's single facade for their signed API calls and projections;
 * it does not create a parallel RPC client, state store, schema or workflow.
 */
import {
  loadFRTFinanceReadOnly,
  projectFRTAging,
  searchFRTRequestsReadOnly,
} from "./frt-finance-readonly.js";
import { createSignedFRTRequest, updateSignedFRTFiling } from "./frt-filing-workflow.js";
import { updateFRTRequestDate } from "./frt-board-date-edit.js";
import { loadFRTPersonAssignment, saveFRTPersonAssignment } from "./frt-board-person-assignment.js";
import { executeFRTDomainAction, frtActionSpec } from "./frt-board-domain-actions.js";
import { loadFRTLiquidation, submitFRTLiquidation } from "./frt-liquidation.js";
import { loadFRTBankExecution, recordFRTBankExecution } from "./frt-bank-execution.js";
import {
  loadFRTComments,
  addFRTComment,
  loadFRTAuditPage,
  frtAuditCsv,
  projectFRTNotifications,
  loadFRTDeadlineSnapshots,
  loadFRTAgingSummary,
} from "./frt-collaboration.js";
import { loadFRTArchive, restoreFRTRequest } from "./frt-archive.js";
import { loadFRTVoucher } from "./frt-voucher.js";
import { loadFRTRequestDetailReadOnly } from "./frt-finance-workflow.js";
import { createFRTICObligation, recordFRTICSettlement } from "./frt-intercompany-client.js";
import {
  loadFRTCompanyProfile,
  saveFRTCompanyProfileWithLogo,
  loadFRTCompanyLogoDataUrl,
} from "./frt-company-profile.js";
import { mountFRTAccountingEditor } from "./frt-accounting.js";
import { FRTRecipientClient } from "./frt-recipient-client.js";

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
export { projectFRTRequestDetail } from "./frt-finance-workflow.js";

export class FundTrackerNativeClient {
  constructor({ auth, api } = {}) {
    if (!auth || !api)
      throw new TypeError("Fund Tracker requires the existing signed AuthClient and DomainApi.");
    this.auth = auth;
    this.api = api;
    this.recipients = new FRTRecipientClient({ auth, api });
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

  createRequest(args = {}) {
    return createSignedFRTRequest({ ...args, auth: this.auth, api: this.api });
  }

  updateFiling(args = {}) {
    return updateSignedFRTFiling({ ...args, auth: this.auth, api: this.api });
  }

  updateRequestDate(args = {}) {
    return updateFRTRequestDate({ ...args, auth: this.auth, api: this.api });
  }

  loadPersonAssignment(args = {}) {
    return loadFRTPersonAssignment({ ...args, auth: this.auth, api: this.api });
  }

  savePersonAssignment(args = {}) {
    return saveFRTPersonAssignment({ ...args, auth: this.auth, api: this.api });
  }

  executeAction(args = {}) {
    return executeFRTDomainAction({ ...args, auth: this.auth, api: this.api });
  }

  actionSpec(code) {
    return frtActionSpec(code);
  }

  loadLiquidation(args = {}) {
    return loadFRTLiquidation({ ...args, auth: this.auth, api: this.api });
  }

  submitLiquidation(args = {}) {
    return submitFRTLiquidation({ ...args, auth: this.auth, api: this.api });
  }

  loadBankExecution(args = {}) {
    return loadFRTBankExecution({ ...args, auth: this.auth, api: this.api });
  }

  recordBankExecution(args = {}) {
    return recordFRTBankExecution({ ...args, auth: this.auth, api: this.api });
  }

  loadComments(args = {}) {
    return loadFRTComments({ ...args, auth: this.auth });
  }

  addComment(args = {}) {
    return addFRTComment({ ...args, api: this.api });
  }

  loadAuditPage(args = {}) {
    return loadFRTAuditPage({ ...args, auth: this.auth, api: this.api });
  }

  auditCsv(events, requestMap) {
    return frtAuditCsv(events, requestMap);
  }

  projectNotifications(args = {}) {
    return projectFRTNotifications(args);
  }

  loadDeadlineSnapshots(args = {}) {
    return loadFRTDeadlineSnapshots({ ...args, api: this.api });
  }

  loadAgingSummary(args = {}) {
    return loadFRTAgingSummary({ ...args, api: this.api });
  }

  loadArchive(args = {}) {
    return loadFRTArchive({ ...args, auth: this.auth, api: this.api });
  }

  restoreRequest(args = {}) {
    return restoreFRTRequest({ ...args, auth: this.auth, api: this.api });
  }

  loadVoucher(args = {}) {
    return loadFRTVoucher({ ...args, auth: this.auth, api: this.api });
  }

  loadRequestDetail(args = {}) {
    return loadFRTRequestDetailReadOnly({ ...args, auth: this.auth, api: this.api });
  }

  createIntercompanyObligation(args = {}) {
    return createFRTICObligation({ ...args, auth: this.auth, api: this.api });
  }

  recordIntercompanySettlement(args = {}) {
    return recordFRTICSettlement({ ...args, auth: this.auth, api: this.api });
  }

  loadCompanyProfile(args = {}) {
    return loadFRTCompanyProfile({ ...args, auth: this.auth, api: this.api });
  }

  saveCompanyProfileWithLogo(args = {}) {
    return saveFRTCompanyProfileWithLogo({ ...args, auth: this.auth, api: this.api });
  }

  loadCompanyLogoDataUrl(args = {}) {
    return loadFRTCompanyLogoDataUrl({ ...args, auth: this.auth, api: this.api });
  }

  mountAccountingEditor(args = {}) {
    return mountFRTAccountingEditor({ ...args, api: this.api });
  }
}
