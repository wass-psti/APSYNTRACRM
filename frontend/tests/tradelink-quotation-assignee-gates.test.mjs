import test from 'node:test';
import assert from 'node:assert/strict';
import {quotationReviewControlEligibility,renderTradeLinkDraftWorkspace,initialTradeLinkDraftView}
 from '../tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
const primary='aacsenagan@watchdogautomation.com.ph';
const management=['asenagan@watchdogautomation.com.ph','dsenagan@watchdogautomation.com.ph','amsenagan@watchdogautomation.com.ph'];
test('only the specific first-stage account matches primary, never another user',()=>{
 for(const actorEmail of ['', 'other@example.test',...management]){
  const result=quotationReviewControlEligibility({actorEmail,secondaryEmail:management[0],documentSaved:true});
  assert.equal(result.primaryAssigned,false);
  assert.equal(result.primaryEnabled,false);
 }
 const assigned=quotationReviewControlEligibility({actorEmail:primary.toUpperCase(),secondaryEmail:management[0],documentSaved:true});
 assert.equal(assigned.primaryAssigned,true);
 assert.equal(assigned.secondaryAssigned,false);
 assert.equal(assigned.primaryEnabled,false);
 assert.match(assigned.primaryReason,/not activated/);
});
test('only the selected Management account matches secondary, never other nominees',()=>{
 for(const selected of management){
  for(const actorEmail of [primary,...management,'other@example.test']){
   const access=quotationReviewControlEligibility({actorEmail,secondaryEmail:selected,documentSaved:true});
   assert.equal(access.secondaryAssigned,actorEmail===selected);
   assert.equal(access.secondaryEnabled,false);
  }
 }
 assert.equal(quotationReviewControlEligibility({actorEmail:'outsider@example.test',secondaryEmail:'outsider@example.test'}).secondaryAssigned,false);
});
test('matching identities never bypass missing signed stage-specific API contract',()=>{
 const eligible=quotationReviewControlEligibility({
  actorEmail:primary,secondaryEmail:management[0],documentSaved:true,
  primaryReviewAvailable:true,secondaryDecisionAvailable:true
 });
 assert.equal(eligible.primaryEnabled,false);
 assert.match(eligible.primaryReason,/pending verification/);
 const notSaved=quotationReviewControlEligibility({actorEmail:primary,documentSaved:false});
 assert.match(notSaved.primaryReason,/Save the quotation/);
});
test('quotation renders two explicitly unavailable actions with account-dependent reason',()=>{
 const workspaceId='00000000-0000-4000-8000-000000000001';
 const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',
 description:'[APSYNTRA:MODULE:tradelink:v1]',status:'active'},items:[],groups:[],columns:[]};
 const render=(actorEmail)=>renderTradeLinkDraftWorkspace({detail,workspaceId,canManage:true,
  view:initialTradeLinkDraftView('quotation'),actorEmail});
 const primaryHtml=render(primary);
 assert.match(primaryHtml,/data-tl-review-stage="primary"/);
 assert.match(primaryHtml,/Signed Sales Supervisor review is not activated|Save the quotation before recording a signed review/);
 assert.match(primaryHtml,/data-tl-review-stage="secondary"/);
 assert.equal((primaryHtml.match(/aria-disabled="true" data-tl-review-stage/g)||[]).length,2);
 const outsider=render('outsider@example.test');
 assert.match(outsider,/Available only to the assigned Sales Supervisor/);
 assert.match(outsider,/Available only to the selected Management approver/);
});
