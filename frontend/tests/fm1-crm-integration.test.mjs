import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
import { workspaceApplicationsForNavigation } from "../workspace-application-routing.js";
import { WORK_MANAGEMENT_WORKSPACE_ID } from "../workspace-identity.js";
const index = readFileSync(
  new URL("../../index.html", import.meta.url),
  "utf8",
);
const components = readFileSync(
  new URL("../fm1/components.js", import.meta.url),
  "utf8",
);
const schema = readFileSync(
  new URL("../fm1/domain/intake-schema.js", import.meta.url),
  "utf8",
);
const apiClient = readFileSync(
  new URL("../fm1/api-client.js", import.meta.url),
  "utf8",
);
const dataLayer = readFileSync(new URL("../data.js", import.meta.url), "utf8");

test("FM1 is integrated into the existing CRM sidebar and hash router", () => {
  assert.match(app, /workspaceApplicationsForNavigation\(state\.context\?\.workspace_id,state\.boards\)/);
  const fm1 = workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID, []).find((item) => item.id === 'fm1-ticketing');
  assert.equal(fm1?.href, '#/fm1');
  assert.equal(fm1?.icon, 'ticket');
  assert.match(
    app,
    /if\(parts\[0\]==='fm1'\)fm1Module=await import\('\.\/fm1\/index\.js'\)/,
  );
  assert.match(
    app,
    /mountFm1Application\(root\.querySelector\('#fm1-application-root'\),\{userId:state\.context\?\.user_id,workspaceId:state\.context\?\.workspace_id,api:db\}\)/,
  );
  assert.match(
    app,
    /state\.view=parts\[0\]==='boards'\?'boards':parts\[0\]==='fm1'\?'fm1'/,
  );
});

test("FM1 reuses the existing CRM HTML entry and loads its stylesheet", () => {
  assert.match(index, /frontend\/app\.js/);
  assert.match(index, /frontend\/apsyntra-styles\.bundle\.css/);
  assert.match(index, /frontend\/fm1-application\.css/);
  assert.doesNotMatch(index, /fm1\/index\.html/);
});

test("FM1 UI mounts through native DOM and submits authoritative server-backed incidents", () => {
  assert.match(components, /export function mountFm1Application/);
  assert.match(components, /export function unmountFm1Application/);
  assert.doesNotMatch(components, /customElements|extends HTMLElement|<fm1-/);
  assert.match(components, /this\.root\.addEventListener\("click"/);
  assert.match(components, /data-fm1-intake-form/);
  assert.match(components, /new Fm1ApiClient\(api\)/);
  assert.match(components, /Submit incident/);
  assert.match(components, /Save local draft/);
  assert.match(components, /data-fm1-action="save-draft"/);
  assert.match(components, /data-fm1-transition-form/);
  assert.match(components, /data-fm1-milestone-form/);
  assert.match(components, /data-fm1-priority-form/);
  assert.match(components, /data-fm1-hold-form/);
  assert.match(components, /data-fm1-hold-review-form/);
  assert.match(components, /data-fm1-hold-end-form/);
  assert.match(components, /Pending requests do not pause SLA clocks/);
  assert.match(components, /Remote and guided diagnosis are blocked/);
  assert.match(components, /data-fm1-inline-error/);
  assert.match(components, /data-fm1-hold-end-form/);
  assert.match(components, /data-fm1-assignment-form/);
  assert.match(components, /data-fm1-conversation-form/);
  assert.match(components, /data-fm1-ticket-filter-form/);
  assert.match(components, /data-fm1-edit-ticket-form/);
  assert.match(components, /data-fm1-warning-policy-form/);
  assert.match(components, /renderReports\(state\)/);
  assert.match(components, /renderNotifications\(state\)/);
  assert.match(components, /renderDuty\(state\)/);
  assert.match(components, /renderPriorityAndHolds\(ticket, detail, state\)/);
  assert.match(components, /idempotencyFingerprint/);
  assert.match(components, /idempotencyKey/);
  assert.match(components, /fm1_validate_hold_v1|validateHold\(/);
  assert.match(components, /Append-only audit chain/);
  assert.match(apiClient, /fm1_create_ticket_v1/);
  assert.match(apiClient, /fm1_ticket_detail_v1/);
  assert.match(apiClient, /fm1_transition_ticket_v1/);
  assert.match(apiClient, /fm1_record_milestone_v1/);
  assert.match(apiClient, /fm1_assign_ticket_v1/);
  assert.match(apiClient, /fm1_add_conversation_v1/);
  assert.match(apiClient, /fm1_update_ticket_v1/);
  assert.match(apiClient, /fm1_operational_report_v1/);
  assert.match(apiClient, /fm1_deadline_warning_policy_v1/);
  assert.match(apiClient, /fm1_update_deadline_warning_policy_v1/);
  assert.match(apiClient, /fm1_notification_inbox_v1/);
  assert.match(dataLayer, /NON_BOARD_DOMAIN_RPC/);
  assert.match(dataLayer, /fm1_create_ticket_v1/);
  assert.match(schema, /serverTicketId: null/);
  assert.match(schema, /submissionState: ["']NOT_SUBMITTED["']/);
  assert.match(schema, /LOCAL-DRAFT-/);
  assert.match(schema, /scopeKey/);
  assert.match(
    components,
    /data\.get\(["']productionStopped["']\) === ["']on["']/,
  );
  assert.match(components, /targetLabel\(p1\.publicUpdate\)/);
  assert.match(components, /targetLabel\(p4\.publicUpdate\)/);
});

test("FM1 browser UI does not introduce a new role or permission gate", () => {
  assert.doesNotMatch(
    app,
    /state\.view==='fm1'[^\n]{0,160}(roleVerified|adminVerified)/,
  );
  assert.match(
    app,
    /if\(\['role-configuration','foundation','acceptance'\]\.includes\(state\.view\)\)/,
  );
});

test("FM1 browser module graph uses only relative imports for GitHub Pages native ESM", () => {
  const root = fileURLToPath(new URL("../fm1/", import.meta.url));
  const modules = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && path.endsWith(".js")) {
        modules.push({ path, source: readFileSync(path, "utf8") });
      }
    }
  };
  visit(root);

  const unresolved = [];
  for (const module of modules) {
    const imports = [
      ...module.source.matchAll(/\b(?:from\s*|import\s*)["']([^"']+)["']/g),
      ...module.source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
    ];
    for (const match of imports) {
      if (!match[1].startsWith("./") && !match[1].startsWith("../")) {
        unresolved.push({
          module: module.path.replace(root, ""),
          specifier: match[1],
        });
      }
    }
  }
  assert.deepEqual(unresolved, []);
  assert.ok(modules.length >= 5, "all FM1 browser modules should be inspected");
});

test("FM1 API client uses idempotent server RPC contracts and validates authoritative receipts", () => {
  assert.match(apiClient, /p_idempotency_key: key/);
  assert.match(apiClient, /ticket_number/);
  assert.match(apiClient, /workspace_id/);
  assert.match(apiClient, /p_expected_revision: ticket.revision/);
  assert.match(apiClient, /INVALID_FM1_RECEIPT/);
});

test("FM1 stale-revision conflicts refresh the authoritative ticket and suppress concurrent writes", () => {
  assert.match(components, /this\.ticketMutationPending = false/);
  assert.match(components, /if \(this\.ticketMutationPending\) return/);
  assert.match(components, /error\?\.code === ["']40001["']/);
  assert.match(components, /await this\.loadTicket\(ticket\.id\)/);
  assert.match(
    components,
    /review the current values before making another change/,
  );
  assert.match(
    components,
    /finally\s*\{\s*this\.ticketMutationPending = false;/,
  );
});
