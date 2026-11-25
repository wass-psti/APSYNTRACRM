import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  renderTradeLinkApplication,
  TRADELINK_SOURCE_MODULES,
} from "../tradelink-application.js";
import { TRADELINK_BOARD_ID } from "../tradelink-board-items.js";
import { initialTradeLinkDraftView } from "../tradelink-draft-workspace.js";

const css = readFileSync("frontend/tradelink-ui-refresh.css", "utf8");
const bundle = readFileSync("frontend/apsyntra-styles.bundle.css", "utf8");
const workspaceId = "00000000-0000-4000-8000-000000000001";
const detail = {
  board: {
    id: TRADELINK_BOARD_ID,
    workspace_id: workspaceId,
    name: "TradeLink",
    status: "active",
    description: "[APSYNTRA:MODULE:tradelink:v1]",
  },
  groups: [],
  items: [],
  columns: [],
};
const render = (canCreate, canManage = false, type = "quotation") =>
  renderTradeLinkApplication({
    detail,
    workspaceId,
    section: "drafts",
    canManage,
    canCreate,
    draftView: initialTradeLinkDraftView(type),
  });

test("a signed module User can select all six TradeLink document types without Board MANAGE", () => {
  const html = render(true, false);
  assert.match(html, /data-tl-can-manage="false" data-tl-can-create="true"/);
  assert.equal((html.match(/data-tl-module-nav=/g) || []).length, 6);
  for (const { key, label } of TRADELINK_SOURCE_MODULES) {
    assert.match(
      html,
      new RegExp(
        'data-tl-module-nav="' +
          key +
          '"[^>]*href="#/tradelink/drafts/' +
          key +
          '"',
      ),
    );
    assert.ok(html.includes(label), key + " readable label");
  }
  assert.match(
    html,
    /data-tl-module-nav="quotation" class="tl-module-link active"/,
  );
});
test("module selection follows active type and maintains the independent create capability", () => {
  for (const { key } of TRADELINK_SOURCE_MODULES) {
    const html = render(true, false, key);
    assert.match(
      html,
      new RegExp(
        'data-tl-module-nav="' +
          key +
          '" class="tl-module-link active"[^>]*aria-current="page"',
      ),
    );
    assert.equal((html.match(/data-tl-module-nav=/g) || []).length, 6);
  }
});
test("review-only accounts are not given a create selector by styling", () => {
  const html = render(false, false);
  assert.doesNotMatch(html, /data-tl-module-nav|class="tl-app-nav"/);
  assert.match(html, /Create New is unavailable for this signed account/);
});
test("selector is placed directly below the document header and before the editor content", () => {
  const html = render(true, false);
  const header = html.indexOf('class="tl-reference-document-topcard"');
  const selector = html.indexOf('class="tl-app-nav"');
  const editorContent = html.indexOf('class="tl-reference-editor-content"');
  assert.ok(header >= 0 && selector > header && editorContent > selector);
  assert.ok(html.indexOf('<main class="tl-app-main">') < header);
  assert.match(html, /TRADELINK WORKSPACE/);
  assert.match(html, /Document Types/);
  assert.match(html, /Choose a document to prepare/);
  assert.equal((html.match(/class="tl-app-nav"/g) || []).length, 1);
});

test("source and generated CSS provide six desktop columns and responsive three/two-column layouts", () => {
  const manifest = readFileSync("scripts/priority5-style-manifest.mjs", "utf8");
  assert.ok(manifest.includes("frontend/tradelink-ui-refresh.css"));
  for (const text of [css, bundle]) {
    assert.match(text, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
    assert.match(text, /@media\(max-width:1050px\)[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
    assert.match(text, /@media\(max-width:620px\)[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(text, /@media\(max-width:360px\)[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
    assert.doesNotMatch(text, /\[data-tl-can-manage="true"\] \.tl-app-nav \.tl-module-link/);
  }
});
