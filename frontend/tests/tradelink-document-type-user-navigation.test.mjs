import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  renderTradeLinkApplication,
  TRADELINK_SOURCE_MODULES,
} from "../tradelink-application.js";
import { TRADELINK_BOARD_ID } from "../tradelink-board-items.js";
import { initialTradeLinkDraftView } from "../tradelink-draft-workspace.js";

const css = readFileSync("frontend/tradelink-reference-ui.css", "utf8");
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
test("both source and generated CSS restore links and split layout for can-create Users", () => {
  for (const text of [css, bundle]) {
    assert.match(
      text,
      /\.tl-reference-portal\[data-tl-section="drafts"\]\[data-tl-can-create="true"\] \.tl-app-layout\{/,
    );
    assert.match(
      text,
      /\.tl-reference-portal\[data-tl-section="drafts"\]\[data-tl-can-create="true"\] \.tl-app-nav \.tl-module-link\{\s*display:flex/,
    );
    assert.doesNotMatch(
      text,
      /\[data-tl-can-manage="true"\] \.tl-app-nav \.tl-module-link/,
    );
  }
});
