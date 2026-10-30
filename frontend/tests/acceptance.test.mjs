import test from 'node:test';
import assert from 'node:assert/strict';
import {runReadOnlyAcceptance,summarizeAcceptance} from '../acceptance.js';

const USER='11111111-1111-4111-8111-111111111111';
const WORK='22222222-2222-4222-8222-222222222222';
const BOARD='33333333-3333-4333-8333-333333333333';
const auth={userId:USER,async getVerifiedUser(){return{id:USER}}};
function service({boards=[{id:BOARD,name:'Contacts'}],allow=true,unavailable=false}={}){
 const calls=[];
 return {
  calls,
  async context(){calls.push('context');return{user_id:USER,workspace_id:WORK,profile:{status:'active'}};},
  async boards(){calls.push('boards');return boards;},
  async board(id){calls.push('board');if(id!==BOARD)throw Error('unknown');return{board:{id}};},
  async allowed(id,mode){calls.push('allowed');assert.equal(mode,'view');return allow;},
  async issues(id,work){calls.push('issues');if(unavailable)throw Object.assign(new Error('denied'),{status:403});assert.equal(work,WORK);return [];}
 };
}
test('actual signed-session contract produces six distinct PASS checks without writes',async()=>{
 const api=service();
 const results=await runReadOnlyAcceptance(auth,api);
 assert.deepEqual(summarizeAcceptance(results),{passed:6,failed:0,pending:0,total:6,certified:true});
 assert.deepEqual(api.calls,['context','boards','board','allowed','issues']);
});
test('lack of board is PENDING, never a false success',async()=>{
 const api=service({boards:[]});
 const result=summarizeAcceptance(await runReadOnlyAcceptance(auth,api));
 assert.deepEqual(result,{passed:3,failed:0,pending:3,total:6,certified:false});
});
test('backend permission denial blocks remaining checks',async()=>{
 const result=await runReadOnlyAcceptance(auth,service({allow:false}));
 assert.equal(result.find(x=>x.id==='board-permission').status,'fail');
 assert.equal(result.find(x=>x.id==='huly-view').status,'pending');
 assert.equal(summarizeAcceptance(result).certified,false);
});
test('RLS view denial appears as failed, not success',async()=>{
 const result=await runReadOnlyAcceptance(auth,service({unavailable:true}));
 assert.equal(result.find(x=>x.id==='huly-view').status,'fail');
 assert.match(result.find(x=>x.id==='huly-view').detail,/403/);
});
test('mismatched Auth identity denies all dependent verification',async()=>{
 const result=await runReadOnlyAcceptance({userId:USER,async getVerifiedUser(){return{id:WORK}}},service());
 assert.equal(result[0].status,'fail');
 assert.equal(result.filter(x=>x.status==='pending').length,5);
});
