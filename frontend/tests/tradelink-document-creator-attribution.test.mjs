import test from 'node:test';
import assert from 'node:assert/strict';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {initialTradeLinkDraftView,renderTradeLinkDraftWorkspace} from '../tradelink-draft-workspace.js';

const workspaceId='00000000-0000-4000-8000-000000000001';
const creatorId='11111111-1111-4111-8111-111111111111';
const viewerId='22222222-2222-4222-8222-222222222222';
const detail={board:{
 id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',
 status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'
},groups:[],items:[],columns:[]};
const documentTypes=['esi','packing','delivery','payment','quotation','po'];

function savedDocument(documentType,createdByName='Dionny P. Señagan'){
 const documentId='33333333-3333-4333-8333-333333333333';
 return {
  id:documentId,board_id:TRADELINK_BOARD_ID,workspace_id:workspaceId,
  board_item_id:'44444444-4444-4444-8444-444444444444',
  document_type:documentType,document_number:'CREATOR-QA-001',
  workflow_state:'for-approval',revision:1,
  content:{
   documentType,documentNumber:'CREATOR-QA-001',currency:'PHP',items:[],
   createdByName:'Untrusted content creator'
  },
  created_by:creatorId,created_by_name:createdByName,
  updated_by:viewerId,created_at:'2026-11-27T01:00:00.000Z',
  updated_at:'2026-11-27T02:00:00.000Z',archived_at:null
 };
}

function renderSavedEditor(documentType,createdByName='Dionny P. Señagan'){
 const record=savedDocument(documentType,createdByName);
 const view={
  ...initialTradeLinkDraftView(documentType),
  mode:'edit',
  selected:{documentId:record.id,record},
  canEditExisting:true
 };
 return renderTradeLinkDraftWorkspace({
  detail,workspaceId,view,canManage:true,canCreate:true,
  actorId:viewerId,actorName:'Alex P. Señagan',
  actorEmail:'asenagan@watchdogautomation.com.ph',
  actorModuleRole:'User',showModuleTabs:false
 });
}

function creatorWorkflow(html){
 const start=html.indexOf('<section id="tl-section-approval"');
 assert.notEqual(start,-1,'expected the Verification & Approval Workflow section');
 const closing=html.indexOf('</section>',start);
 assert.notEqual(closing,-1,'expected the workflow section to close');
 return html.slice(start,closing+'</section>'.length);
}

test('saved creator attribution always uses the immutable server creator for all six modules',()=>{
 for(const documentType of documentTypes){
  const workflow=creatorWorkflow(renderSavedEditor(documentType));
  assert.ok(workflow.includes('Dionny P. Señagan'),documentType);
  assert.ok(!workflow.includes('Alex P. Señagan'),documentType);
  assert.ok(!workflow.includes('Untrusted content creator'),documentType);
  assert.ok(workflow.includes('Original creator'),documentType);
 }
});

test('missing saved creator profile never falls back to the viewing user',()=>{
 const workflow=creatorWorkflow(renderSavedEditor('quotation',null));
 assert.ok(workflow.includes('Original creator unavailable'));
 assert.ok(!workflow.includes('Alex P. Señagan'));
});

test('new unsaved documents continue to show the current user as the pending creator',()=>{
 const view={...initialTradeLinkDraftView('quotation'),mode:'create'};
 const html=renderTradeLinkDraftWorkspace({
  detail,workspaceId,view,canManage:true,canCreate:true,actorId:viewerId,
  actorName:'Alex P. Señagan',actorEmail:'asenagan@watchdogautomation.com.ph',
  actorModuleRole:'User',showModuleTabs:false
 });
 const workflow=creatorWorkflow(html);
 assert.ok(workflow.includes('Alex P. Señagan'));
 assert.ok(workflow.includes('Auto-captured on save'));
});
