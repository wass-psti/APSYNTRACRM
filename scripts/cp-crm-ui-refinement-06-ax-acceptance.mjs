/** One-shot Accessibility fallback against the existing visible CRM Chromium tab.
 * A real desktop-window resize does not certify a physical mobile device.
 */
import { execFileSync } from "node:child_process";
import { statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const script = resolve(
  "scripts/cp-crm-ui-refinement-06-ax-viewport.applescript",
);
const outputPath = "/tmp/cp-crm-ui06-acceptance.json";
const expected = [1200, 800, 390];
const startedAt = Date.now();
let output = "";
let exception = null;
try {
  output = execFileSync("osascript", [script], {
    encoding: "utf8",
    timeout: 30000,
  }).trim();
} catch (error) {
  exception = String(error?.stderr || error?.message || error)
    .trim()
    .slice(0, 500);
}
const measurements = [];
let original = null;
let restored = null;
const blockers = exception ? [exception] : [];
for (const line of output.split(/\r?\n|\r/g)) {
  const fields = line.trim().split("|");
  if (fields[0] !== "CP06") continue;
  if (fields[1] === "ORIGINAL")
    original = { width: Number(fields[2]), height: Number(fields[3]) };
  if (fields[1] === "RESTORED")
    restored = { width: Number(fields[2]), height: Number(fields[3]) };
  if (fields[1] === "ERROR") blockers.push(fields.slice(2).join("|"));
  if (fields[1] === "MEASURED") {
    const requestedWidth = Number(fields[2]);
    const measuredWidth = Number(fields[3]);
    const height = Number(fields[4]);
    const imagePath = `/tmp/cp-crm-ui06-existing-${requestedWidth}.png`;
    let screenshotBytes = 0;
    let screenshotRecent = false;
    try {
      const imageStats = statSync(imagePath);
      screenshotBytes = imageStats.size;
      screenshotRecent = imageStats.mtimeMs >= startedAt - 2000;
    } catch {
      /* Missing screenshot is a failed check. */
    }
    measurements.push({
      requestedWidth,
      measuredWidth,
      height,
      screenshotBytes,
      screenshotRecent,
    });
    if (screenshotBytes === 0)
      blockers.push(`${requestedWidth}px screenshot unavailable`);
    else if (!screenshotRecent)
      blockers.push(`${requestedWidth}px screenshot is stale`);
    if (Math.abs(measuredWidth - requestedWidth) > 24)
      blockers.push(
        `Requested ${requestedWidth}px but Chromium was ${measuredWidth}px wide`,
      );
  }
}
if (!original || !restored)
  blockers.push("Original/restored window geometry could not be verified");
if (original && restored && Math.abs(original.width - restored.width) > 2)
  blockers.push("Original Chromium window width was not restored");
if (
  measurements.length !== expected.length ||
  measurements.some((item, index) => item.requestedWidth !== expected[index])
)
  blockers.push("Incomplete responsive breakpoint sampling");
const result = {
  status: blockers.length ? "BLOCKED" : "PASS",
  scope:
    "Existing Mac Chromium window geometry and locally captured screenshots only",
  mobileTouchCertified: false,
  roleSpecificCertified: false,
  original,
  restored,
  measurements,
  blockers,
};
writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
if (blockers.length) process.exitCode = 1;
