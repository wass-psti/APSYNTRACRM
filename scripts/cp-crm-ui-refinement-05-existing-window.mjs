/** Test actual responsive breakpoints in the *existing* Chromium window.
 * No new browser or profile. Original window bounds and route are restored.
 * Desktop Chromium at a narrow width is not equivalent to real touch hardware.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

const site = "wass-psti.github.io/APSYNTRACRM/";
const auditFile = resolve("scripts/cp-crm-ui-refinement-05-viewport-probe.js");
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
function runScript(script, args = []) {
  return execFileSync("osascript", ["-e", script, ...args], {
    encoding: "utf8",
    timeout: 12000,
  }).trim();
}
const activate = `
tell application "Chromium"
  repeat with w in windows
    set tabIndex to 0
    repeat with t in tabs of w
      set tabIndex to tabIndex + 1
      if URL of t contains "${site}" and URL of t does not contain "staging" then
        set active tab index of w to tabIndex
        set index of w to 1
        activate
        return id of w as text
      end if
    end repeat
  end repeat
end tell
error "BLOCKED: no controllable existing Chromium CRM window"
`;
const bounds = `
on run argv
  tell application "Chromium"
    return bounds of window id (item 1 of argv as integer) as text
  end tell
end run`;
const resize = `
on run argv
  set targetWidth to item 1 of argv as integer
  set targetWindowId to item 2 of argv as integer
  tell application "Chromium"
    set originalWindow to window id targetWindowId
    if URL of active tab of originalWindow does not contain "${site}" then error "CRM tab changed during viewport acceptance"
    set oldBounds to bounds of originalWindow
    set leftEdge to item 1 of oldBounds
    set topEdge to item 2 of oldBounds
    set bounds of originalWindow to {leftEdge, topEdge, leftEdge + targetWidth, topEdge + 840}
    return "EXISTING_WINDOW_RESIZED"
  end tell
end run`;
const restore = `
on run argv
  tell application "Chromium"
    set bounds of window id (item 5 of argv as integer) to {(item 1 of argv as integer), (item 2 of argv as integer), (item 3 of argv as integer), (item 4 of argv as integer)}
  end tell
end run`;
const runAudit = `
on run argv
  set scriptText to read POSIX file (item 1 of argv)
  set targetWindowId to item 2 of argv as integer
  tell application "Chromium"
    set targetTab to active tab of window id targetWindowId
    if URL of targetTab does not contain "${site}" then error "Original CRM tab no longer selected"
    return execute targetTab javascript scriptText
  end tell
end run`;
const getAudit = `
on run argv
  tell application "Chromium"
    set targetTab to active tab of window id (item 1 of argv as integer)
    if URL of targetTab does not contain "${site}" then error "Original CRM tab no longer selected"
    return execute targetTab javascript "JSON.stringify(window.__crmUI05 || {status:'missing'})"
  end tell
end run`;

const results = [];
let originalBounds;
let selectedWindowId;
let blockedReason = null;
try {
  selectedWindowId = runScript(activate);
  console.log("EXISTING_CRM_WINDOW_SELECTED");
  // AppleScript may separate the four bounds with commas and spaces.
  originalBounds = runScript(bounds, [selectedWindowId])
    .match(/-?\d+/g)
    ?.map(Number);
  if (originalBounds?.length !== 4)
    throw Error("Cannot safely read original window bounds");
  for (const width of [390, 768, 1280]) {
    console.log(runScript(resize, [String(width), selectedWindowId]));
    await pause(600);
    console.log(runScript(runAudit, [auditFile, selectedWindowId]));
    let report;
    for (let iteration = 0; iteration < 30; iteration++) {
      await pause(550);
      report = JSON.parse(runScript(getAudit, [selectedWindowId]));
      if (report.status === "complete") break;
    }
    if (report?.status !== "complete") throw Error(`Timed out at ${width}px`);
    results.push({ targetWidth: width, report });
  }
} catch (error) {
  blockedReason = String(error.message || error).split("\n")[0];
  console.error(`ACCEPTANCE_BLOCKED: ${blockedReason}`);
} finally {
  if (originalBounds) {
    try {
      runScript(restore, [...originalBounds.map(String), selectedWindowId]);
    } catch (error) {
      console.error(`WINDOW_RESTORE_FAILED: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
const issues = results.flatMap((result) => [
  ...(Math.abs(result.report.width - result.targetWidth) > 40
    ? [
        `${result.targetWidth}px: actual CSS viewport ${result.report.width}px does not match target`,
      ]
    : []),
  ...result.report.errors.map((error) => `${result.targetWidth}px: ${error}`),
  ...result.report.routes
    .filter((row) => row.documentOverflow > 1)
    .map(
      (row) =>
        `${result.targetWidth}px ${row.requested}: ${row.documentOverflow}px document overflow`,
    ),
  ...(result.report.routes.length === 10
    ? []
    : [`${result.targetWidth}px: incomplete route coverage`]),
]);
const summary = {
  status: blockedReason ? "BLOCKED" : issues.length ? "FAILED" : "PASS",
  note: "Responsive widths in existing desktop Chromium; no real touch-device certification",
  widths: results,
  blockedReason,
  issues,
};
writeFileSync(
  "/tmp/cp-crm-ui05-live-responsive.json",
  JSON.stringify(summary, null, 2),
);
console.log(
  JSON.stringify({
    status: summary.status,
    viewports: results.map((x) => ({
      target: x.targetWidth,
      measured: x.report.width,
      routes: x.report.routes.length,
    })),
    issues,
  }),
);
if (blockedReason || issues.length || results.length !== 3)
  process.exitCode = 1;
