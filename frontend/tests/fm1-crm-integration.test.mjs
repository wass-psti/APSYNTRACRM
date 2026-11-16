import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
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

test("FM1 is integrated into the existing CRM sidebar and hash router", () => {
  assert.match(
    app,
    /sidebarNav\('#\/fm1','FM1 Ticketing','ticket',state\.view==='fm1'\)/,
  );
  assert.match(
    app,
    /if\(parts\[0\]==='fm1'\)await import\('\.\/fm1\/index\.js'\)/,
  );
  assert.match(
    app,
    /else if\(state\.view==='fm1'\)shell\('<fm1-application data-user-id=/,
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

test("FM1 UI uses native custom elements and browser-local drafts are never presented as submitted tickets", () => {
  assert.match(components, /customElements\.define\(["']fm1-application["']/);
  assert.match(components, /customElements\.define\(["']fm1-metric-card["']/);
  assert.match(components, /data-fm1-intake-form/);
  assert.match(components, /Save local draft/);
  assert.match(components, /No live incident was submitted/);
  assert.match(schema, /serverTicketId: null/);
  assert.match(schema, /submissionState: ["']NOT_SUBMITTED["']/);
  assert.match(schema, /LOCAL-DRAFT-/);
  assert.match(schema, /scopeKey/);
  assert.match(components, /this\.getAttribute\(["']data-user-id["']\)/);
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
    /if\(\['role-configuration','user-role-management','foundation','acceptance'\]\.includes\(state\.view\)\)/,
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
