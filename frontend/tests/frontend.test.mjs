import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthClient,ApiError,STORE_KEY} from '../session.js';
import {DomainApi,validUuid} from '../data.js';

const U='11111111-1111-4111-8111-111111111111',W='22222222-2222-4222-8222-222222222222',B='33333333-3333-4333-8333-333333333333';
function memory(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}}
function response(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})}
test('password sign-in verifies Supabase Auth user and stores session per tab',async()=>{
 const requests=[];
 const auth=new AuthClient({storage:memory(),clock:()=>1000000,fetchImpl:async(url,init)=>{
  requests.push({url,init});
  if(url.includes('/token'))return response({access_token:'signed.jwt',refresh_token:'refresh.signed',expires_in:3600,user:{id:U,email:'member@example.org'}});
  if(url.endsWith('/user'))return response({id:U,email:'member@example.org'});
  throw Error('unexpected');
 }});
 await auth.signIn(' member@example.org ','password');
 assert.equal(auth.userId,U);assert.equal(await auth.token(),'signed.jwt');
 assert.equal(requests[0].init.method,'POST');
 assert.deepEqual(JSON.parse(requests[0].init.body),{email:'member@example.org',password:'password'});
 assert.equal(requests[1].init.headers.Authorization,'Bearer signed.jwt');
 assert.equal(auth.storage.getItem(STORE_KEY)!==null,true);
});
test('failed login does not create a local session',async()=>{
 const auth=new AuthClient({storage:memory(),fetchImpl:async()=>response({message:'Invalid login credentials'},400)});
 await assert.rejects(()=>auth.signIn('bad@example.org','bad'),ApiError);
 assert.equal(auth.isSignedIn,false);
});
test('restored sessions use real Auth user endpoint, not a decoded JWT',async()=>{
 const storage=memory();storage.setItem(STORE_KEY,JSON.stringify({access_token:'stale',refresh_token:'refresh',expires_at:Date.now()+1000000,user:{id:U}}));
 const auth=new AuthClient({storage,fetchImpl:async(url)=>response({id:W})});
 assert.equal(await auth.restore(),false);assert.equal(auth.isSignedIn,false);assert.equal(storage.getItem(STORE_KEY),null);
});
test('refresh rotates access/refresh tokens when near expiry',async()=>{
 const storage=memory();let now=1000000;
 const auth=new AuthClient({storage,clock:()=>now,fetchImpl:async(url)=>{
  assert.equal(url.includes('refresh_token'),true);
  return response({access_token:'replacement',refresh_token:'rotated',expires_in:3600,user:{id:U}});
 }});
 auth.save({access_token:'old',refresh_token:'previous',expires_in:1,user:{id:U}});
 now+=1000;
 assert.equal(await auth.token(),'replacement');
 assert.equal(auth.session.refresh_token,'rotated');
});
test('sign out clears all local session data even if backend is offline',async()=>{
 const storage=memory();const auth=new AuthClient({storage,fetchImpl:async()=>{throw Error('offline')}});
 auth.save({access_token:'active',refresh_token:'rotating',expires_in:3600,user:{id:U}});
 await auth.signOut();
 assert.equal(auth.isSignedIn,false);assert.equal(storage.getItem(STORE_KEY),null);
});
test('domain interface uses existing authoritative RPC names',async()=>{
 const calls=[];const api=new DomainApi({userId:U,authorized:async(path,opts)=>{
  calls.push({path,opts});
  if(path.endsWith('wm_auth_access_context'))return {user_id:U,workspace_id:W,profile:{status:'active'}};
  if(path.endsWith('wm_list_boards'))return [{id:B,name:'CRM Board'}];
  if(path.endsWith('wm_get_board'))return {board:{id:B},groups:[],items:[]};
  if(path.endsWith('work_board_access'))return true;
  return [];
 }});
 assert.equal((await api.context()).workspace_id,W);
 assert.equal((await api.boards())[0].name,'CRM Board');
 assert.equal((await api.board(B)).board.id,B);
 assert.equal(await api.allowed(B,'edit'),true);
 assert.deepEqual(calls.map(c=>c.path.split('/').at(-1)),['wm_auth_access_context','wm_list_boards','wm_get_board','work_board_access']);
});
test('invalid authorization context and board identifiers are denied',async()=>{
 const api=new DomainApi({userId:U,authorized:async()=>({user_id:U,workspace_id:W,profile:{status:'inactive'}})});
 await assert.rejects(()=>api.context(),ApiError);
 await assert.rejects(()=>api.board('not-a-uuid'),ApiError);
 assert.equal(validUuid(B),true);assert.equal(validUuid('bad'),false);
});
test('Huly Issue create and edit use the existing SB06 transaction RPC with CAS',async()=>{
 const calls=[];
 const api=new DomainApi({userId:U,authorized:async(path,opts)=>{calls.push({path,body:opts.body});return [{revision:1}]}});
 const id=await api.createIssue(B,W,{title:'A task',status:'tracker:status:Todo',priority:2},U);
 assert.equal(calls[0].path.endsWith('huly_sb06_transact'),true);
 assert.equal(calls[0].body.p_operations[0].action,'create');
 assert.equal(calls[0].body.p_operations[0].documentId,'huly.issue.'+id);
 assert.equal(calls[0].body.p_operations[0].payload.snapshot.createdBy,U);
 const row={document_id:'huly.issue.'+id,revision:3,payload:calls[0].body.p_operations[0].payload};
 await api.updateIssue(B,W,row,{title:'Edited'},U);
 assert.equal(calls[1].body.p_operations[0].expectedRevision,3);
 assert.equal(calls[1].body.p_operations[0].payload.snapshot.title,'Edited');
 await api.removeIssue(B,W,row);
 assert.deepEqual(calls[2].body.p_operations,[{action:'remove',documentId:'huly.issue.'+id,expectedRevision:3}]);
});
test('Huly Issue listing uses RLS-protected existing security-invoker view',async()=>{
 let request;
 const api=new DomainApi({userId:U,authorized:async(path)=>{request=path;return [{document_id:'huly.issue.1',payload:{kind:'huly.tracker.Issue',format:1}},{document_id:'other',payload:{kind:'other'}}]}});
 const rows=await api.issues(B,W);assert.equal(rows.length,1);
 assert.match(request,/huly_sb02_documents/);
 assert.ok(request.includes('board_id=eq.')||request.includes('board_id=eq%2E')); 
});
