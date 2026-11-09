import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WS02D_ACCEPTANCE_ENABLED,captureInvitationLink,
 renderInvitationAcceptance,WorkspaceInvitationAcceptanceClient
} from '../workspace-invitation-acceptance.js';
const workspace='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
const token='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.'+'ab'.repeat(32);
const receipt={state:'accepted',workspaceId:workspace,role:'member',switched:false};
const location={pathname:'/APSYNTRACRM/',search:'',hash:'#/invitations/accept/'+token};
function setup({enabled=true,status='active',actorId=actor,raw=receipt,error=null}={}){
 const calls=[];
 const auth={userId:actor,getVerifiedUser:async()=>({id:actorId}),
  authorized:async(path,options)=>{calls.push({path,options});if(error)throw error;return raw;}};
 const api={context:async()=>({user_id:actor,workspace_id:workspace,profile:{status}})};
 return {calls,client:new WorkspaceInvitationAcceptanceClient({auth,api,enabled})};
}
test('one-time bearer token is scrubbed from URL before any app view',()=>{
 let target='';
 const history={state:{existing:1},replaceState:(state,title,url)=>{target=url;assert.deepEqual(state,{existing:1});}};
 const captured=captureInvitationLink(location,history);
 assert.deepEqual(captured,{status:'ready',token});
 assert.equal(target,'/APSYNTRACRM/#/invitations/accept');
 assert.equal(target.includes(token),false);
 assert.equal(captureInvitationLink({...location,hash:'#/overview'},history),null);
 assert.equal(captureInvitationLink(location,{replaceState:()=>{throw Error('blocked');}}).status,'invalid');
});
test('invalid fragment token is always scrubbed and never retained',()=>{
 let target='';
 for(const suffix of ['../invalid','https://evil.invalid','short','']){
  const captured=captureInvitationLink({...location,hash:'#/invitations/accept/'+suffix},
   {replaceState:(_,__,url)=>{target=url;}});
  assert.deepEqual(captured,{status:'invalid',token:null});
  assert.equal(target,'/APSYNTRACRM/#/invitations/accept');
 }
});
test('UI never displays recipient bearer token and disables acceptance by default',()=>{
 assert.equal(WS02D_ACCEPTANCE_ENABLED,false);
 for(const args of [{pending:{status:'ready',token}},
  {pending:{status:'invalid',token:null}}, {pending:null},
  {pending:{status:'ready',token},status:'unconfirmed'}]){
  const ui=renderInvitationAcceptance(args);
  assert.doesNotMatch(ui,/aaaaaaaa-aaaa-4aaa|ab{5}/);
  assert.match(ui,/data-action="ws02d-accept-invitation" disabled/);
 }
 const active=renderInvitationAcceptance({pending:{status:'ready',token},enabled:true});
 assert.match(active,/data-action="ws02d-accept-invitation">/);
});
test('signed recipient accepted via trusted endpoint without automatic token retry',async()=>{
 const {calls,client}=setup();
 assert.deepEqual(await client.accept(token),receipt);
 assert.deepEqual(calls,[{path:'/functions/v1/ws02d-accept',options:{
  method:'POST',retryUnauthorized:false,body:{token}
 }}]);
});
test('disabled, malicious token and revoked/mismatched signed context never reach backend',async()=>{
 for(const options of [{enabled:false},{status:'disabled'},{actorId:workspace}]){
  const {client,calls}=setup(options);
  await assert.rejects(client.accept(token));
  assert.equal(calls.length,0);
 }
 const {client,calls}=setup();
 for(const secret of ['bad',token+'x','https://evil.invalid',token.toUpperCase()])
  await assert.rejects(client.accept(secret),{status:400});
 assert.equal(calls.length,0);
});
test('server denial, timeout and bad receipt do not report accepted membership',async()=>{
 for(const raw of [{...receipt,switched:true},{...receipt,role:'admin'},
  {...receipt,state:'pending'},{...receipt,workspaceId:'invalid'},null]){
  const {client}=setup({raw});
  await assert.rejects(client.accept(token),{status:409});
 }
 const secret='internal email and bearer token';
 for(const status of [0,401,403,404,500,503]){
  const {client,calls}=setup({error:{status,message:secret}});
  await assert.rejects(client.accept(token),err=>{
   assert.equal(err.message.includes(secret),false);return true;
  });
  assert.equal(calls.length,1);
 }
});
test('SPA integrates sanitized route without backend activation or persistence',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/captureInvitationLink\(location,history\)/);
 assert.match(app,/parts\[0\]==='invitations'&&parts\[1\]==='accept'/);
 assert.match(app,/state\.view='invitation'/);
 assert.match(app,/pendingInvitation=null;invitationAcceptanceStatus=''/);
 assert.match(app,/enabled:WS02D_ACCEPTANCE_ENABLED/);
 assert.match(app,/!WS02D_ACCEPTANCE_ENABLED\|\|invitationAcceptanceBusy/);
 assert.match(app,/pendingInvitation\?\.status==='ready'\?'#\/invitations\/accept':routeHome/);
 assert.doesNotMatch(readFileSync('frontend/workspace-invitation-acceptance.js','utf8'),/localStorage|sessionStorage|service_role/);
});
