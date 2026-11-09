import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {renderTradeLinkDraftWorkspace,initialTradeLinkDraftView,parseTradeLinkDraftForm,applyQuotationApprovalHierarchy,QUOTATION_APPROVAL_HIERARCHY}
 from '../tradelink-draft-workspace.js';
const workspaceId='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',
 description:'[APSYNTRA:MODULE:tradelink:v1]',status:'active'},items:[],groups:[],columns:[]};
const view=initialTradeLinkDraftView('quotation');
const render=(params={})=>renderTradeLinkDraftWorkspace({detail,workspaceId,view,canManage:true,...params});

test('quotation shows source-aligned verification sequence and no duplicate approver fields',()=>{
 const html=render({actorName:'Signed Member'});
 assert.match(html,/Verification &amp; Approval Workflow/);
 assert.match(html,/Created By/);
 assert.match(html,/Signed Member/);
 assert.match(html,/Auto-captured on save/);
 assert.match(html,/Primary approver — Sales Supervisor/);
 assert.match(html,/Review Date &amp; Time/);
 assert.match(html,/Secondary approver — Management/);
 assert.equal((html.match(/name="verifiedBy"/g)||[]).length,1);
 assert.equal((html.match(/name="verifiedByEmail"/g)||[]).length,1);
 assert.equal((html.match(/name="approvedBy"/g)||[]).length,1);
 assert.equal((html.match(/name="approvedByEmail"/g)||[]).length,1);
 assert.doesNotMatch(html,/Workflow account assignments|Quotation readiness · preview only/);
 assert.match(html,/id="tl-quote-review-time"[^>]*disabled/);
 assert.match(html,/data-action="tradelink-draft-submit"/);
});

test('signed profile names and user field values are escaped, not rendered as HTML',()=>{
 const html=render({actorName:'<img src=x onerror=alert(1)>'});
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img src=x/);
 const unsafe={...view,formValues:{documentType:'quotation',verifiedBy:'<script>bad</script>',
 approvedBy:'<button>Admin</button>',verifiedByEmail:'person@example.test'}};
 const edited=render({view:unsafe});
 assert.doesNotMatch(edited,/<script>bad|<button>Admin/);
 assert.doesNotMatch(edited,/person@example\.test/);
 assert.match(edited,/aacsenagan@watchdogautomation\.com\.ph/);
 assert.match(edited,/asenagan@watchdogautomation\.com\.ph/);
 assert.match(edited,/dsenagan@watchdogautomation\.com\.ph/);
 assert.match(edited,/amsenagan@watchdogautomation\.com\.ph/);
});

test('quotation approval inputs retain original signed Draft field names without workflow mutations',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const shell=readFileSync('frontend/tradelink-application.js','utf8');
 assert.match(app,/actorName:name\(\)/);
 assert.match(shell,/view:draftView,canManage,actorName/);
 const values={documentType:'quotation',documentNumber:'Q-APP-1',customerName:'Example',
 customerEmail:'example@example.test',validity:'30 Days',deliveryCommitment:'4 Weeks',
 paymentTerms:'Net 30',approvedBy:'Proposed Manager',verifiedBy:'Proposed Supervisor',
 verifiedByEmail:'supervisor@example.test',approvedByEmail:'manager@example.test',
 lineDescription:'Part',lineQuantity:'1',lineUnitPrice:'50'};
 const payload=parseTradeLinkDraftForm({
  get:key=>values[key]??'',
  getAll:key=>[values[key]??'']
 },{lineId:()=> 'line-one'});
 assert.equal(payload.approvedBy,'Proposed Manager');
 assert.equal(payload.verifiedBy,'Proposed Supervisor');
 assert.equal(payload.approvedByEmail,'manager@example.test');
 assert.equal(payload.verifiedByEmail,'supervisor@example.test');
 assert.equal('reviewedAt' in payload,false);
 assert.equal('approvedAt' in payload,false);
 assert.equal('creatorId' in payload,false);
});

test('fixed quotation hierarchy is applied to all Draft saves, including malicious overrides',()=>{
 const unsafe={documentType:'quotation',verifiedBy:'Other',verifiedByEmail:'other@example.test',
 approvedBy:'Impostor'};
 const routed=applyQuotationApprovalHierarchy(unsafe);
 assert.equal(routed.verifiedBy,QUOTATION_APPROVAL_HIERARCHY.primary.label);
 assert.equal(routed.verifiedByEmail,'aacsenagan@watchdogautomation.com.ph');
 assert.equal(routed.approvedByEmail,'asenagan@watchdogautomation.com.ph');
 for(const email of QUOTATION_APPROVAL_HIERARCHY.secondaryOptions){
  assert.equal(applyQuotationApprovalHierarchy({...unsafe,approvedByEmail:email}).approvedByEmail,email);
 }
 assert.throws(()=>applyQuotationApprovalHierarchy({...unsafe,approvedByEmail:'impostor@example.test'}),/authorized Quotation management approver/);
 assert.equal(unsafe.verifiedByEmail,'other@example.test');
 assert.equal(applyQuotationApprovalHierarchy({documentType:'esi',verifiedBy:'Finance'}).verifiedBy,'Finance');
 const source=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 assert.match(source,/validateTradeLinkDraftEnvelope\(applyQuotationApprovalHierarchy\(draft\)\)/);
});
