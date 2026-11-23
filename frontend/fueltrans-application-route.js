/** CRM-native FuelTrans route; the existing FuelTrans board remains its data source. */
import { WORK_MANAGEMENT_BOARD_IDS } from "./workspace-application-ownership.js";

export const FUELTRANS_APPLICATION_ROUTE = "#/fueltrans";
export const FUELTRANS_BOARD_ID = WORK_MANAGEMENT_BOARD_IDS.fueltrans;

export function fuelTransApplicationHref(route = "") {
  const suffix = String(route || "").replace(/^\/+|\/+$/g, "");
  return suffix
    ? FUELTRANS_APPLICATION_ROUTE + "/" + suffix
    : FUELTRANS_APPLICATION_ROUTE;
}

export function parseFuelTransApplicationRoute(parts) {
  if (!Array.isArray(parts) || parts[0] !== "fueltrans") return null;
  const route = parts.slice(1).filter(Boolean).join("/") || "dashboard";
  return Object.freeze({
    route,
    canonicalHash: fuelTransApplicationHref(route === "dashboard" ? "" : route),
  });
}
