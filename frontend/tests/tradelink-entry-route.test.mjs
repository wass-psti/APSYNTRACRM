import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderTradeLinkApplication,normalizeTradeLinkSection} from '../tradelink-application.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {workspaceApplicationsForNavigation} from '../workspace-application-routing.js';
import {WORK_MANAGEMENT_WORKSPACE_ID} from '../workspace-identity.js';
const ws='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:ws,name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},items:[],groups:[],columns:[]};
test('TradeLink root and legacy overview canonicalize to Create New, preserving explicit signed document/edit routes',()=>{
 const source=readFileSync('frontend/app.js','utf8');
 assert.match(source,/if\(parts\[0\]==='tradelink'\)/);
 assert.match(source,/history\.replaceState\(null,'',location\.pathname\+location\.search\+canonical\)/);
 assert.match(source,/parseTradeLinkApplicationRoute\(parts\)/);
 assert.match(source,/if\(parts\[1\]===TRADELINK_BOARD_ID\)/);
 assert.match(source,/tradeLinkApplicationHref\(legacy\.join\('\/'\)\)/);
 assert.match(source,/loadBoard\(TRADELINK_BOARD_ID,'tradelink',tradeLinkRoute\.draftType,tradeLinkRoute\.editId,tradeLinkContext\)/);
 assert.match(source,/workspaceApplicationsForNavigation\(state\.context\?\.workspace_id,state\.boards\)/);
 const tradeLink=workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID,[]).find(application=>application.id==='tradelink');
 assert.equal(tradeLink?.href,'#/tradelink');
 assert.equal(tradeLink?.icon,'tradelink');
});
test('obsolete landing widgets are removed but signed form, documents, and activity remain available',()=>{
 for(const section of [undefined,'overview','unexpected']){
  const html=renderTradeLinkApplication({detail,workspaceId:ws,section,canManage:true});
  assert.match(html,/data-tl-section="drafts"/);
  assert.match(html,/data-tradelink-draft-form/);
  assert.match(html,/data-tl-tab="create"[^>]*aria-current="page"/);
  assert.doesNotMatch(html,/Commercial operations|Source-aligned workspace|Authorized board records|tl-reference-overview/);
 }
 assert.equal(normalizeTradeLinkSection('overview'),'drafts');
 const documents=renderTradeLinkApplication({detail,workspaceId:ws,section:'documents',canManage:true});
 assert.match(documents,/data-tl-section="documents"/);
 assert.match(documents,/data-tl-tab="documents"[^>]*aria-current="page"/);
 assert.doesNotMatch(documents,/Commercial operations|Source-aligned workspace/);
 const activity=renderTradeLinkApplication({detail,workspaceId:ws,section:'activity',canManage:true});
 assert.match(activity,/data-tl-section="activity"/);
});
test('TradeLink brand targets Create New and denied workspace never renders a form',()=>{
 const html=renderTradeLinkApplication({detail,workspaceId:ws,canManage:true});
 assert.match(html,/aria-label="TradeLink Create New"/);
 assert.match(html,/href="#\/tradelink\/drafts\/quotation"/);
 const denied=renderTradeLinkApplication({detail,workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
 assert.match(denied,/signed workspace access is unavailable/);
 assert.doesNotMatch(denied,/data-tradelink-draft-form/);
});


test('original Create New portal entry remains visible to reviewer accounts without granting document-management capability',()=>{
 const reviewer=renderTradeLinkApplication({detail,workspaceId:ws,section:'documents',canManage:false,canReview:true});
 assert.match(reviewer,/data-tl-tab="create"[^>]*aria-disabled="true"/);
 assert.match(reviewer,/Create New/);
 assert.match(reviewer,/data-tl-tab="documents"[^>]*aria-current="page"/);
 assert.match(reviewer,/data-tl-tab="activity"/);
 assert.match(reviewer,/data-tl-tab="manual"/);
 assert.doesNotMatch(reviewer,/data-tl-tab="create"[^>]*href=/);
 assert.doesNotMatch(reviewer,/data-tradelink-draft-form/);
 assert.match(reviewer,/All Documents/);
 assert.doesNotMatch(reviewer,/My Assigned Documents/);
});


test('existing TradeLink User module role opens Create New without Board manage or manager-only actions',()=>{
 const user=renderTradeLinkApplication({detail,workspaceId:ws,section:'drafts',
  canManage:false,canReview:true,canCreate:true,actorId:'00000000-0000-4000-8000-000000000002'});
 assert.match(user,/data-tl-can-manage="false"/);
 assert.match(user,/data-tl-can-create="true"/);
 assert.match(user,/data-tradelink-draft-form/);
 assert.match(user,/data-action="tradelink-draft-submit"/);
 assert.doesNotMatch(user,/data-action="tradelink-document-(approve|reject|status-update)|data-action="tradelink-draft-(archive|restore)/);
 const manager=renderTradeLinkApplication({detail,workspaceId:ws,section:'drafts',canManage:true});
 assert.match(manager,/data-tradelink-draft-form/);
 assert.match(manager,/data-action="tradelink-draft-submit"/);
});
