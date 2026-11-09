import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTradeLinkDraftWorkspace,initialTradeLinkDraftView,TRADELINK_MODULE_ACCOUNT_OPTIONS,validateTradeLinkModuleAccountAssignments} from '../tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
const workspaceId='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',description:'[APSYNTRA:MODULE:tradelink:v1]',status:'active'},groups:[],items:[],columns:[]};
const render=(type,values)=>renderTradeLinkDraftWorkspace({detail,workspaceId,canManage:true,actorName:'Signed User',view:{...initialTradeLinkDraftView(type),...(values?{formValues:{documentType:type,...values}}:{})}});
test('module-specific workflow after terms; packing has no workflow',()=>{
 for(const [type,title] of Object.entries({esi:'Verification &amp; Approval Workflow',delivery:'Delivery Tracking',payment:'Payment Acknowledgement',po:'Verification &amp; Approval Workflow'})){
  const html=render(type);
  assert.ok(html.indexOf('tl-reference-terms')<html.indexOf('tl-reference-module-approval'),type);
  assert.ok(html.includes(title));
  assert.match(html,/Created By/);
  assert.match(html,/Signed User/);
  assert.match(html,/Proposed account assignments only/);
  assert.doesNotMatch(html,/Workflow account assignments|readiness · preview only/);
 }
 const packing=render('packing');
 assert.match(packing,/Terms &amp; Conditions/);
 assert.doesNotMatch(packing,/tl-reference-module-approval|Verification &amp; Approval Workflow|Delivery Tracking|Payment Acknowledgement/);
});
test('ESI finance and management lists preserve exactly one field per contract',()=>{
 const html=render('esi');
 for(const person of [...TRADELINK_MODULE_ACCOUNT_OPTIONS.esi.verifiedBy,...TRADELINK_MODULE_ACCOUNT_OPTIONS.esi.approvedBy])assert.ok(html.includes(person),person);
 for(const name of ['verifiedBy','approvedBy'])assert.equal(html.split('name="'+name+'"').length-1,1);
});
test('delivery QC and logistics roles preserve recipient and source terms order',()=>{
 const html=render('delivery');
 for(const name of ['checkedBy','deliveredBy','receivedBy'])assert.equal(html.split('name="'+name+'"').length-1,1);
 for(const person of TRADELINK_MODULE_ACCOUNT_OPTIONS.delivery.deliveredBy)assert.ok(html.includes(person),person);
 assert.ok(html.indexOf('tl-reference-terms')<html.indexOf('Delivery Tracking'));
});
test('Payment AR finance receiver and admin verifier are not duplicated',()=>{
 const html=render('payment');
 assert.match(html,/Payment Received By \(Finance\)/);
 assert.match(html,/Verified By \(Administration\)/);
 for(const name of ['receivedBy','verifiedBy'])assert.equal(html.split('name="'+name+'"').length-1,1);
});
test('Supplier PO Account Manager is defaulted but editable; timestamp cannot forge audit',()=>{
 const html=render('po');
 assert.match(html,/Reviewed By \(Account Manager\)/);
 assert.match(html,/value="aacsenagan@watchdogautomation.com.ph" selected/);
 assert.match(html,/aacsenagan@watchdogautomation.com.ph/);
 assert.match(html,/id="tl-pdf-time-verifiedBy"[^>]*disabled/);
 assert.match(html,/Use Time Now<\/button>/);
 const edited=render('po',{verifiedBy:'dsenagan@watchdogautomation.com.ph'});
 assert.match(edited,/value="dsenagan@watchdogautomation.com.ph" selected/);
 assert.doesNotMatch(edited,/value="aacsenagan@watchdogautomation.com.ph" selected/);
});
test('untrusted stored proposed personnel is escaped',()=>{
 const html=render('delivery',{checkedBy:'<img src=x onerror=alert(1)>'});
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/selected disabled/);
 assert.doesNotMatch(html,/<img src=x/);
});

test('exact account dropdown sets match the provided lists, without extra choices',()=>{
 const domain='@watchdogautomation.com.ph';
 const expected={
  esi:{verifiedBy:['msenagan','jtorino','dcabanas'],approvedBy:['asenagan','dsenagan','amsenagan']},
  delivery:{checkedBy:['dsenagan','asenagan','amsenagan'],deliveredBy:['rogang','jnunez','ppajulas','dcabanas','asenagan']},
  payment:{receivedBy:['msenagan'],verifiedBy:['asenagan']},
  po:{verifiedBy:['asenagan','aacsenagan','cerama','ppajulas','dsenagan'],approvedBy:['asenagan','dsenagan','amsenagan']}
 };
 for(const [type,fields] of Object.entries(expected)){
  const html=render(type);
  for(const [key,shortNames] of Object.entries(fields)){
   const options=shortNames.map(n=>n+domain);
   assert.deepEqual(TRADELINK_MODULE_ACCOUNT_OPTIONS[type][key],options);
   const start=html.indexOf('name="'+key+'"');
   assert.ok(start>0,type+':'+key);
   const open=html.lastIndexOf('<select',start);
   const close=html.indexOf('</select>',start);
   assert.ok(open>=0&&close>start,type+':'+key);
   const select=html.slice(open,close);
   const values=[...select.matchAll(/<option value="([^"]+)"/g)].map(m=>m[1]).filter(Boolean);
   assert.deepEqual(values,options,type+':'+key);
  }
 }
});
test('new account nominations reject out-of-list values and normalize case',()=>{
 const valid={documentType:'esi',verifiedBy:'MSENAGAN@WATCHDOGAUTOMATION.COM.PH',approvedBy:'asenagan@watchdogautomation.com.ph'};
 const normalized=validateTradeLinkModuleAccountAssignments(valid);
 assert.equal(normalized.verifiedBy,'msenagan@watchdogautomation.com.ph');
 for(const type of Object.keys(TRADELINK_MODULE_ACCOUNT_OPTIONS)){
  for(const [key,options] of Object.entries(TRADELINK_MODULE_ACCOUNT_OPTIONS[type])){
   const complete={documentType:type,...Object.fromEntries(Object.entries(TRADELINK_MODULE_ACCOUNT_OPTIONS[type]).map(([field,list])=>[field,list[0]]))};
   complete[key]='outsider@example.com';
   assert.throws(()=>validateTradeLinkModuleAccountAssignments(complete),/Select a listed TradeLink/);
   complete[key]=options.at(-1);
   assert.doesNotThrow(()=>validateTradeLinkModuleAccountAssignments(complete));
  }
 }
});
test('saved legacy human-readable names remain visible but disabled, never silently reassigned',()=>{
 const html=render('po',{verifiedBy:'Angelica Anne Camille Señagan'});
 assert.match(html,/value="Angelica Anne Camille Señagan" selected disabled/);
 assert.match(html,/select an authorized account/);
 assert.throws(()=>validateTradeLinkModuleAccountAssignments({documentType:'po',verifiedBy:'Angelica Anne Camille Señagan',approvedBy:'asenagan@watchdogautomation.com.ph'}));
});

test('each assigned module responsibility has an independent, inactive PDF time control',()=>{
 for(const [type,fields] of Object.entries(TRADELINK_MODULE_ACCOUNT_OPTIONS)){
  const html=render(type);
  const stages=[...html.matchAll(/data-tl-pdf-stage="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(stages,Object.keys(fields),type);
  assert.equal((html.match(/data-tl-pdf-time-control/g)||[]).length,stages.length,type);
  assert.equal((html.match(/aria-disabled="true" data-tl-pdf-time-control/g)||[]).length,stages.length,type);
  for(const key of stages)assert.match(html,new RegExp('id="tl-pdf-time-'+key+'"[^>]*disabled'));
  assert.match(html,/No local timestamp is an approval/);
 }
 const packing=render('packing');
 assert.doesNotMatch(packing,/data-tl-pdf-time-control|data-tl-pdf-stage/);
 const quotation=render('quotation');
 assert.match(quotation,/data-tl-review-stage="primary"/);
 assert.match(quotation,/data-tl-review-stage="secondary"/);
});
test('selected account is shown, unselected control hidden, legacy names cannot authorize approval',()=>{
 const chosen=render('esi',{verifiedBy:'msenagan@watchdogautomation.com.ph'});
 assert.match(chosen,/Assigned account: msenagan@watchdogautomation.com.ph/);
 assert.match(chosen,/data-tl-pdf-time-control[^>]*>Use Time Now/);
 const blank=render('esi');
 assert.match(blank,/data-tl-pdf-time-control[^>]*hidden>Use Time Now/);
 const legacy=render('delivery',{checkedBy:'Legacy Person'});
 assert.match(legacy,/previously saved; select an authorized account/);
 assert.match(legacy,/data-tl-pdf-time-control[^>]*hidden>Use Time Now/);
});
test('live selector updates only a local responsibility label; no approval action activated',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/responsible\.textContent=account/);
 assert.match(source,/control\.disabled=true/);
 assert.doesNotMatch(source,/data-tl-pdf-time-control.*data-action="tradelink-document-approve"/);
});
