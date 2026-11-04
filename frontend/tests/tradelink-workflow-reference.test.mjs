import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_WORKFLOW_ACTIONS,TRADELINK_WORKFLOW_LABELS,
 sourceWorkflowTransitions,renderTradeLinkWorkflowReference} from '../tradelink-workflow-reference.js';

test('source draft, submitted and approval workflow candidates match original TradeLink transitions',()=>{
 assert.deepEqual(sourceWorkflowTransitions('quotation','draft').map(r=>[r.action,r.target]),
  [['submit','submitted'],['cancel','cancelled']]);
 assert.deepEqual(sourceWorkflowTransitions('quotation','submitted').map(r=>r.action),
  ['review','request-revision','approve','reject','cancel']);
 assert.deepEqual(sourceWorkflowTransitions('po','under-review').map(r=>r.action),
  ['request-revision','approve','reject','cancel']);
 assert.deepEqual(sourceWorkflowTransitions('esi','approved').map(r=>r.action),
  ['complete','reopen']);
 assert.equal(sourceWorkflowTransitions('quotation','cancelled')[0].target,'draft');
});
test('packing list submit completes immediately; logistics and payment paths do not borrow approvals',()=>{
 assert.deepEqual(sourceWorkflowTransitions('packing','draft').map(r=>[r.action,r.target]),
  [['submit','completed'],['cancel','cancelled']]);
 assert.deepEqual(sourceWorkflowTransitions('packing','completed').map(r=>r.action),['reopen']);
 assert.deepEqual(sourceWorkflowTransitions('delivery','submitted').map(r=>r.action),
  ['request-revision','reject','complete','cancel']);
 assert.deepEqual(sourceWorkflowTransitions('payment','submitted').map(r=>r.action),
  ['request-revision','reject','complete','cancel']);
 assert.deepEqual(sourceWorkflowTransitions('payment','submitted',{hasVerifier:true}).map(r=>r.action),
  ['review','request-revision','reject','complete','cancel']);
 assert.deepEqual(sourceWorkflowTransitions('payment','under-review').map(r=>r.action),
  ['request-revision','reject','complete','cancel']);
});
test('transition reasons and capability labels remain source-defined',()=>{
 for(const [name,def] of Object.entries(TRADELINK_WORKFLOW_ACTIONS)){
  assert.match(def.capability,/^workflow\./,name);
  assert.ok(def.label.length>0,name);
  assert.equal(typeof def.reasonRequired,'boolean');
 }
 for(const action of ['request-revision','reject','reopen','cancel'])
  assert.equal(TRADELINK_WORKFLOW_ACTIONS[action].reasonRequired,true);
 assert.deepEqual(Object.keys(TRADELINK_WORKFLOW_LABELS),
  ['draft','submitted','under-review','revision-required','approved','rejected','completed','cancelled']);
});
test('invalid domain input is never treated as a valid transition',()=>{
 assert.deepEqual(sourceWorkflowTransitions('unknown','draft'),[]);
 assert.deepEqual(sourceWorkflowTransitions('quotation','nonexistent'),[]);
 assert.equal(renderTradeLinkWorkflowReference('unknown'),'');
});
test('reference is semantic, read-only and accessible without granting role privileges',()=>{
 const html=renderTradeLinkWorkflowReference('quotation');
 assert.match(html,/<details class="tl-workflow-reference"><summary>/);
 assert.match(html,/<th scope="col">From<\/th>/);
 assert.match(html,/workflow\.approve/);
 assert.match(html,/server authorization/);
 assert.doesNotMatch(html,/data-action=|type="submit"|data-workflow-submit|fetch\(/);
 const app=readFileSync('frontend/tradelink-application.js','utf8');
 assert.match(app,/renderTradeLinkWorkflowReference\(m\.key\)/);
 assert.match(app,/Original document lifecycle/);
 const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
 assert.match(smoke,/frontend\/tradelink-workflow-reference\.js/);
});
