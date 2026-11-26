import test from "node:test";
import assert from "node:assert/strict";
import { renderTradeLinkApplication } from "../tradelink-application.js";
import { TRADELINK_BOARD_ID } from "../tradelink-board-items.js";

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

test("application viewer is directed to All Documents without granting creation", () => {
  const html = renderTradeLinkApplication({
    detail,
    workspaceId,
    section: "drafts",
    canManage: false,
    canReview: true,
  });
  assert.match(html, /Create New is unavailable for this signed account/);
  assert.match(
    html,
    /does not have the existing document-creation capability/,
  );

  assert.match(
    html,
    /<a class="secondary" href="#\/tradelink\/documents">Open All Documents<\/a>/,
  );
  assert.match(html, /aria-label="TradeLink All Documents"/);
  assert.match(html, /data-tl-tab="create"[^>]*aria-disabled="true"/);
  assert.doesNotMatch(html, /data-tl-tab="create"[^>]*href=/);
  assert.doesNotMatch(html, /data-tradelink-draft-form/);
});

test("All Documents and assigned review remain available without creation", () => {
  const html = renderTradeLinkApplication({
    detail,
    workspaceId,
    section: "documents",
    canManage: false,
    canReview: true,
  });
  assert.match(html, /data-tl-tab="documents"[^>]*aria-current="page"/);
  assert.match(html, /All Documents/);
  assert.doesNotMatch(html, /My Assigned Documents/);
  assert.match(html, /aria-label="TradeLink All Documents"/);
  assert.doesNotMatch(html, /data-tradelink-draft-form/);
});

test("existing Board Manager retains the signed creation form and navigation", () => {
  const html = renderTradeLinkApplication({
    detail,
    workspaceId,
    section: "drafts",
    canManage: true,
    canReview: false,
  });
  assert.match(html, /aria-label="TradeLink Create New"/);
  assert.match(
    html,
    /data-tl-tab="create"[^>]*href="#\/tradelink\/drafts\/quotation"/,
  );
  assert.match(html, /data-tradelink-draft-form/);
  assert.doesNotMatch(
    html,
    /Create New is unavailable for this signed account/,
  );
});


test("existing TradeLink User module role can create Drafts without Board manage", () => {
  const html = renderTradeLinkApplication({
    detail,
    workspaceId,
    section: "drafts",
    canManage: false,
    canReview: true,
    canCreate: true,
    actorId: "00000000-0000-4000-8000-000000000002",
  });
  assert.match(html, /data-tl-can-manage="false"/);
  assert.match(html, /data-tl-can-create="true"/);
  assert.match(html, /aria-label="TradeLink Create New"/);
  assert.match(html, /data-tradelink-draft-form/);
  assert.match(html, /data-action="tradelink-draft-submit"/);
  assert.doesNotMatch(
    html,
    /data-action="tradelink-document-(approve|reject|status-update)"|data-action="tradelink-draft-(archive|restore)"/,
  );
});

test("foreign workspace does not render document controls or navigation", () => {
  const html = renderTradeLinkApplication({
    detail,
    workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    section: "documents",
    canManage: false,
    canReview: true,
  });
  assert.match(html, /TradeLink signed workspace access is unavailable/);
  assert.doesNotMatch(html, /Open All Documents|data-tradelink-draft-form/);
});
