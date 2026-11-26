import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {projectFRTAging,loadFRTFinanceReadOnly} from '../frt-finance-readonly.js';
import {renderFRTFinanceReadOnly} from '../frt-finance-ui.js';
const ws='22222222-2222-4222-8222-222222222222',user='11111111-1111-4111-8111-111111111111';
const base={company_code:'WAO',pending_total:4,awaiting_bank_execution:1,on_track:1,due_soon:1,
 overdue:1,completed:2,source:'STAFF_RECORDED_BANK_EVIDENCE',deadline_hours:72};
test('company aging projection rejects mismatched company, invalid buckets and fake amounts',()=>{
 assert.deepEqual(projectFRTAging(base,'WAO'),{
  pending_total:4,awaiting_bank_execution:1,on_track:1,due_soon:1,overdue:1,completed:2});
 for(const malformed of [{...base,company_code:'WASS'},{...base,overdue:'1'},
  {...base,overdue:2},{...base,source:'GM_VERIFIED'}, {...base,deadline_hours:24},
  {...base,completed:-1}])
  assert.equal(projectFRTAging(malformed,'WAO'),null);
});
function fixture(aging=base){
 const auth={userId:user,async getVerifiedUser(){return {id:user}}};
 const rpcCalls=[];
 const api={async context(){return {user_id:user,workspace_id:ws,profile:{status:'active'}}},
  async rpc(name,args){rpcCalls.push([name,args]);
   if(name==='frt_bootstrap')return {membership:{user_id:user,workspace_id:ws,
    role:'GENERAL_MANAGER',enabled:true,status:'active'},
    companies:[{code:'WAO',name:'Watchdog OPC'},{code:'WASS',name:'Another company'}]};
   if(name==='frt_board_dashboard_safe')return {total_requests:6,pending:0,in_progress:4,
    completed:2,pending_liquidation_count:4};
   if(name==='frt_board_list_safe')return [];
   if(name==='frt_liquidation_aging_company')return aging;
   throw Error('Unexpected RPC '+name);
 }};
 return {auth,api,rpcCalls};
}
test('signed company-scoped read integrates aging into tracker, executive and OPEX without revealing references',async()=>{
 const f=fixture(),r=await loadFRTFinanceReadOnly(f);
 assert.equal(r.status,'PASS');
 assert.equal(r.agingStatus,'PASS');
 assert.equal(r.aging.overdue,1);
 assert.deepEqual(f.rpcCalls.find(([name])=>name==='frt_liquidation_aging_company')[1],
  {p_workspace_id:ws,p_company:'WAO'});
 for(const view of ['tracker','executive','opex']){
  const html=renderFRTFinanceReadOnly({result:r,view});
  assert.match(html,/Liquidation aging/);
  assert.match(html,/Awaiting bank execution/);
  assert.match(html,/Due within 24 hours/);
  assert.match(html,/Overdue/);
  assert.match(html,/72 hours/);
  assert.doesNotMatch(html,/Bank transfer confirmed by bank/);
 }
});
test('CP-FRT-UI-01 renders five compact aging cards without generic settings-grid spacing',async()=>{
 const r=await loadFRTFinanceReadOnly(fixture());
 const html=renderFRTFinanceReadOnly({result:r,view:'tracker'});
 assert.match(html,/class="frt-exec-panel frt-exec-aging"/);
 assert.match(html,/class="frt-exec-aging-grid" role="list"/);
 assert.equal((html.match(/class="frt-exec-aging-card /g)||[]).length,5);
 for(const tone of ['is-awaiting','is-on-track','is-due-soon','is-overdue','is-approved'])
  assert.match(html,new RegExp('frt-exec-aging-card '+tone));
 for(const label of ['Awaiting bank execution','Due after 24 hours','Due within 24 hours',
  'Overdue','Liquidation approved'])assert.ok(html.includes(label),label);
 for(const value of ['>1</strong>','>2</strong>','Pending: 4.'])
  assert.ok(html.includes(value),value);
 assert.match(html,/staff-entered evidence, not bank API confirmation/);
 const start=html.indexOf('<section class="frt-exec-panel frt-exec-aging"');
 const end=html.indexOf('</section>',start);
 const agingPanel=html.slice(start,end);
 assert.doesNotMatch(agingPanel,/settings-grid|settings-detail/);
});
test('CP-FRT-UI-01 keeps aging empty state explicit and does not render zero-value cards',async()=>{
 const f=fixture();
 const rpc=f.api.rpc.bind(f.api);
 f.api.rpc=async(name,args)=>name==='frt_liquidation_aging_company'?
  Promise.reject(Object.assign(Error('not deployed'),{code:'PGRST202'})):rpc(name,args);
 const r=await loadFRTFinanceReadOnly(f);
 const html=renderFRTFinanceReadOnly({result:r,view:'tracker'});
 assert.match(html,/frt-exec-aging-unavailable/);
 assert.match(html,/Signed company aging is unavailable/);
 assert.doesNotMatch(html,/frt-exec-aging-card|Awaiting bank execution/);
});
test('CP-FRT-UI-01 styles the component for responsive light and dark appearances',()=>{
 const css=readFileSync(new URL('../frt-reference-dashboard.css',import.meta.url),'utf8');
 const dark=readFileSync(new URL('../dark-native-applications.css',import.meta.url),'utf8');
 const bundle=readFileSync(new URL('../apsyntra-styles.bundle.css',import.meta.url),'utf8');
 for(const term of ['frt-exec-aging-grid','frt-exec-aging-card','frt-exec-aging-disclosure',
  '@media(min-width:760px)','@media(max-width:380px)'])assert.ok(css.includes(term),term);
 for(const term of ['frt-exec-aging-card','frt-exec-aging-disclosure','var(--crm-native-panel)'])
  assert.ok(dark.includes(term),term);
 assert.match(bundle,/CP-FRT-UI-01 — compact, responsive Liquidation Aging metric cards/);
 assert.match(bundle,/CP-FRT-UI-01 — Liquidation Aging remains legible in dark appearance/);
});
test('unavailable aging RPC degrades to unavailable rather than fake zero or failed base dashboard',async()=>{
 const f=fixture();const rpc=f.api.rpc.bind(f.api);
 f.api.rpc=async(name,args)=>name==='frt_liquidation_aging_company'?
  Promise.reject(Object.assign(Error('not deployed'),{code:'PGRST202'})):rpc(name,args);
 const r=await loadFRTFinanceReadOnly(f);
 assert.equal(r.status,'PASS');
 assert.equal(r.agingStatus,'UNAVAILABLE');
 assert.equal(r.aging,null);
 const html=renderFRTFinanceReadOnly({result:r});
 assert.match(html,/Signed company aging is unavailable/);
 assert.doesNotMatch(html,/Due within 24 hours/);
});
test('mismatched signed aggregate cannot silently show cross-company aging',async()=>{
 const r=await loadFRTFinanceReadOnly(fixture({...base,company_code:'WASS'}));
 assert.equal(r.status,'PASS');assert.equal(r.aging,null);
 assert.equal(r.agingStatus,'INVALID_CONTRACT');
});
test('migration uses signed existing role resolver and no financial write or grant widening',()=>{
 const name=readdirSync(new URL('../../supabase/migrations/',import.meta.url))
  .find(n=>n.endsWith('frt_wf04_signed_aging_summary.sql'));
 const sql=readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
 for(const term of ['private.frt_current_role','frt_liquidation_aging_company',
  "frt_bank_executions","interval '3 days'","interval '24 hours'",
  'r.company_id=v_company_id','r.workspace_id=p_workspace_id'])
  assert.ok(sql.includes(term),term);
 assert.doesNotMatch(sql,/INSERT INTO|UPDATE public\.frt|ALTER TABLE|GRANT SELECT ON/);
});
