import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TradeLinkDraftWorkspace,renderTradeLinkDraftWorkspace,
 renderTradeLinkDocumentRepository,initialTradeLinkDraftView}
 from '../tradelink-draft-workspace.js';
import {TradeLinkDomainClient} from '../tradelink-domain-client.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
const workspace='00000000-0000-4000-8000-000000000001';
const doc='99999999-9999-4999-8999-999999999992';
const item='99999999-9999-4999-8999-999999999991';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',
 status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},groups:[],columns:[],items:[]};
const content={documentType:'quotation',documentNumber:'Q-REV-HISTORY-001',
 verifiedByEmail:'aacsenagan@watchdogautomation.com.ph',
 approvedByEmail:'asenagan@watchdogautomation.com.ph',
 vendorId:'watchdog-sales',templateId:'watchdog-sales-reference-v1',
 customerName:'Existing buyer',currency:'PHP',items:[
  {id:'line-1',kind:'item',description:'Signed original',quantity:1,unitPrice:100}]};
const record={id:doc,board_id:TRADELINK_BOARD_ID,workspace_id:workspace,
 board_item_id:item,document_type:'quotation',document_number:content.documentNumber,
 revision:2,workflow_state:'approved',content,archived_at:null,
 created_at:'2026-11-17T00:00:00.000Z',updated_at:'2026-11-17T00:00:00.000Z'};
test('Approved documents offer Preview/Edit while keeping Print PDF',()=>{
 const rows=[{documentId:doc,boardItemId:item,documentType:'quotation',
  documentNumber:content.documentNumber,revision:2,workflowState:'approved',
  archived:false,updatedAt:record.updated_at}];
 const markup=renderTradeLinkDocumentRepository({detail,workspaceId:workspace,
  view:{...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',rows},canManage:true});
 assert.match(markup,/Preview\/Edit/);
 assert.match(markup,/Print PDF/);
 assert.match(markup,/tradelink\/drafts\/edit\/99999999-9999-4999-8999-999999999992/);
});
test('Approved revision editor defaults to For Approval and prevents Draft bypass',()=>{
 const view={...initialTradeLinkDraftView(),mode:'edit',status:'AUTHORIZED_READ',
  selected:{documentId:doc,record}};
 const markup=renderTradeLinkDraftWorkspace({detail,workspaceId:workspace,view,canManage:true});
 assert.match(markup,/Save New Revision/);
 assert.match(markup,/existing approved revision remains printable/);
 assert.match(markup,/<option value="for-approval" selected/);
 assert.match(markup,/<option value="draft" disabled/);
 assert.match(markup,/name="documentNumber"[^>]*readonly/);
 assert.match(markup,/name="vendorId"[^>]*disabled/);
});
test('Workspace save chooses a separate approved-supersession operation without renumbering',async()=>{
 const workspaceClient=new TradeLinkDraftWorkspace({auth:{},api:{}});
 let captured;
 workspaceClient.client.commit=async value=>(captured=value,{documentId:doc,
  boardItemId:item,revision:3,state:'for-approval',operation:'update',idempotent:false});
 const changed={...content,remarks:'Negotiated change'};
 await workspaceClient.save({documentId:doc,expectedRevision:2,draft:changed,reviseApproved:true});
 assert.equal(captured.operation,'revise-approved');
 assert.equal(captured.expectedRevision,2);
 assert.equal(captured.initialState,'for-approval');
 assert.equal(captured.draft.documentNumber,content.documentNumber);
 assert.equal(captured.draft.vendorId,content.vendorId);
});
test('Signed API sends explicit operation and accepts only revision-bound 3 response',async()=>{
 let commands=0;
 const client=new TradeLinkDomainClient({api:{rpc:async(name,args)=>{
  commands++;
  assert.equal(name,'tl03_document_save');
  assert.equal(args.p_operation,'revise-approved');
  assert.equal(args.p_expected_revision,2);
  return {documentId:doc,boardItemId:item,revision:3,
   state:'for-approval',operation:'update',idempotent:false};
 }},auth:{}});
 client.session=async()=>({actorId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',workspaceId:workspace,canManage:true});
 const revised=await client.commit({documentId:doc,expectedRevision:2,
  operation:'revise-approved',draft:{...content,remarks:'Negotiated change'},
  initialState:'for-approval'});
 assert.equal(revised.revision,3);
 await assert.rejects(()=>client.commit({documentId:doc,expectedRevision:2,
  operation:'revise-approved',draft:{...content,remarks:'Negotiated change'},initialState:'draft'}),/Invalid TradeLink/);
 assert.equal(commands,1);
});
test('Migration uses the existing signed save contract, with no new permission hierarchy',()=>{
 const sql=readFileSync(new URL('../../supabase/migrations/20261117045417_tradelink_approved_revision_flow.sql',import.meta.url),'utf8');
 assert.match(sql,/p_operation NOT IN \('create','update','revise-approved'\)/);
 assert.match(sql,/Approved historical revision audit is incomplete/);
 assert.match(sql,/Approved revision must preserve number, company and reviewers/);
 assert.match(sql,/p_initial_state<>'for-approval'/);
 assert.match(sql,/approved-supersession/);
 assert.doesNotMatch(sql,/CREATE ROLE|CREATE POLICY|ALTER TABLE .* ENABLE ROW LEVEL SECURITY/i);
});
