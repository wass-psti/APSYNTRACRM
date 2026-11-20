import test from 'node:test';
import assert from 'node:assert/strict';
import {createGenuineStagingRunner} from '../ws02d-genuine-staging-runner.mjs';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const member='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const workspace='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const requestId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const invitationId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const token=invitationId+'.'+'ab'.repeat(32);
const inviterJwt='owner.'+'A'.repeat(85)+'.signature';
const recipientJwt='recipient.'+'B'.repeat(85)+'.signature';
const shared={inviterJwt,recipientJwt,publishableKey:'sb_publishable_staging_test_not_real'};
function fixture({confirmed=true,identical=false,sendStatus=200,receiptToken=false}={}){
 const calls=[];
 const fetchImpl=async(url,options)=>{
  assert.ok(url.startsWith('https://jeqwjlxubntsddeauvqa.supabase.co/'));
  assert.ok(!url.includes('jtlusodorfnyzgyuewkz'));
  calls.push({route:url.slice(url.lastIndexOf('/')+1),method:options.method,body:options.body?JSON.parse(options.body):null});
  const jwt=options.headers.authorization.slice(7);
  if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({
   id:jwt===inviterJwt?owner:(identical?owner:member),
   email:jwt===inviterJwt?'owner@staging.example.invalid':
     (identical?'owner@staging.example.invalid':'recipient@staging.example.invalid'),
   email_confirmed_at:confirmed?'2026-11-20T00:00:00Z':null,is_anonymous:false
  }),{status:200});
  if(url.endsWith('ws02d-invite'))return new Response(JSON.stringify({
   state:'delivery-submitted',invitationId,...(receiptToken?{token}: {})
  }),{status:sendStatus});
  if(url.endsWith('ws02d-accept'))return new Response(JSON.stringify({
   state:'accepted',role:'member',switched:false,workspaceId:workspace
  }),{status:200});
  if(url.endsWith('ws02d-manage'))return new Response(JSON.stringify({
   authorized:true,workspaceId:workspace,invitations:[{state:'accepted'}]
  }),{status:200});
  throw Error('Unknown route');
 };
 return {runner:createGenuineStagingRunner({fetchImpl}),calls};
}
test('two actual signed GoTrue identities must be distinct and confirmed before any mutation',async()=>{
 const valid=fixture();const pair=await valid.runner.pair(shared);
 assert.equal(pair.inviter.id,owner);assert.equal(pair.recipient.id,member);
 assert.equal(valid.calls.length,2);
 for(const opts of [{confirmed:false},{identical:true}]){
  const f=fixture(opts);
  await assert.rejects(f.runner.send({...shared,workspaceId:workspace,requestId}));
  assert.equal(f.calls.some(c=>c.method==='POST'),false);
 }
});
test('trusted staging invitation sends only verified recipient email; receipt cannot claim inbox delivery',async()=>{
 const f=fixture();const result=await f.runner.send({...shared,workspaceId:workspace,requestId});
 assert.deepEqual(result,{state:'delivery-submitted',invitationId,providerAccepted:true,inboxDelivered:false});
 assert.equal(f.calls.filter(x=>x.method==='POST').length,1);
 assert.deepEqual(f.calls.at(-1).body,{workspaceId:workspace,requestId,
  email:'recipient@staging.example.invalid',role:'member',message:''});
});
test('ambiguous send or provider bearer-token response is rejected without automatic retry',async()=>{
 for(const opts of [{sendStatus:503},{receiptToken:true}]){
  const f=fixture(opts);
  await assert.rejects(f.runner.send({...shared,workspaceId:workspace,requestId}));
  assert.equal(f.calls.filter(x=>x.method==='POST').length,1);
 }
});
test('recipient-only bearer from real inbox is required for signed acceptance and manager readback',async()=>{
 const f=fixture();await assert.rejects(f.runner.accept({...shared,token:'invalid'}));
 assert.equal(f.calls.length,0);
 const receipt=await f.runner.accept({...shared,token});
 assert.deepEqual(receipt,{state:'accepted',workspaceId:workspace,switched:false});
 assert.equal(f.calls.at(-1).route,'ws02d-accept');
 assert.deepEqual(f.calls.at(-1).body,{token});
 const list=await f.runner.list({inviterJwt,publishableKey:shared.publishableKey,workspaceId:workspace});
 assert.deepEqual(list,{authorized:true,workspaceId:workspace,states:['accepted']});
 assert.equal(f.calls.at(-1).route,'ws02d-manage');
});
