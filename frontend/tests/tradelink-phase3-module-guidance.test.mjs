import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {initialTradeLinkDraftView,renderTradeLinkDraftWorkspace,
 renderTradeLinkDocumentRepository,TRADELINK_MODULE_GUIDANCE}
 from '../tradelink-draft-workspace.js';

const workspace='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,
 name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
 groups:[],items:[],columns:[]};

test('six document modules each render distinct bounded drafting guidance',()=>{
 assert.equal(Object.keys(TRADELINK_MODULE_GUIDANCE).length,6);
 for(const [type,guide] of Object.entries(TRADELINK_MODULE_GUIDANCE)){
  const html=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,
   canManage:true,view:initialTradeLinkDraftView(type)});
  assert.match(html,/class="tl-reference-module-guidance"/);
  assert.ok(html.includes(guide.heading+' drafting guide'));
  assert.ok(html.includes(guide.boundary));
  assert.match(html,/No PDF, approval or document is generated/);
  assert.match(html,/data-tradelink-draft-form/);
  assert.doesNotMatch(html,/data-action="tradelink-company-reset-counter"/);
 }
});
test('All Documents create shortcut is permission-bound, never a save claim',()=>{
 const view={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows:[]};
 const allowed=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view,canManage:true});
 const denied=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view,canManage:false});
 assert.match(allowed,/Create New Document/);
 assert.match(allowed,/\/tradelink\/drafts\/quotation/);
 assert.match(allowed,/data-action="tradelink-documents-refresh"/);
 assert.doesNotMatch(denied,/Create new Draft/);
 assert.doesNotMatch(allowed,/Save successful|PDF generated|100 documents/);
});
test('Phase 3 presentation remains responsive and scoped',()=>{
 const css=readFileSync('frontend/tradelink-reference-ui.css','utf8');
 assert.match(css,/\.tl-reference-portal \.tl-reference-module-guidance/);
 assert.match(css,/\.tl-reference-portal \.tl-reference-repository-buttons/);
 assert.match(css,/@media\(max-width:620px\)/);
});
