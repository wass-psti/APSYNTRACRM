import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {
 TradeLinkDomainClient,normalizeTradeLinkDocumentRenderSnapshot
} from '../tradelink-domain-client.js';
import {renderTradeLinkSavedDocumentOutput} from '../tradelink-saved-document-output.js';

const userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const documentId='99999999-9999-4999-8999-999999999992';
const boardItemId='99999999-9999-4999-8999-999999999991';
const workspaceId='00000000-0000-4000-8000-000000000001';
const capturedAt='2026-11-27T12:24:28.621039+00:00';
const stylesheetAssets=[
 'templates/tradelink-application-v1.42.0-fc3a9e2dd3626a4b7657ea72c105b042d8128287.css',
 'templates/tradelink-quotation-redesign-v1.42.0-866f644ed2f9a5fa569e799351feac19a90325fa.css'
];
const stylesheetGitBlobShas=[
 'fc3a9e2dd3626a4b7657ea72c105b042d8128287',
 '866f644ed2f9a5fa569e799351feac19a90325fa'
];
function snapshotResult(overrides={}){
 const company={
  id:'watchdog-opc',templateId:'watchdog-opc-reference-v1',
  name:'Watchdog Automation OPC',
  address:'Bldg.2 Paseo de Amores Sergio Osmena St.\nGun-ob, Lapu-lapu City 6015',
  phone:'+63 917 7073079',quotationPhone:'+63 917 7073079',
  email:'info@watchdogautomation.com.ph',website:'www.watchdogautomation.com.ph',
  tin:'010-737-641-000',
  logoAsset:'profiles/v1/watchdog-opc-f55506ddd9b2569658f2eecac7f081cc08ba3a19.png',
  logoGitBlobSha:'f55506ddd9b2569658f2eecac7f081cc08ba3a19',
  quotationLogoAsset:'profiles/v1/watchdog-opc-quotation-6d43decfa6a476219c2cae149311c84bd7109c57.png',
  quotationLogoGitBlobSha:'6d43decfa6a476219c2cae149311c84bd7109c57'
 };
 const template={
  id:'watchdog-opc-reference-v1',version:'v1.42.0',profileId:'watchdog-opc',
  profileVersion:1,accent:'#14b866',tableBackground:'#e3f7e9',
  tableText:'#244f78',ruleColor:'#2f68c4',termsMode:'flow',
  rendererVersion:'tradelink-renderer-v1',
  stylesheetAssets:[...stylesheetAssets],stylesheetGitBlobShas:[...stylesheetGitBlobShas]
 };
 const snapshot={
  schemaVersion:1,snapshotSource:'captured',profileVersion:1,
  company,template,terms:'CP-TL-OPT-04B IMMUTABLE SNAPSHOT TERMS',
  termsSource:'document',capturedAt
 };
 return {
  documentId,revision:5,snapshotSource:'captured',capturedAt,
  snapshot:{...snapshot,...overrides}
 };
}
function record(){
 return {
  id:documentId,workspace_id:workspaceId,board_id:TRADELINK_BOARD_ID,
  board_item_id:boardItemId,revision:5,workflow_state:'approved',
  document_type:'quotation',document_number:'Q-OPT04B-SNAPSHOT-001',
  created_at:capturedAt,updated_at:capturedAt,archived_at:null,
  created_by:userId,created_by_name:'Snapshot Acceptance Creator',
  approval_policy:'standard-dual-v1',approved:true,
  primary_reviewed_at:capturedAt,secondary_reviewed_at:capturedAt,
  content:{
   documentType:'quotation',documentNumber:'Q-OPT04B-SNAPSHOT-001',
   vendorId:'watchdog-opc',templateId:'watchdog-opc-reference-v1',
   customerName:'Synthetic Snapshot Customer',currency:'PHP',vatType:'12',
   discountType:'fixed',discountValue:0,items:[],
   terms:'CP-TL-OPT-04B IMMUTABLE SNAPSHOT TERMS'
  }
 };
}

test('signed render snapshot normalizer accepts the exact document revision and immutable asset hashes',()=>{
 const result=normalizeTradeLinkDocumentRenderSnapshot(snapshotResult(),documentId,5);
 assert.equal(result.documentId,documentId);
 assert.equal(result.revision,5);
 assert.equal(result.snapshot.company.id,'watchdog-opc');
 assert.equal(result.snapshot.template.version,'v1.42.0');
 assert.equal(result.snapshot.template.stylesheetAssets.length,2);
 assert.equal(result.snapshot.termsSource,'document');
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.snapshot.company));
 assert.ok(Object.isFrozen(result.snapshot.template.stylesheetAssets));
});

test('render snapshot normalizer rejects mismatched revision, profile, template, hash and unsafe assets',()=>{
 assert.throws(()=>normalizeTradeLinkDocumentRenderSnapshot(snapshotResult(),documentId,4),/Invalid or mismatched/);
 assert.throws(()=>normalizeTradeLinkDocumentRenderSnapshot(snapshotResult(),userId,5),/Invalid or mismatched/);
 const badProfile=snapshotResult();
 badProfile.snapshot.template.profileId='watchdog-sales';
 assert.throws(()=>normalizeTradeLinkDocumentRenderSnapshot(badProfile,documentId,5),/Invalid or mismatched/);
 const badHash=snapshotResult();
 badHash.snapshot.company.logoGitBlobSha='0'.repeat(40);
 assert.throws(()=>normalizeTradeLinkDocumentRenderSnapshot(badHash,documentId,5),/Invalid or mismatched/);
 const badAsset=snapshotResult();
 badAsset.snapshot.template.stylesheetAssets[0]='templates/../../untrusted.css';
 assert.throws(()=>normalizeTradeLinkDocumentRenderSnapshot(badAsset,documentId,5),/Invalid or mismatched/);
 const badColor=snapshotResult();
 badColor.snapshot.template.accent='url(javascript:alert(1))';
 assert.throws(()=>normalizeTradeLinkDocumentRenderSnapshot(badColor,documentId,5),/Invalid or mismatched/);
 const badTerms=snapshotResult();
 badTerms.snapshot.termsSource='guessed';
 assert.throws(()=>normalizeTradeLinkDocumentRenderSnapshot(badTerms,documentId,5),/Invalid or mismatched/);
});

test('TradeLink client retrieves the immutable snapshot for the exact selected revision through the signed RPC',async()=>{
 const calls=[];
 const board={id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',
  status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'};
 const auth={userId,getVerifiedUser:async()=>({id:userId})};
 const api={
  context:async()=>({user_id:userId,workspace_id:workspaceId,profile:{status:'active'}}),
  board:async()=>({board}),allowed:async()=>true,
  rpc:async(name,args)=>{calls.push({name,args});return snapshotResult();}
 };
 const client=new TradeLinkDomainClient({auth,api});
 const result=await client.renderSnapshot(documentId,5);
 assert.equal(result.revision,5);
 assert.equal(result.snapshot.company.id,'watchdog-opc');
 assert.deepEqual(calls,[{
  name:'tl04_document_render_snapshot',
  args:{p_board_id:TRADELINK_BOARD_ID,p_document_id:documentId,p_revision:5}
 }]);
 await assert.rejects(()=>client.renderSnapshot('invalid',5),/Invalid TradeLink rendering snapshot request/);
 await assert.rejects(()=>client.renderSnapshot(documentId,0),/Invalid TradeLink rendering snapshot request/);
 assert.equal(calls.length,1,'invalid identifiers must not issue a database RPC');
});

test('TradeLink client rejects an RPC response for another revision instead of silently using current template settings',async()=>{
 const board={id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',
  status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'};
 const auth={userId,getVerifiedUser:async()=>({id:userId})};
 const api={
  context:async()=>({user_id:userId,workspace_id:workspaceId,profile:{status:'active'}}),
  board:async()=>({board}),allowed:async()=>true,
  rpc:async()=>({...snapshotResult(),revision:4})
 };
 const client=new TradeLinkDomainClient({auth,api});
 await assert.rejects(()=>client.renderSnapshot(documentId,5),/Invalid or mismatched immutable TradeLink rendering snapshot/);
});

test('saved quotation uses the stored company, template version, colors, logo and exact revision terms',()=>{
 const html=renderTradeLinkSavedDocumentOutput(record(),workspaceId,documentId,{
  creatorName:'Snapshot Acceptance Creator',renderSnapshot:snapshotResult()
 });
 assert.match(html,/Watchdog Automation OPC/);
 assert.match(html,/data-tradelink-template-version="v1\.42\.0"/);
 assert.match(html,/data-tradelink-template-id="watchdog-opc-reference-v1"/);
 assert.match(html,/data-tradelink-profile-version="1"/);
 assert.match(html,/data-tradelink-render-snapshot-source="captured"/);
 assert.doesNotMatch(html,/\\sstyle=/);
 assert.match(html,/tl-official-profile-watchdog-opc/);
 const templateCss=readFileSync(new URL('../assets/tradelink/templates/tradelink-application-v1.42.0-fc3a9e2dd3626a4b7657ea72c105b042d8128287.css',import.meta.url),'utf8');
 assert.match(templateCss,/tl-official-profile-watchdog-opc[^}]*--tl-official-accent:#14b866/);
 assert.match(templateCss,/tl-official-profile-watchdog-opc[^}]*--tl-official-table-bg:#e3f7e9/);
 assert.match(html,/watchdog-opc-quotation-6d43decfa6a476219c2cae149311c84bd7109c57\.png/);
 assert.match(html,/CP-TL-OPT-04B IMMUTABLE SNAPSHOT TERMS/);
 assert.doesNotMatch(html,/Watchdog Automation Sales &amp; Services/);
});

test('saved output refuses a snapshot that does not match the document content identity or terms',()=>{
 const changedProfile=record();
 changedProfile.content.vendorId='watchdog-sales';
 assert.throws(()=>renderTradeLinkSavedDocumentOutput(changedProfile,workspaceId,documentId,{
  renderSnapshot:snapshotResult()
 }),/does not match the selected revision/);
 const changedTerms=record();
 changedTerms.content.terms='Current terms must not replace immutable terms';
 assert.throws(()=>renderTradeLinkSavedDocumentOutput(changedTerms,workspaceId,documentId,{
  renderSnapshot:snapshotResult()
 }),/does not match the selected revision/);
});

test('All Documents print flow fetches and mounts the exact revision snapshot and its versioned stylesheets',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const start=app.indexOf('async function printTradeLinkDocument(');
 const end=app.indexOf('async function commitTradeLinkDraft(',start);
 assert.ok(start>0&&end>start);
 const flow=app.slice(start,end);
 assert.match(flow,/tradeLinkDraftWorkspace\.renderSnapshot\(documentId,targetRevision\)/);
 assert.match(flow,/renderSnapshot\.documentId!==documentId/);
 assert.match(flow,/renderSnapshot\.revision!==targetRevision/);
 assert.match(flow,/renderTradeLinkSavedDocumentOutput\(record,ws,documentId,\{creatorName,renderSnapshot\}\)/);
 assert.match(flow,/stylesheetAssets:renderSnapshot\.snapshot\.template\.stylesheetAssets/);
 const output=readFileSync(new URL('../tradelink-saved-document-output.js',import.meta.url),'utf8');
 assert.match(output,/link\.rel='stylesheet'/);
 assert.ok(output.includes('stylesheetReady=Promise.all('));
 assert.ok(output.includes('.then(()=>true).catch(()=>false)'));
 assert.ok(output.includes('if(!await active.stylesheetReady)'));
 assert.match(output,/stylesheetLinks\.forEach\(link=>link\.remove\(\)\)/);
});
