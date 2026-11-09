import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTradeLinkDraftWorkspace,initialTradeLinkDraftView} from '../tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
const workspaceId='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',
 description:'[APSYNTRA:MODULE:tradelink:v1]',status:'active'},items:[],groups:[],columns:[]};
const render=(documentType='quotation')=>renderTradeLinkDraftWorkspace({
 detail,workspaceId,canManage:true,view:initialTradeLinkDraftView(documentType),actorName:'Signed Member'
});
test('Quotation shows terms before final approval and two independent review timestamp controls',()=>{
 const html=render();
 const terms=html.indexOf('class="tl-reference-form-section tl-reference-terms"');
 const approval=html.indexOf('class="tl-reference-approval"');
 const actions=html.indexOf('class="tl-draft-actions"');
 assert.ok(terms>0&&approval>terms&&actions>approval);
 assert.equal((html.match(/>Use Time Now<\/button>/g)||[]).length,2);
 assert.match(html,/id="tl-quote-review-time"[^>]*disabled/);
 assert.match(html,/id="tl-quote-secondary-review-time"[^>]*disabled/);
 assert.match(html,/id="tl-quote-secondary-review-time" aria-label="Secondary review date and time"/);
 assert.match(html,/Management verification is independent of the Sales Supervisor review/);
 assert.equal((html.match(/name="approvedByEmail"/g)||[]).length,1);
 assert.equal((html.match(/name="verifiedByEmail"/g)||[]).length,1);
 assert.doesNotMatch(html,/name="reviewedAt"|name="secondaryReviewedAt"/);
});
test('non-quotation workflows retain existing sections and no fake secondary verification control',()=>{
 const html=render('esi');
 assert.doesNotMatch(html,/tl-quote-secondary-review-time/);
 assert.match(html,/Workflow account assignments/);
});
