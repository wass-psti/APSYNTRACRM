import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 initialTradeLinkDraftView,mergeTradeLinkDocumentSelection,
 renderTradeLinkDocumentRepository
} from '../tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';

const workspace='00000000-0000-4000-8000-000000000001';
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const missingId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const row={
 documentId:id,boardItemId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 documentNumber:'Q-001',clientName:'Reference Client',documentType:'quotation',
 revision:2,workflowState:'draft',archived:false,hidden:false,
 createdAt:'2026-11-08T20:00:00+08:00',updatedAt:'2026-11-08T22:12:00+08:00'
};
const detail={
 board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',
  status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},
 groups:[],items:[],columns:[]
};
const appSource=readFileSync('frontend/app.js','utf8');
const updateStart=appSource.indexOf('function updateTradeLinkDocumentSelection(panel){');
const updateEnd=appSource.indexOf('\nfunction exportTradeLinkDocumentSelection(panel){',updateStart);
assert.ok(updateStart>=0&&updateEnd>updateStart,'selection updater must remain available');
const updateSource=appSource.slice(updateStart,updateEnd);
const exportStart=updateEnd;
const exportEnd=appSource.indexOf('\nfunction captureTradeLinkDraftListFilters(event){',exportStart);
assert.ok(exportEnd>exportStart,'selection export must remain available');
const exportSource=appSource.slice(exportStart,exportEnd);

function renderSelection(selectedDocumentIds,selectedDocuments=[]){
 return renderTradeLinkDocumentRepository({
  detail,workspaceId:workspace,canManage:true,
  view:{...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows:[row],
   selectedDocumentIds,selectedDocuments}
 });
}
function runSelectionUpdate({selectedDocumentIds,selectedDocuments=[],checked=true}){
 const state={boardManage:true,tradeLinkDraft:{
  ...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',busy:false,
  rows:[row],selectedDocumentIds,selectedDocuments
 }};
 const checkbox={dataset:{documentId:id},checked,disabled:false};
 const domRow={hidden:false,querySelector:selector=>
  selector==='[data-tl-select-document]'?checkbox:null};
 const heading={textContent:''},feedback={textContent:''};
 const selectAll={checked:false,indeterminate:false,disabled:false};
 const actions=new Map([
  'tradelink-documents-export-selection','tradelink-documents-delete-selection',
  'tradelink-documents-hide-selection','tradelink-documents-unhide-selection',
  'tradelink-documents-clear-selection'
 ].map(name=>[name,{disabled:true}]));
 const panel={
  querySelectorAll:selector=>selector==='[data-tradelink-domain-record]'?[domRow]:[],
  querySelector(selector){
   if(selector==='[data-tl-selected-count]')return heading;
   if(selector==='[data-tl-selection-feedback]')return feedback;
   if(selector==='[data-tl-select-all]')return selectAll;
   const match=selector.match(/^\[data-action="([^"]+)"\]$/);
   return match?actions.get(match[1])||null:null;
  }
 };
 const update=new Function('state','tradeLinkAuthorizedListRoute',
  'mergeTradeLinkDocumentSelection',updateSource+';return updateTradeLinkDocumentSelection;')(
   state,()=>true,mergeTradeLinkDocumentSelection);
 update(panel);
 return {state,checkbox,heading,feedback,selectAll,actions};
}
function runExport(selectedDocumentIds,selectedDocuments=[]){
 let clicked=0;
 const anchor={href:'',download:'',hidden:false,click(){clicked++;},remove(){}};
 const urlApi={createObjectURL:()=> 'blob:selection-test',revokeObjectURL:()=>{}};
 class BlobStub{constructor(parts,options){this.parts=parts;this.options=options;}}
 const documentStub={createElement:()=>anchor,body:{append(){}}};
 const state={boardManage:true,tradeLinkSection:'documents',tradeLinkDraft:{
  status:'AUTHORIZED_READ',rows:[row],selectedDocumentIds,selectedDocuments
 }};
 const run=new Function('state','tradeLinkAuthorizedListRoute',
  'mergeTradeLinkDocumentSelection','serializeTradeLinkDocumentCsv',
  'URL','Blob','document','setTimeout',exportSource+';return exportTradeLinkDocumentSelection;')(
   state,()=>true,mergeTradeLinkDocumentSelection,()=> 'Document Number\nQ-001',
   urlApi,BlobStub,documentStub,()=>{});
 return {result:run({}),clicked,state};
}

test('restored selected IDs resolve from the current page when snapshot cache is empty',()=>{
 const merged=mergeTradeLinkDocumentSelection([], [row], new Set([id]),50,[id]);
 assert.deepEqual(merged.documentIds,[id]);
 assert.deepEqual(merged.documents,[row]);
 assert.deepEqual(merged.missingDocumentIds,[]);
 assert.equal(merged.overflow,false);
 const html=renderSelection([id],[]);
 assert.match(html,new RegExp('data-document-id="'+id+'" checked'));
 assert.match(html,/1 selected across pages/);
 assert.match(html,/data-action="tradelink-documents-export-selection"(?! disabled)/);
 assert.match(html,/data-action="tradelink-documents-delete-selection"(?! disabled)/);
 assert.match(html,/data-action="tradelink-documents-hide-selection"(?! disabled)/);
});

test('off-page IDs remain counted but bulk actions wait for their row snapshots',()=>{
 const merged=mergeTradeLinkDocumentSelection([], [row], new Set([id]),50,[id,missingId]);
 assert.deepEqual(merged.documentIds,[id,missingId]);
 assert.deepEqual(merged.documents,[row]);
 assert.deepEqual(merged.missingDocumentIds,[missingId]);
 const html=renderSelection([id,missingId],[]);
 assert.match(html,/2 selected across pages/);
 assert.match(html,/1 selected document\(s\) are not loaded/);
 assert.match(html,/data-action="tradelink-documents-delete-selection" disabled/);
 assert.match(html,/data-action="tradelink-documents-hide-selection" disabled/);
 assert.match(html,/data-action="tradelink-documents-clear-selection"(?! disabled)/);
});

test('selection updater preserves off-page IDs and reconciles visible row snapshots',()=>{
 const result=runSelectionUpdate({selectedDocumentIds:[id,missingId],selectedDocuments:[],checked:true});
 assert.deepEqual(result.state.tradeLinkDraft.selectedDocumentIds,[id,missingId]);
 assert.deepEqual(result.state.tradeLinkDraft.selectedDocuments,[row]);
 assert.equal(result.heading.textContent,'2 selected across pages');
 assert.match(result.feedback.textContent,/1 selected document\(s\) are not loaded/);
 assert.equal(result.actions.get('tradelink-documents-export-selection').disabled,true);
 assert.equal(result.actions.get('tradelink-documents-delete-selection').disabled,true);
 assert.equal(result.actions.get('tradelink-documents-clear-selection').disabled,false);
});

test('unchecking a current-page row removes only that ID and retains earlier-page IDs',()=>{
 const result=runSelectionUpdate({selectedDocumentIds:[id,missingId],selectedDocuments:[row],checked:false});
 assert.deepEqual(result.state.tradeLinkDraft.selectedDocumentIds,[missingId]);
 assert.deepEqual(result.state.tradeLinkDraft.selectedDocuments,[]);
 assert.equal(result.heading.textContent,'1 selected across pages');
 assert.equal(result.actions.get('tradelink-documents-clear-selection').disabled,false);
});

test('hidden restored selection enables only the matching bulk action',()=>{
 const hiddenRow={...row,hidden:true};
 const html=renderTradeLinkDocumentRepository({
  detail,workspaceId:workspace,canManage:true,
  view:{...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows:[hiddenRow],
   listFilters:{...initialTradeLinkDraftView().listFilters,visibilityMode:'hidden'},
   selectedDocumentIds:[id],selectedDocuments:[]}
 });
 assert.match(html,/data-action="tradelink-documents-unhide-selection"(?! disabled)/);
 assert.match(html,/data-action="tradelink-documents-hide-selection" disabled/);
});

test('CSV export resolves a visible selected ID and rejects an incomplete off-page selection',()=>{
 const valid=runExport([id],[]);
 assert.equal(valid.result,true);
 assert.equal(valid.clicked,1);
 assert.deepEqual(valid.state.tradeLinkDraft.selectedDocuments,[row]);
 const incomplete=runExport([id,missingId],[]);
 assert.equal(incomplete.result,false);
 assert.equal(incomplete.clicked,0);
});
