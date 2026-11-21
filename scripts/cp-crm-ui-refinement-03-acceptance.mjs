/** Runs a one-shot read-only live UI audit in the user's *existing* Chromium tab.
 * macOS + Apple Events required. No alternate browser/profile/port is opened.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const site = "wass-psti.github.io/APSYNTRACRM/";
const source = resolve("scripts/cp-crm-ui-refinement-03-existing-tab.js");
const nap = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
function apple(sourceCode, args = []) {
  return execFileSync("osascript", ["-e", sourceCode, ...args], {
    encoding: "utf8",
    timeout: 12000,
  }).trim();
}

const activateExistingTab = `
tell application "Chromium"
  repeat with w in windows
    set tabIndex to 0
    repeat with t in tabs of w
      set tabIndex to tabIndex + 1
      if URL of t contains "${site}" and URL of t does not contain "staging" then
        set active tab index of w to tabIndex
        set index of w to 1
        activate
        return "EXISTING_CRM_TAB_ACTIVE"
      end if
    end repeat
  end repeat
end tell
error "Open the existing APSYNTRA CRM tab before running acceptance"
`;
const executeExistingTab = `
on run argv
  set javascriptSource to read POSIX file (item 1 of argv)
  tell application "Chromium"
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t contains "${site}" and URL of t does not contain "staging" then
          return execute t javascript javascriptSource
        end if
      end repeat
    end repeat
  end tell
  error "Existing CRM tab not found"
end run
`;
const getResult = `
tell application "Chromium"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "${site}" and URL of t does not contain "staging" then
        return execute t javascript "JSON.stringify(window.__crmUI03Live || {status:'missing'})"
      end if
    end repeat
  end repeat
end tell
error "Existing CRM tab not found"
`;

console.log(apple(activateExistingTab));
console.log(apple(executeExistingTab, [source]));
let report;
for (let attempt = 0; attempt < 65; attempt++) {
  await nap(1000);
  report = JSON.parse(apple(getResult));
  if (report.status === "complete") break;
}
if (report?.status !== "complete")
  throw Error("Timed out reading live acceptance; do not certify");
const skipped = report.menuChecks.filter((row) => row.skipped);
const problems = [
  ...report.errors,
  ...report.routes
    .filter((row) => row.overflow !== 0)
    .map((row) => `${row.requested}: ${row.overflow}px page overflow`),
  ...report.menuChecks
    .filter(
      (row) =>
        !row.skipped &&
        (!row.open || row.expanded !== "true" || !row.fits || !row.items),
    )
    .map((row) => `${row.route}: menu ${row.index} failed geometry or ARIA`),
];
const outcome = {
  result: problems.length ? "FAILED" : skipped.length ? "BLOCKED" : "PASS",
  routes: report.routes.length,
  menuChecks: report.menuChecks.length,
  skippedMenuChecks: skipped.length,
  problems,
  details: report,
};
const output =
  process.env.CRM_UI03_OUTPUT ||
  "/tmp/cp-crm-ui-refinement-03-live-results.json";
writeFileSync(output, JSON.stringify(outcome, null, 2) + "\n");
console.log(
  JSON.stringify({
    result: outcome.result,
    routes: outcome.routes,
    menuChecks: outcome.menuChecks,
    problems: outcome.problems,
    output,
  }),
);
if (
  problems.length ||
  skipped.length ||
  report.routes.length !== 10 ||
  report.menuChecks.length < 2
)
  process.exitCode = 1;
