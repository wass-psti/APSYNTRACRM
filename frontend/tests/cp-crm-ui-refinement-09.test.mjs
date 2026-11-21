import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyWindow } from "../../scripts/cp-crm-ui-refinement-09-readiness.mjs";

const source = readFileSync(
  "scripts/cp-crm-ui-refinement-09-readiness.mjs",
  "utf8",
);
const crm = {
  windowTitle: "APSYNTRA CRM — Workspace - Chromium",
  width: 1200,
  height: 850,
  eventWindowCount: 1,
};

test("selected existing CRM is readiness only, never certified", () => {
  const result = classifyWindow(crm);
  assert.equal(result.status, "READY_FOR_WINDOW_GEOMETRY_ONLY");
  assert.equal(result.existingCrmWindowObserved, true);
  assert.equal(result.signedRouteInteractionsCertified, false);
  assert.equal(result.independentRoleCertified, false);
  assert.equal(result.physicalTouchCertified, false);
});
test("unavailable Apple Events explicitly blocks interactive automation", () => {
  const result = classifyWindow({ ...crm, eventWindowCount: 0 });
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.blockers.includes("CHROMIUM_APPLE_EVENTS_WINDOWS_UNAVAILABLE"),
  );
});
test("missing Apple Events result cannot pass", () => {
  const result = classifyWindow({ ...crm, eventWindowCount: null });
  assert.equal(result.status, "BLOCKED");
});
test("different foreground tab and absent geometry never pass", () => {
  const result = classifyWindow({
    windowTitle: "Paseo de Lomboy - Chromium",
    eventWindowCount: 0,
    width: null,
    height: null,
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.existingCrmWindowObserved, false);
  assert.ok(result.blockers.includes("EXISTING_CRM_TAB_NOT_FOREGROUND"));
  assert.ok(result.blockers.includes("WINDOW_GEOMETRY_UNAVAILABLE"));
});
test("read failures cannot become false readiness", () => {
  const result = classifyWindow({ ...crm, error: "Accessibility unavailable" });
  assert.equal(result.status, "BLOCKED");
});
test("diagnostic never launches browser or reads app storage or session secrets", () => {
  assert.doesNotMatch(
    source,
    /chromium\.launch|launchPersistentContext|remote-debugging-port|sessionStorage|localStorage|password|cookie|auth\.uid/,
  );
  assert.match(source, /mode: 0o600/);
});
