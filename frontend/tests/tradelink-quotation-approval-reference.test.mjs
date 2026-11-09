import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {renderTradeLinkDraftWorkspace,initialTradeLinkDraftView,parseTradeLinkDraftForm}
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
 assert.match(html,/Reviewed By \(Sales Supervisor\)/);
 assert.match(html,/Review Date &amp; Time/);
 assert.match(html,/Approved By \(Management\)/);
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
 assert.match(edited,/&lt;script&gt;bad&lt;\/script&gt;/);
 assert.match(edited,/&lt;button&gt;Admin&lt;\/button&gt;/);
 assert.doesNotMatch(edited,/<script>bad|<button>Admin/);
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
