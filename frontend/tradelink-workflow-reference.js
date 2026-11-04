/** CP-TL-WF01 — Source-defined workflow reference, not an authorization engine.
 * Derived from uploaded TradeLink 0.1.74 src/domain/workflow.ts.
 * These descriptors must never be used to grant or commit a transition.
 */
const STATES=Object.freeze(['draft','submitted','under-review','revision-required',
 'approved','rejected','completed','cancelled']);
const TYPES=Object.freeze(['esi','packing','delivery','payment','quotation','po']);
export const TRADELINK_WORKFLOW_ACTIONS=Object.freeze({
 submit:{label:'Submit',capability:'workflow.submit',reasonRequired:false,target:'submitted'},
 review:{label:'Record Review',capability:'workflow.review',reasonRequired:false,target:'under-review'},
 'request-revision':{label:'Request Revision',capability:'workflow.revise',reasonRequired:true,target:'revision-required'},
 approve:{label:'Approve',capability:'workflow.approve',reasonRequired:false,target:'approved'},
 reject:{label:'Reject',capability:'workflow.reject',reasonRequired:true,target:'rejected'},
 complete:{label:'Mark Completed',capability:'workflow.complete',reasonRequired:false,target:'completed'},
 reopen:{label:'Reopen',capability:'workflow.reopen',reasonRequired:true,target:'draft'},
 cancel:{label:'Cancel',capability:'workflow.cancel',reasonRequired:true,target:'cancelled'}
});
export const TRADELINK_WORKFLOW_LABELS=Object.freeze({
 draft:'Draft',submitted:'Submitted','under-review':'Under Review',
 'revision-required':'Revision Required',approved:'Approved',
 rejected:'Rejected',completed:'Completed',cancelled:'Cancelled'
});
const DEFAULT=Object.freeze({
 draft:['submit','cancel'],
 submitted:['review','request-revision','approve','reject','cancel'],
 'under-review':['request-revision','approve','reject','cancel'],
 'revision-required':['submit','cancel'],
 approved:['complete','reopen'],
 rejected:['reopen'],completed:['reopen'],cancelled:['reopen']
});
export function sourceWorkflowTransitions(type,state,{hasVerifier=false}={}){
 if(!TYPES.includes(type)||!STATES.includes(state))return [];
 let actions=DEFAULT[state];
 if(type==='packing'){
  if(state==='draft'||state==='revision-required')actions=['submit','cancel'];
  else if(['completed','cancelled','rejected'].includes(state))actions=['reopen'];
 }
 if(type==='delivery'||type==='payment'){
  if(state==='draft'||state==='revision-required')actions=['submit','cancel'];
  else if(state==='submitted'){
   actions=type==='payment'&&hasVerifier?
    ['review','request-revision','reject','complete','cancel']:
    ['request-revision','reject','complete','cancel'];
  }else if(state==='under-review')actions=['request-revision','reject','complete','cancel'];
  else if(['completed','cancelled','rejected'].includes(state))actions=['reopen'];
 }
 return actions.map(action=>{
  const d=TRADELINK_WORKFLOW_ACTIONS[action];
  return {from:state,action,label:d.label,target:action==='submit'&&type==='packing'?
   'completed':d.target,capability:d.capability,reasonRequired:d.reasonRequired};
 });
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
export function renderTradeLinkWorkflowReference(type){
 if(!TYPES.includes(type))return '';
 const rows=STATES.flatMap(state=>sourceWorkflowTransitions(type,state));
 return '<details class="tl-workflow-reference"><summary>View original workflow transition matrix</summary>'+
  '<p>Source-defined candidate transitions only. Real availability also depends on signed role capabilities, assigned reviewer/approver, document validation, timestamps and server authorization.</p>'+
  '<div class="tl-records-scroll"><table class="tl-records-table"><thead><tr>'+
  '<th scope="col">From</th><th scope="col">Action</th><th scope="col">To</th>'+
  '<th scope="col">Capability</th><th scope="col">Reason</th></tr></thead><tbody>'+
  rows.map(r=>'<tr><td>'+esc(TRADELINK_WORKFLOW_LABELS[r.from])+'</td>'+
   '<td>'+esc(r.label)+'</td><td>'+esc(TRADELINK_WORKFLOW_LABELS[r.target])+'</td>'+
   '<td><code>'+esc(r.capability)+'</code></td>'+
   '<td>'+(r.reasonRequired?'Required':'Optional')+'</td></tr>').join('')+
  '</tbody></table></div><p class="muted">This reference is read-only; no workflow action is committed from this table.</p></details>';
}
