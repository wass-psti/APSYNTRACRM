import test from 'node:test';
import assert from 'node:assert/strict';
import {RoleConfigurationClient} from '../role-configuration-client.js';
const W='11111111-1111-4111-8111-111111111111';
test('unverified bootstrap cannot be assumed from profile or a username',async()=>{
 const calls=[];const client=new RoleConfigurationClient({rpc:async name=>{calls.push(name);return false}});
 assert.equal(await client.bootstrapVerified(),false);
 assert.deepEqual(calls,['apsyntra_role_is_bootstrap']);
});
test('snapshot requires server-verified scoped response, not guessed data',async()=>{
 const client=new RoleConfigurationClient({rpc:async()=>({bootstrapVerified:true,workspaceId:W,mode:'staged_only',
 roles:[],users:[],assignments:[],boards:[],proposals:[],audit:[]})});
 assert.equal((await client.snapshot(W)).mode,'staged_only');
 await assert.rejects(()=>client.snapshot('wrong'));
});
test('stage sends only proposal RPC and never touches live role assignment endpoints',async()=>{
 const calls=[];const client=new RoleConfigurationClient({rpc:async(name,args)=>{
  calls.push([name,args]);return '22222222-2222-4222-8222-222222222222';
 }});
 await client.propose(W,'assignment.assign',{userId:'33333333-3333-4333-8333-333333333333',
 moduleId:'time-tracker',role:'Employee'});
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],'apsyntra_role_configuration_propose');
 assert.ok(!JSON.stringify(calls).includes('wm_admin_set_application_role'));
 await assert.rejects(()=>client.propose(W,'bootstrap.grant',{}));
});
