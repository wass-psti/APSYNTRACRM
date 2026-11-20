import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WorkspaceInvitationAcceptanceClient,renderInvitationAcceptance,captureInvitationLink}
 from '../workspace-invitation-acceptance.js';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const token='cccccccc-cccc-4ccc-8ccc-cccccccccccc.'+'ef'.repeat(32);
const accepted={state:'accepted',workspaceId:id,role:'member',switched:false};
const context={user_id:actor,workspace_id:id,profile:{status:'active'}};
const app=readFileSync('frontend/app.js','utf8');
function client(reply,requests){
 const auth={userId:actor,getVerifiedUser:async()=>({id:actor}),
  authorized:async(path,opts)=>{requests.push({path,opts});
   if(reply instanceof Error)throw reply;
   return reply;
  }};
 return new WorkspaceInvitationAcceptanceClient({auth,api:{context:async()=>context},enabled:true});
}
test('app accepts a valid signed link through trusted Edge and refreshes membership only after receipt',async()=>{
 const requests=[];
 assert.deepEqual(await client(accepted,requests).accept(token),accepted);
 assert.equal(requests.length,1);
 assert.equal(requests[0].path,'/functions/v1/ws02d-accept');
 assert.equal(requests[0].opts.retryUnauthorized,false);
 const receipt=app.indexOf('await workspaceInvitationAcceptanceClient.accept(pendingInvitation.token)');
 const ack=app.indexOf("invitationAcceptanceStatus='accepted'",receipt);
 const refresh=app.indexOf('try{await refreshWorkspace();}',receipt);
 assert.ok(receipt>=0&&ack>receipt&&refresh>ack);
});
test('dormant backend never returns accepted membership and never retries an uncertain response',async()=>{
 const requests=[];
 await assert.rejects(client(Object.assign(Error('service unavailable'),{status:503}),requests).accept(token),{status:409});
 assert.equal(requests.length,1);
 assert.match(renderInvitationAcceptance({status:'unconfirmed',enabled:true,pending:{status:'ready',token}}),/Do not retry/);
});
test('mail acceptance link scrubs bearer token and never prints token in UI',()=>{
 let sanitized='';
 const link=captureInvitationLink({hash:'#/invitations/accept/'+token,pathname:'/APSYNTRACRM/',search:''},
  {replaceState:(_state,_title,url)=>{sanitized=url}});
 assert.equal(link.status,'ready');
 assert.equal(sanitized.includes(token),false);
 assert.doesNotMatch(renderInvitationAcceptance({pending:link,enabled:true}),new RegExp(token.slice(0,36)));
});
test('production frontend activation has no client-side role or membership mutations',()=>{
 assert.match(app,/new WorkspaceInvitationAcceptanceClient\(\{auth,api:db,enabled:true\}\)/);
 assert.match(app,/pending:pendingInvitation,enabled:true/);
 assert.doesNotMatch(app,/INSERT INTO public\.workspace_members/);
 assert.match(app,/if\(invitationAcceptanceBusy\|\|/);
});
