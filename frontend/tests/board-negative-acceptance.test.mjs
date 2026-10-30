import test from 'node:test';
import assert from 'node:assert/strict';
import {runSignedNegativeBoardAcceptance,identifySecurityScenario,sanitizeNegativeReport} from '../board-negative-acceptance.js';
import {TARGET_BOARDS,TARGET_WORKSPACE_ID} from '../board-security-targets.js';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const auth={userId:A,async getVerifiedUser(){return{id:A}}};
function api(ws,role,opts={}){
 const calls=[];
 return{auth,calls,
  async context(){calls.push('context');return{user_id:A,workspace_id:ws,profile:{status:'active',platform_role:role}};},
  async boards(){calls.push('boards');return opts.visible?[{id:TARGET_BOARDS[0].id}]:[];},
  async allowed(id,p){calls.push('allowed:'+p);
   if(opts.allow==='view'&&p==='view')return true;return false;},
  async board(id){calls.push('detail');throw Object.assign(new Error('denied'),{status:opts.detailStatus??403})},
  async boardEvents(id){calls.push('events');return opts.leakEvents?[{id:17}]:[];}
 };
}
test('real signed nonadmin workflow checks every one of twelve target boards with no writes',async()=>{
 const db=api(TARGET_WORKSPACE_ID,'employee');
 const result=await runSignedNegativeBoardAcceptance(auth,db);
 assert.equal(result.status,'pass');assert.equal(result.passed,12);
 assert.ok(result.results.every(r=>r.passed===6&&r.status==='pass'));
 assert.equal(db.calls.filter(x=>x==='detail').length,12);
 assert.equal(db.calls.filter(x=>x==='events').length,12);
 assert.ok(!db.calls.some(x=>/create|delete|update|commit|add/.test(x)));
});
test('different authoritative workspace is a valid cross-workspace negative test scenario',async()=>{
 const res=await runSignedNegativeBoardAcceptance(auth,api(B,'admin_general_manager'));
 assert.equal(res.status,'pass');assert.equal(res.scenario,'cross_workspace');
});
test('same-workspace platform admin cannot be falsely certified for nonmember denial',async()=>{
 const db=api(TARGET_WORKSPACE_ID,'admin_general_manager');
 const r=await runSignedNegativeBoardAcceptance(auth,db);
 assert.equal(r.status,'not_eligible');assert.equal(r.results.length,0);
 assert.deepEqual(db.calls,['context']);
});
test('unexpected authorized view fails closed without requesting board contents',async()=>{
 const db=api(TARGET_WORKSPACE_ID,'employee',{allow:'view'});
 const r=await runSignedNegativeBoardAcceptance(auth,db);
 assert.equal(r.status,'fail');assert.equal(r.results.length,1);
 assert.ok(!db.calls.includes('detail'));assert.ok(!db.calls.includes('events'));
});
test('event history leakage and visible board inclusion must fail',async()=>{
 const result=await runSignedNegativeBoardAcceptance(auth,api(TARGET_WORKSPACE_ID,'employee',{leakEvents:true}));
 assert.equal(result.status,'fail');
 assert.equal(result.results.length,1);
 const list=await runSignedNegativeBoardAcceptance(auth,api(TARGET_WORKSPACE_ID,'employee',{visible:true}));
 assert.equal(list.status,'fail');
});
test('a non-403 board error is not counted as authorization denial',async()=>{
 const r=await runSignedNegativeBoardAcceptance(auth,api(TARGET_WORKSPACE_ID,'employee',{detailStatus:404}));
 assert.equal(r.status,'fail');assert.equal(r.results[0].checks.detail.ok,false);
});
test('export contains only nonsecret evidence, never identity values',()=>{
 const value=sanitizeNegativeReport({status:'pass',scenario:'cross_workspace',passed:1,total:12,results:[
  {key:'fueltrans',status:'pass',passed:6,total:6,checks:{view:{ok:true}}}
 ]});
 assert.match(value,/"cross_workspace"/);assert.doesNotMatch(value,/11111111|@|Bearer|token/i);
});
