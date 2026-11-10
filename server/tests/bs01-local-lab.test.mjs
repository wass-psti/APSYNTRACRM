import test from 'node:test';
import assert from 'node:assert/strict';
import {createBs01Sandbox} from '../bs01-local-sandbox-core.mjs';
import {createBs01LocalLabServer} from '../bs01-local-lab-server.mjs';

const A='11111111-1111-4111-8111-111111111111';
const HR='22222222-2222-4222-8222-222222222222';
const B='33333333-3333-4333-8333-333333333333';
const make=()=>{
 let now=Date.parse('2026-11-10T00:00:00Z');
 const clock=()=>now;
 const core=createBs01Sandbox({clock});
 const owner=core.enter({role:'owner',email:'owner@example.test'}).session;
 const guest=core.enter({role:'guest',email:'guest@example.test'}).session;
 return {core,owner,guest,advance:ms=>{now+=ms;}};
};
function allow(core,owner,boardId=A){
 const board=core.list(owner).find(b=>b.id===boardId);
 return core.setPolicy(owner,{boardId,mode:'guest_shareable',expectedRevision:board.revision});
}
async function rejects(callback,code){
 assert.throws(callback,error=>error.code===code);
}
test('everything starts private; protected HR can never enable external sharing',()=>{
 const {core,owner,guest}=make();
 assert.deepEqual(core.list(owner).map(b=>b.mode),['private','private','private']);
 rejects(()=>core.list(guest),'authentication_required');
 rejects(()=>core.issue(owner,{boardId:A}),'not_shareable');
 rejects(()=>allow(core,owner,HR),'protected_app');
 rejects(()=>core.read(guest,HR),'access_denied');
});
test('one-use link gives verified demo guest only one board viewer projection',()=>{
 const {core,owner,guest}=make();
 allow(core,owner,A);
 const issued=core.issue(owner,{boardId:A,recipientEmail:'GUEST@EXAMPLE.TEST'});
 assert.equal(issued.expiresInHours,24);
 assert.equal(issued.uses,1);
 assert.match(issued.token,/^[0-9a-f-]{36}\.[0-9a-f]{64}$/);
 rejects(()=>core.read(guest,A),'access_denied');
 assert.deepEqual(core.accept(guest,issued.token),{
  boardId:A,role:'viewer',workspaceAccess:false,state:'accepted'
 });
 assert.equal(core.read(guest,A).items.length,2);
 rejects(()=>core.read(guest,B),'access_denied');
 rejects(()=>core.read(guest,HR),'access_denied');
 rejects(()=>core.accept(guest,issued.token),'invalid_or_expired');
 assert.ok(core.events(owner).every(e=>!JSON.stringify(e).includes(issued.token)));
});
test('foreign guest, tampered link, stale policy and insufficient role denied',()=>{
 const {core,owner,guest}=make();
 allow(core,owner);
 const link=core.issue(owner,{boardId:A,recipientEmail:'another@example.test'});
 rejects(()=>core.accept(guest,link.token),'invalid_or_expired');
 const other=core.enter({role:'guest',email:'another@example.test'}).session;
 rejects(()=>core.accept(other,link.token.slice(0,-1)+'0'),'invalid_or_expired');
 rejects(()=>core.setPolicy(guest,{boardId:A,mode:'private',expectedRevision:2}),
  'authentication_required');
 rejects(()=>core.setPolicy(owner,{boardId:A,mode:'private',expectedRevision:1}),
  'stale_revision');
 assert.equal(core.accept(other,link.token).state,'accepted');
});
test('24-hour lifetime is enforced and one-use token is not reusable',()=>{
 const {core,owner,guest,advance}=make();
 allow(core,owner);
 const link=core.issue(owner,{boardId:A});
 advance(24*60*60*1000);
 rejects(()=>core.accept(guest,link.token),'invalid_or_expired');
});
test('revoking issued link invalidates already accepted guest read',()=>{
 const {core,owner,guest}=make();
 allow(core,owner);
 const link=core.issue(owner,{boardId:A});
 core.accept(guest,link.token);
 assert.equal(core.read(guest,A).role,'viewer');
 core.revoke(owner,{invitationId:link.invitationId});
 rejects(()=>core.read(guest,A),'access_denied');
});
test('switching board back to private atomically revokes links and grants',()=>{
 const {core,owner,guest}=make();
 allow(core,owner);
 const link=core.issue(owner,{boardId:A});
 core.accept(guest,link.token);
 const policy=core.setPolicy(owner,{boardId:A,mode:'private',expectedRevision:2});
 assert.equal(policy.mode,'private');
 rejects(()=>core.read(guest,A),'access_denied');
 allow(core,owner);
 rejects(()=>core.read(guest,A),'access_denied');
 assert.equal(core.events(owner).at(-1).event,'policy.changed');
});
test('demo API is bound to local HTTP origin and never returns sensitive headers',async()=>{
 const server=createBs01LocalLabServer({sandbox:createBs01Sandbox()});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const addr=server.address(),base='http://127.0.0.1:'+addr.port;
 try{
  const html=await fetch(base+'/');
  assert.equal(html.status,200);
  assert.match(await html.text(),/LOCAL DEMO/);
  assert.match(html.headers.get('content-security-policy'),/default-src 'none'/);
  const foreign=await fetch(base+'/api/session',{
   method:'POST',headers:{'content-type':'application/json',
    origin:'https://evil.invalid'},
   body:JSON.stringify({role:'owner',email:'owner@example.test'})
  });
  assert.equal(foreign.status,403);
  const valid=await fetch(base+'/api/session',{
   method:'POST',
   headers:{'content-type':'application/json',origin:base},
   body:JSON.stringify({role:'owner',email:'owner@example.test'})
  });
  assert.equal(valid.status,200);
  const identity=await valid.json();
  const list=await fetch(base+'/api/boards',{headers:{'x-demo-session':identity.session}});
  assert.equal(list.status,200);
  assert.equal((await list.json()).boards.length,3);
  assert.equal((await fetch(base+'/api/boards')).status,401);
 }finally{
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
