import test from 'node:test';
import assert from 'node:assert/strict';
import {quotationReviewControlEligibility,renderTradeLinkDraftWorkspace,initialTradeLinkDraftView,
 quotationSecondaryOptionsForDocument,CP_TL_08E_TEMP_REVIEW}
 from '../tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
const primary='aacsenagan@watchdogautomation.com.ph';
const management=['asenagan@watchdogautomation.com.ph','dsenagan@watchdogautomation.com.ph','amsenagan@watchdogautomation.com.ph'];
test('only the specific first-stage account matches primary, never another user',()=>{
 for(const actorEmail of ['', 'other@example.test',...management]){
  const result=quotationReviewControlEligibility({actorEmail,secondaryEmail:management[0],documentSaved:true,workflowState:'for-approval'});
  assert.equal(result.primaryAssigned,false);
  assert.equal(result.primaryEnabled,false);
 }
 const assigned=quotationReviewControlEligibility({actorEmail:primary.toUpperCase(),secondaryEmail:management[0],documentSaved:true,workflowState:'for-approval'});
 assert.equal(assigned.primaryAssigned,true);
 assert.equal(assigned.secondaryAssigned,false);
 assert.equal(assigned.primaryEnabled,true);
 assert.match(assigned.primaryReason,/Record your signed validation/);
});
test('only the selected Management account matches secondary, never other nominees',()=>{
 for(const selected of management){
  for(const actorEmail of [primary,...management,'other@example.test']){
   const access=quotationReviewControlEligibility({actorEmail,secondaryEmail:selected,documentSaved:true,workflowState:'for-approval'});
   assert.equal(access.secondaryAssigned,actorEmail===selected);
   assert.equal(access.secondaryEnabled,actorEmail===selected);
  }
 }
 assert.equal(quotationReviewControlEligibility({actorEmail:'outsider@example.test',secondaryEmail:'outsider@example.test'}).secondaryAssigned,false);
});

test('temporary CP-TL-08E reviewer is selectable and eligible only on its named QA document',()=>{
 const {documentNumber,reviewerEmail}=CP_TL_08E_TEMP_REVIEW;
 const options=quotationSecondaryOptionsForDocument(documentNumber);
 assert.ok(options.includes(reviewerEmail));
 assert.ok(!quotationSecondaryOptionsForDocument('Q-OTHER-01').includes(reviewerEmail));
 const accepted=quotationReviewControlEligibility({actorEmail:reviewerEmail,secondaryEmail:reviewerEmail,
  secondaryOptions:options,documentSaved:true,workflowState:'for-approval'});
 assert.equal(accepted.secondaryAssigned,true);
 assert.equal(accepted.secondaryEnabled,true);
 const rejected=quotationReviewControlEligibility({actorEmail:reviewerEmail,secondaryEmail:reviewerEmail,
  documentSaved:true,workflowState:'for-approval'});
 assert.equal(rejected.secondaryAssigned,false);
 assert.equal(rejected.secondaryEnabled,false);
 const workspaceId='00000000-0000-4000-8000-000000000001';
 const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',
  description:'[APSYNTRA:MODULE:tradelink:v1]',status:'active'},items:[],groups:[],columns:[]};
 const html=renderTradeLinkDraftWorkspace({detail,workspaceId,canManage:true,actorEmail:reviewerEmail,
  view:{...initialTradeLinkDraftView('quotation'),mode:'edit',selected:{documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',record:{document_type:'quotation',document_number:documentNumber,workflow_state:'for-approval',revision:1,archived_at:null,content:{documentType:'quotation',documentNumber,verifiedByEmail:primary,approvedByEmail:reviewerEmail}}}}});
 assert.match(html,new RegExp('value="'+reviewerEmail+'" selected'));
 assert.match(html,/data-tl-review-stage="secondary"/);
});

test('matching identities never bypass missing signed stage-specific API contract',()=>{
 const eligible=quotationReviewControlEligibility({
  actorEmail:primary,secondaryEmail:management[0],documentSaved:true,
  workflowState:'for-approval'
 });
 assert.equal(eligible.primaryEnabled,true);
 assert.match(eligible.primaryReason,/Record your signed validation/);
 const notSaved=quotationReviewControlEligibility({actorEmail:primary,documentSaved:false});
 assert.match(notSaved.primaryReason,/Save the document/);
});
test('quotation exposes signed validation only to the assigned reviewer on a saved For Approval document',()=>{
 const workspaceId='00000000-0000-4000-8000-000000000001';
 const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',
 description:'[APSYNTRA:MODULE:tradelink:v1]',status:'active'},items:[],groups:[],columns:[]};
 const render=(actorEmail)=>renderTradeLinkDraftWorkspace({detail,workspaceId,canManage:true,
  view:{...initialTradeLinkDraftView('quotation'),mode:'edit',selected:{documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',record:{document_type:'quotation',document_number:'Q-01',workflow_state:'for-approval',revision:1,archived_at:null,content:{documentType:'quotation',documentNumber:'Q-01',verifiedByEmail:primary,approvedByEmail:management[0]}}}},actorEmail});
 const primaryHtml=render(primary);
 assert.match(primaryHtml,/data-tl-review-stage="primary"/);
 assert.match(primaryHtml,/data-action=\"tradelink-document-review-stage\"/);
 assert.match(primaryHtml,/data-tl-review-stage="secondary"/);
 assert.equal((primaryHtml.match(/data-action="tradelink-document-review-stage"/g)||[]).length,2);
 const outsider=render('outsider@example.test');
 assert.match(outsider,/Only the assigned account can validate/);
 assert.match(outsider,/Only the assigned account can validate/);
});
