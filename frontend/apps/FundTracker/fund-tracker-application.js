/** CRM-native Fund Tracker route and existing-board discovery. */
import { FRT_BOARD_ID, isFRTBoardReference } from "../../frt-board-reference.js";

export const FUND_TRACKER_APPLICATION_ROUTE = "#/fund-tracker";
export const FUND_TRACKER_MODULE_ID = "frt";

const companyCodePattern = /^[A-Za-z0-9_-]{1,32}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolve the existing FRT board. This function never provisions or mutates a board. */
export function findFundTrackerBoard(boards) {
  if (!Array.isArray(boards)) return null;
  return (
    boards.find(
      (board) => board?.id === FRT_BOARD_ID && isFRTBoardReference(board),
    ) || null
  );
}

/** Parse a request deep link without trusting malformed route segments. */
export function parseFundTrackerRecordRoute(parts) {
  if (
    !Array.isArray(parts) ||
    parts[0] !== "fund-tracker" ||
    parts[1] !== "record" ||
    typeof parts[2] !== "string" ||
    typeof parts[3] !== "string"
  )
    return null;

  let companyCode = "";
  let requestId = "";
  try {
    companyCode = decodeURIComponent(parts[2]);
    requestId = decodeURIComponent(parts[3]);
  } catch {
    return null;
  }
  if (!companyCodePattern.test(companyCode) || !uuidPattern.test(requestId))
    return null;
  return Object.freeze({ companyCode, requestId });
}

/** Canonical native request link used by global search and notification navigation. */
export function fundTrackerRecordHref(companyCode, requestId) {
  if (
    typeof companyCode !== "string" ||
    !companyCodePattern.test(companyCode) ||
    typeof requestId !== "string" ||
    !uuidPattern.test(requestId)
  )
    return FUND_TRACKER_APPLICATION_ROUTE;
  return (
    FUND_TRACKER_APPLICATION_ROUTE +
    "/record/" +
    encodeURIComponent(companyCode) +
    "/" +
    encodeURIComponent(requestId)
  );
}
