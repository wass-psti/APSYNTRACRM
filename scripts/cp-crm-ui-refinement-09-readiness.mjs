/** Read-only diagnostic of the user's existing Chromium window.
 * Never creates a browser, navigates, reads credentials, or changes settings.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const OUTPUT = "/tmp/cp-crm-ui09-readiness.json";

export function classifyWindow({
  windowTitle,
  eventWindowCount,
  width,
  height,
  error,
}) {
  const isCrm =
    typeof windowTitle === "string" &&
    windowTitle.startsWith("APSYNTRA CRM — Workspace");
  const geometryValid =
    Number.isFinite(width) &&
    width > 0 &&
    Number.isFinite(height) &&
    height > 0;
  const blockers = [];
  if (error) blockers.push(`AX_READ_FAILED: ${String(error).slice(0, 180)}`);
  if (!isCrm) blockers.push("EXISTING_CRM_TAB_NOT_FOREGROUND");
  if (!geometryValid) blockers.push("WINDOW_GEOMETRY_UNAVAILABLE");
  if (!Number.isInteger(eventWindowCount) || eventWindowCount < 1)
    blockers.push("CHROMIUM_APPLE_EVENTS_WINDOWS_UNAVAILABLE");
  return {
    status: blockers.length ? "BLOCKED" : "READY_FOR_WINDOW_GEOMETRY_ONLY",
    existingCrmWindowObserved: isCrm && geometryValid,
    appleEventsWindowCount: eventWindowCount,
    measuredWindow: geometryValid ? { width, height } : null,
    signedRouteInteractionsCertified: false,
    independentRoleCertified: false,
    physicalTouchCertified: false,
    blockers,
  };
}

function apple(script) {
  try {
    return execFileSync("osascript", ["-e", script], {
      encoding: "utf8",
      timeout: 7000,
    }).trim();
  } catch (error) {
    return { error: String(error.stderr || error.message).trim() };
  }
}

function inspect() {
  const windowCountResult = apple(
    'tell application "Chromium" to return count of windows',
  );
  const axResult = apple(`tell application "System Events"
    tell process "Chromium"
      if (count of windows) is 0 then error "NO_CHROMIUM_WINDOW"
      set selectedWindow to window 1
      set wSize to size of selectedWindow
      return (name of selectedWindow) & linefeed & (item 1 of wSize) & linefeed & (item 2 of wSize)
    end tell
  end tell`);
  const lines = typeof axResult === "string" ? axResult.split(/\r?\n/) : [];
  const title = lines[0] || null;
  const width = lines.length === 3 ? Number(lines[1]) : null;
  const height = lines.length === 3 ? Number(lines[2]) : null;
  const count =
    typeof windowCountResult === "string" && /^\d+$/.test(windowCountResult)
      ? Number(windowCountResult)
      : null;
  const error = [windowCountResult?.error, axResult?.error]
    .filter(Boolean)
    .join("; ");
  return classifyWindow({
    windowTitle: title,
    width,
    height,
    eventWindowCount: count,
    error,
  });
}

if (process.argv[1]?.endsWith("cp-crm-ui-refinement-09-readiness.mjs")) {
  const result = inspect();
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + "\n", {
    mode: 0o600,
  });
  console.log(JSON.stringify(result));
  if (result.status === "BLOCKED") process.exitCode = 2;
}
