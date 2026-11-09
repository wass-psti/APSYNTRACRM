import test from 'node:test';
import assert from 'node:assert/strict';
import {ProfileAvatarClient} from '../profile-avatar-client.js';

const U='11111111-1111-4111-8111-111111111111';
const OLD=U+'/22222222-2222-4222-8222-222222222222.webp';
const response=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json'}
});
function harness({signedURL='/object/sign/account-avatars/'+OLD+'?token=abc',rpcResult=null}={}){
 const calls=[],rpc=[];
 const auth={
  userId:U,
  token:async()=>'signed-session',
  refresh:async()=>'refreshed-session',
  authorized:async(path,options)=>{rpc.push({path,options});return rpcResult||{avatar_path:options.body.p_avatar_path,updated_at:'2026-11-09T00:00:00Z'};}
 };
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url.includes('/object/sign/'))return response({signedURL});
  if(options.method==='DELETE')return response([]);
  return response({Key:'uploaded'});
 };
 return {client:new ProfileAvatarClient({auth,fetchImpl,baseUrl:'https://project.supabase.co',apiKey:'sb_publishable_test'}),calls,rpc};
}

test('upload uses immutable per-user WebP object paths and signed session headers',async()=>{
 const {client,calls}=harness();
 const blob=new Blob(['webp-binary'],{type:'image/webp'});
 const path=await client.upload(blob,U);
 assert.match(path,new RegExp('^'+U+'/[0-9a-f-]{36}\\.webp$'));
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-session');
 assert.equal(calls[0].options.headers['Content-Type'],'image/webp');
 assert.equal(calls[0].options.headers['x-upsert'],'false');
 assert.equal(calls[0].options.body,blob);
});

test('save updates only the caller-owned reference and cleans the previous object afterward',async()=>{
 const {client,calls,rpc}=harness();
 const blob=new Blob(['webp-binary'],{type:'image/webp'});
 const result=await client.save(blob,U,OLD);
 assert.equal(result.path.split('/')[0],U);
 assert.equal(result.cleanupPending,false);
 assert.equal(result.updatedAt,'2026-11-09T00:00:00Z');
 assert.equal(rpc.length,1);
 assert.equal(rpc[0].path,'/rest/v1/rpc/set_own_profile_avatar');
 assert.deepEqual(rpc[0].options.body,{p_avatar_path:result.path,p_expected_avatar_path:OLD});
 assert.equal(calls.length,2);
 assert.equal(calls[1].options.method,'DELETE');
 assert.deepEqual(JSON.parse(calls[1].options.body),{prefixes:[OLD]});
});

test('stale or foreign object paths are rejected before storage requests',async()=>{
 const {client,calls}=harness();
 await assert.rejects(()=>client.removeObject('33333333-3333-4333-8333-333333333333/44444444-4444-4444-4444-444444444444.webp',U),/Invalid profile picture reference/);
 await assert.rejects(()=>client.signedUrl('bad/path',U),/Invalid profile picture reference/);
 assert.equal(calls.length,0);
});

test('signed URLs are normalized under the configured Storage API origin and cached',async()=>{
 const {client,calls}=harness();
 const first=await client.signedUrl(OLD,U);
 const second=await client.signedUrl(OLD,U);
 assert.equal(first,'https://project.supabase.co/storage/v1/object/sign/account-avatars/'+OLD+'?token=abc');
 assert.equal(second,first);
 assert.equal(calls.length,1);
});

test('foreign-origin signed URLs are rejected',async()=>{
 const {client}=harness({signedURL:'https://attacker.example/object/sign/account-avatars/'+OLD+'?token=x'});
 await assert.rejects(()=>client.signedUrl(OLD,U),/origin validation/);
});


test('avatar mutations fail closed when caller user ID differs from the signed session',async()=>{
 const {client,calls}=harness();
 const foreign='33333333-3333-4333-8333-333333333333';
 await assert.rejects(()=>client.upload(new Blob(['x'],{type:'image/webp'}),foreign),/signed-in account/);
 await assert.rejects(()=>client.remove(foreign,foreign+'/22222222-2222-4222-8222-222222222222.webp'),/signed-in account/);
 assert.equal(calls.length,0);
});


test('ambiguous avatar reference responses preserve the uploaded object',async()=>{
 const {client,calls}=harness({rpcResult:{avatar_path:OLD,updated_at:'2026-11-09T00:00:00Z'}});
 const blob=new Blob(['webp-binary'],{type:'image/webp'});
 await assert.rejects(()=>client.save(blob,U,null),/reference could not be confirmed/);
 // The profile update response is inconsistent, so deleting the new object
 // could break a committed reference. Preserve it for reconciliation.
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'POST');
});
