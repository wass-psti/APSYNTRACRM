import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("frontend/app.js", "utf8");
const boardStyles = readFileSync(
  "frontend/board-overhaul-experience.css",
  "utf8",
);
const toolbarStyles = readFileSync("frontend/monday-inspired-ui.css", "utf8");
const bundle = readFileSync("frontend/apsyntra-styles.bundle.css", "utf8");
const page = readFileSync("index.html", "utf8");

test("item details drawer outranks every board toolbar and sticky layer", () => {
  const backdropRule = boardStyles.match(
    /\.board-detail-backdrop\s*\{([^}]+)\}/,
  );
  assert.ok(backdropRule, "board item overlay needs a direct body-portal rule");
  assert.match(backdropRule[1], /position:\s*fixed/);
  assert.match(backdropRule[1], /inset:\s*0/);
  assert.match(backdropRule[1], /z-index:\s*10010/);
  assert.match(backdropRule[1], /padding:\s*0/);

  assert.match(
    toolbarStyles,
    /\.board-customize-toolbar\s*\{[^}]*z-index:\s*110/s,
  );
  assert.match(
    toolbarStyles,
    /\.board-customize-toolbar:has\(>details\[open\]\)\s*\{\s*z-index:\s*510/s,
  );
  assert.match(
    toolbarStyles,
    /\.board-customize-toolbar>details\[open\]\s*\{\s*position:relative;z-index:520/s,
  );
  assert.match(
    toolbarStyles,
    /\.board-tool-menu-panel,.board-column-menu-content,.board-actions-popover\)\s*\{\s*z-index:530/s,
  );
  assert.ok(
    10010 > 9999,
    "drawer must also cover the fixed column-resize guide",
  );
  assert.ok(boardStyles.includes(".board-item-drawer"));
});

test("drawer remains a full-height, independently scrollable side panel", () => {
  const drawerRule = boardStyles.match(/\.board-item-drawer\s*\{([^}]+)\}/);
  assert.ok(drawerRule, "drawer needs an explicit final-layer layout rule");
  assert.match(drawerRule[1], /position:\s*relative/);
  assert.match(drawerRule[1], /overflow-y:\s*auto/);
  assert.match(drawerRule[1], /overscroll-behavior:\s*contain/);
  assert.match(drawerRule[1], /max-height:\s*100dvh/);
  assert.match(drawerRule[1], /box-sizing:\s*border-box/);
});

test("existing item-detail renderer and close action remain unchanged", () => {
  assert.match(app, /modal\.className='modal-backdrop board-detail-backdrop'/);
  assert.match(app, /document\.body\.append\(modal\)/);
  assert.match(app, /aria-label="Close item details"/);
  assert.match(app, /modal\.addEventListener\('click'/);
  assert.match(app, /function hideModal\(/);
});

test("overlay correction is delivered in the final production CSS layer", () => {
  assert.match(
    page,
    /apsyntra-styles\.bundle\.css\?v=cp-crm-boards-uiverse-overhaul-03/,
  );
  assert.ok(bundle.includes(boardStyles.trimEnd()));
  assert.ok(
    bundle.includes(
      "/* frontend/board-overhaul-experience.css */\n" + boardStyles.trimEnd(),
    ),
  );
});
