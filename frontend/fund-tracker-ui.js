/** Semantic CRM-native Fund Tracker renderer; all mutable state stays in the host controller. */
import { renderFRTFinanceReadOnly } from "./frt-finance-ui.js";

const escape = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character],
  );

function statusLabel(result, busy) {
  if (busy) return "Refreshing signed financial data";
  if (result?.status === "PASS") return "Signed financial data connected";
  if (result?.status === "BLOCKED") return "Financial data unavailable";
  return "Waiting for signed financial data";
}

export function renderFundTrackerNative({
  result = null,
  busy = false,
  detailResult = null,
  detailBusy = false,
  selectedRequestId = null,
  statusFilter = "all",
  view = "tracker",
} = {}) {
  const role =
    typeof result?.role === "string" && result.role !== "UNVERIFIED"
      ? result.role
      : "Signed access pending";
  const companyName =
    result?.companies?.find((company) => company.code === result.companyCode)
      ?.name || "Select an authorized company";

  return (
    '<section class="frt-native" data-fund-tracker-root aria-label="Fund Tracker application">' +
    '<div class="frt-application-shell">' +
    '<header class="frt-app-header">' +
    '<div class="frt-app-brand">' +
    '<span class="frt-app-mark" aria-hidden="true">₱</span>' +
    '<div><span class="frt-app-eyebrow">APSYNTRA CRM · FINANCIAL OPERATIONS</span>' +
    '<h1>Fund Tracker <span>Fund Release Management</span></h1>' +
    '<p>Fund requests, approvals, disbursement vouchers and liquidation.</p></div>' +
    "</div>" +
    '<div class="frt-app-session" aria-label="Application session status">' +
    '<span class="frt-app-role">' +
    escape(role) +
    "</span>" +
    '<span class="frt-app-sync" role="status">' +
    escape(statusLabel(result, busy)) +
    "</span>" +
    "</div></header>" +
    '<div class="frt-app-context"><span>Current company</span><strong>' +
    escape(companyName) +
    "</strong></div>" +
    '<main class="frt-app-content">' +
    renderFRTFinanceReadOnly({
      result,
      busy,
      detailResult,
      detailBusy,
      selectedRequestId,
      statusFilter,
      view,
    }) +
    "</main>" +
    '<footer class="frt-app-footer"><span>APSYNTRA CRM · Fund Tracker</span>' +
    "<span>Existing FRT financial records remain authoritative; the CRM Board is a separate operational mirror.</span></footer>" +
    "</div></section>"
  );
}
