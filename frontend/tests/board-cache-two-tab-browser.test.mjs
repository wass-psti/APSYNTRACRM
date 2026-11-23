import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const browserScript = readFileSync(
  resolve(root, "scripts/board-cache-two-tab-browser.mjs"),
  "utf8",
);
const allowList = browserScript.match(
  /const allowStatic=new Set\(\[([\s\S]*?)\]\);/,
);
assert.ok(allowList, "browser fixture must declare its static asset allowlist");
const allowed = new Set(
  [...allowList[1].matchAll(/'([^']+)'/g)].map((match) => match[1]),
);
const fixturePath = "/frontend/tests/fixtures/board-cache-two-tab.html";

test("two-tab browser fixture serves every transitive local ES module dependency", () => {
  const pending = [fixturePath];
  const visited = new Set();
  while (pending.length) {
    const assetPath = pending.pop();
    if (visited.has(assetPath)) continue;
    visited.add(assetPath);
    assert.ok(
      allowed.has(assetPath),
      `browser fixture asset is not allowlisted: ${assetPath}`,
    );
    if (!assetPath.endsWith(".js") && !assetPath.endsWith(".html")) continue;
    const source = readFileSync(resolve(root, "." + assetPath), "utf8");
    const importPattern =
      /\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] || match[2];
      if (!specifier.startsWith(".")) continue;
      const dependency = new URL(specifier, `http://127.0.0.1${assetPath}`)
        .pathname;
      pending.push(dependency);
    }
  }
});
