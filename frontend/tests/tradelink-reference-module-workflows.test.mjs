import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTradeLinkDraftWorkspace,initialTradeLinkDraftView} from '../tradelink-draft-workspace.js';
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
  assert.match(html,/Proposed personnel assignments only/);
  assert.doesNotMatch(html,/Workflow account assignments|readiness · preview only/);
 }
 const packing=render('packing');
 assert.match(packing,/Terms &amp; Conditions/);
 assert.doesNotMatch(packing,/tl-reference-module-approval|Verification &amp; Approval Workflow|Delivery Tracking|Payment Acknowledgement/);
});
test('ESI finance and management lists preserve exactly one field per contract',()=>{
 const html=render('esi');
 for(const person of ['Melanie P. Señagan','Jonerey Torino','Daniela C. Cabanas','Alex P. Señagan','Dionny P. Señagan','Amalia P. Señagan'])assert.ok(html.includes(person),person);
 for(const name of ['verifiedBy','approvedBy'])assert.equal(html.split('name="'+name+'"').length-1,1);
});
test('delivery QC and logistics roles preserve recipient and source terms order',()=>{
 const html=render('delivery');
 for(const name of ['checkedBy','deliveredBy','receivedBy'])assert.equal(html.split('name="'+name+'"').length-1,1);
 for(const person of ['Jerome L. Nuñez','Prospero C. Pajulas','Daniela C. Cabanas'])assert.ok(html.includes(person),person);
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
 assert.match(html,/value="Angelica Anne Camille Señagan" selected/);
 assert.match(html,/aacsenagan@watchdogautomation.com.ph/);
 assert.match(html,/id="tl-po-review-time"[^>]*disabled/);
 assert.match(html,/Use Time Now<\/button>/);
 const edited=render('po',{verifiedBy:'Dionny P. Señagan'});
 assert.match(edited,/value="Dionny P. Señagan" selected/);
 assert.doesNotMatch(edited,/value="Angelica Anne Camille Señagan" selected/);
});
test('untrusted stored proposed personnel is escaped',()=>{
 const html=render('delivery',{checkedBy:'<img src=x onerror=alert(1)>'});
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img src=x/);
});
