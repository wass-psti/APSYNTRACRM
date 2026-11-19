import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RoleConfigurationClient} from '../role-configuration-client.js';
const W='11111111-1111-4111-8111-111111111111';
test('unverified bootstrap cannot be assumed from profile or a username',async()=>{
 const calls=[];const client=new RoleConfigurationClient({rpc:async name=>{calls.push(name);return false}});
 assert.equal(await client.bootstrapVerified(),false);
 assert.deepEqual(calls,['apsyntra_role_is_bootstrap']);
});
test('snapshot requires server-verified scoped response, not guessed data',async()=>{
 const client=new RoleConfigurationClient({rpc:async()=>({adminVerified:true,bootstrapVerified:false,workspaceId:W,mode:'staged_only',
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

test('staged proposal readback requires exact persisted ID, payload and workspace',async()=>{
 const {stagedProposalReadbackVerified:verify}=await import('../role-configuration-client.js');
 const id='22222222-2222-4222-8222-222222222222';
 const payload={roleKey:'finance_ops',permissions:{read:true,edit:true}};
 const snapshot={workspaceId:W,mode:'staged_only',proposals:[{id,operation:'role.create',status:'proposed',
   payload:{permissions:{edit:true,read:true},roleKey:'finance_ops'}}]};
 const expected={workspaceId:W,id,operation:'role.create',payload};
 assert.equal(verify(snapshot,expected),true);
 assert.equal(verify({...snapshot,proposals:[]},expected),false);
 assert.equal(verify({...snapshot,workspaceId:'33333333-3333-4333-8333-333333333333'},expected),false);
 assert.equal(verify({...snapshot,mode:'active'},expected),false);
 assert.equal(verify(snapshot,{...expected,id:'44444444-4444-4444-8444-444444444444'}),false);
 assert.equal(verify(snapshot,{...expected,operation:'assignment.assign'}),false);
 assert.equal(verify(snapshot,{...expected,payload:{roleKey:'finance_ops',permissions:{edit:true,read:false}}}),false);
 assert.equal(verify({...snapshot,proposals:[{...snapshot.proposals[0],status:'applied'}]},expected),false);
});
test('proposal UI does not announce success before exact authoritative readback',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const handler=app.slice(app.indexOf('async function stageRoleProposal('),app.indexOf('async function refreshFoundation()'));
 assert.ok(handler.includes('const proposalId=await roleConfig.propose'));
 assert.ok(handler.includes('await loadRoleConfiguration();'));
 assert.ok(handler.includes('if(!stagedProposalReadbackVerified(state.roleData'));
 assert.ok(handler.indexOf('stagedProposalReadbackVerified')<handler.indexOf("toast('Staged proposal persisted and verified"));
 assert.ok(handler.includes('No production access has changed'));
});
