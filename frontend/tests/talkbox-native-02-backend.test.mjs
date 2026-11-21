import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TalkBoxNativeClient} from '../talkbox-native.js';
import {TalkBoxAttachmentClient} from '../talkbox-attachments.js';
import {renderTalkBoxApplication} from '../talkbox-ui.js';

const workspaceId='00000000-0000-4000-8000-000000000001';
const userId='00000000-0000-4000-8000-000000000002';
const filePath=workspaceId+'/301/00000000-0000-4000-8000-000000000003/evidence.txt';
const asset={id:'77',name:'evidence.txt',size:5,contentType:'text/plain',storagePath:filePath};
const base={id:'301',name:'Native',person:[],version:1,date:null,timeTracking:{hours:0,minutes:0},
 updates:[{id:'11',text_body:'Parent',creator:{name:'Author'}}],subitems:[],assets:[asset]};

test('native V2 features remain off if backend is absent',async()=>{
 const c=new TalkBoxNativeClient({workspaceId,api:{rpc:async()=>{throw Error('RPC missing');}}});
 assert.deepEqual(await c.nativeV2Capabilities(),{threadedReplies:false,attachmentRemoval:false,serverTimer:false});
});

test('native V2 feature flags use real signed backend receipt, never a UI guess',async()=>{
 const c=new TalkBoxNativeClient({workspaceId,api:{rpc:async(name,args)=>{
  assert.equal(name,'toolbox_issues_native_v2_capabilities');
  assert.equal(args.p_workspace_id,workspaceId);
  return {threadedReplies:true,attachmentRemoval:true,serverTimer:false};
 }}});
 assert.deepEqual(await c.nativeV2Capabilities(),{threadedReplies:true,attachmentRemoval:true,serverTimer:false});
});

test('thread reply verifies parent and independent readback',async()=>{
 let issue=structuredClone(base);
 const names=[];
 const c=new TalkBoxNativeClient({workspaceId,api:{rpc:async(name,args)=>{
  names.push(name);
  if(name==='toolbox_issues_get_issue')return structuredClone(issue);
  if(name==='toolbox_issues_reply_update'){
   issue.updates.push({id:'12',replyTo:'11',text_body:args.p_text,creator:{name:'Responder'}});
   return issue.updates.at(-1);
  }
  throw Error(name);
 }}});
 const saved=await c.replyVerified('301','11',' Follow up ');
 assert.equal(saved.updates.at(-1).text_body,'Follow up');
 assert.deepEqual(names,[
  'toolbox_issues_get_issue','toolbox_issues_reply_update','toolbox_issues_get_issue']);
 await assert.rejects(()=>c.replyVerified('301','88','Missing parent'),/Parent discussion/);
});

test('thread reply with false mutation receipt is never accepted',async()=>{
 const c=new TalkBoxNativeClient({workspaceId,api:{rpc:async(name)=>{
  if(name.endsWith('get_issue'))return structuredClone(base);
  if(name.endsWith('reply_update'))return {id:'12',replyTo:'11',text_body:'Reply'};
 }}});
 await assert.rejects(()=>c.replyVerified('301','11','Reply'),/not verified/);
});

function attachmentTransport({rpcResponse=null,deleteOk=true,deleteFailures=0,missingReadback=false}={}){
 let failedDeletes=0;
 const calls=[];
 const signed={userId,isSignedIn:true,token:async()=> 'fake-token'};
 const api={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='toolbox_issues_get_issue'){
   const hidden=calls.some(x=>x.name==='toolbox_issues_unregister_attachment');
   const purged=calls.some(x=>x.name==='toolbox_issues_confirm_attachment_purged');
   return {...base,assets:missingReadback||hidden?[]:[asset],
    pendingAttachmentCleanup:hidden&&!purged?[asset]:[]};
  }
  if(name==='toolbox_issues_unregister_attachment'||name==='toolbox_issues_confirm_attachment_purged')
   return rpcResponse||{success:true,id:'77',storagePath:filePath,issueId:'301'};
  throw Error(name);
 }};
 const fetchImpl=async(url,init)=>{
  calls.push({url,init});
  if(init.method==='GET')return {ok:false,status:404};
  const fail=!deleteOk||failedDeletes++<deleteFailures;
  return {ok:!fail,status:fail?500:200};
 };
 const client=new TalkBoxAttachmentClient({workspaceId,api,auth:signed,fetchImpl});
 return {client,calls};
}

test('native deletion hides DB record before deleting exact private object',async()=>{
 const {client,calls}=attachmentTransport();
 await client.removeVerified('301',asset);
 const storage=calls.find(row=>row.url);
 assert.match(storage.url,/\/storage\/v1\/object\/toolbox-issues-attachments\//);
 assert.doesNotMatch(storage.url,/\/authenticated\//);
 assert.equal(storage.init.method,'DELETE');
 assert.equal(storage.init.credentials,'omit');
 const readback=calls.find(row=>row.url&&row.init.method==='GET');
 assert.match(readback.url,/\/object\/authenticated\/toolbox-issues-attachments\//);
 assert.equal(calls.filter(x=>x.name==='toolbox_issues_get_issue').length,3);
 assert.equal(calls.filter(x=>x.name==='toolbox_issues_confirm_attachment_purged').length,1);
});

test('native removal cache-busts only post-DELETE private absence verification',async()=>{
 const {client,calls}=attachmentTransport();
 await client.removeVerified('301',asset);
 const deleteRequest=calls.find(x=>x.url&&x.init.method==='DELETE');
 const absenceRequest=calls.find(x=>x.url&&x.init.method==='GET');
 assert.equal(deleteRequest.url.includes('cacheNonce='),false);
 assert.match(absenceRequest.url,/\\?cacheNonce=[^&]+$/);
 assert.equal(absenceRequest.init.cache,'no-store');
 assert.equal(absenceRequest.init.credentials,'omit');
});

test('stale original authenticated URL cannot falsely block verified CDN-fresh deletion',async()=>{
 const calls=[];
 const signed={userId,isSignedIn:true,token:async()=> 'fake-token'};
 const api={rpc:async(name)=>{
  calls.push(name);
  const hidden=calls.includes('toolbox_issues_unregister_attachment');
  const purged=calls.includes('toolbox_issues_confirm_attachment_purged');
  if(name==='toolbox_issues_get_issue')
   return {...base,assets:hidden?[]:[asset],
    pendingAttachmentCleanup:hidden&&!purged?[asset]:[]};
  if(name==='toolbox_issues_unregister_attachment'||
     name==='toolbox_issues_confirm_attachment_purged')
   return {success:true,id:'77',storagePath:filePath,issueId:'301'};
  throw Error(name);
 }};
 const fetchCalls=[];
 const fetchImpl=async(url,opts)=>{
  fetchCalls.push({url,method:opts.method});
  // Existing cached authenticated object would still return 200; a
  // cacheNonce request must go to a fresh key and see the origin 404.
  if(opts.method==='GET')
   return {ok:!url.includes('cacheNonce='),status:url.includes('cacheNonce=')?404:200};
  return {ok:true,status:200};
 };
 const client=new TalkBoxAttachmentClient({api,auth:signed,workspaceId,fetchImpl});
 const result=await client.removeVerified('301',asset);
 assert.deepEqual(result.pendingAttachmentCleanup,[]);
 assert.equal(calls.filter(x=>x==='toolbox_issues_confirm_attachment_purged').length,1);
 assert.equal(fetchCalls.filter(x=>x.method==='GET').length,1);
 assert.match(fetchCalls.find(x=>x.method==='GET').url,/cacheNonce=/);
});

test('even cache-busted 200 remains pending rather than asserting storage purged',async()=>{
 const {client,calls}=attachmentTransport();
 client.fetch=async(url,opts)=>{
  calls.push({url,init:opts});
  return {ok:true,status:200};
 };
 await assert.rejects(()=>client.removeVerified('301',asset),/remains downloadable/);
 assert.equal(calls.filter(x=>x.name==='toolbox_issues_confirm_attachment_purged').length,0);
 assert.match(calls.find(x=>x.url&&x.init.method==='GET').url,/cacheNonce=/);
});

test('native removal does not delete Storage if backend acknowledgement is mismatched',async()=>{
 const {client,calls}=attachmentTransport({rpcResponse:{
  success:true,id:'77',storagePath:'different/path',issueId:'301'}});
 await assert.rejects(()=>client.removeVerified('301',asset),/not confirmed/);
 assert.equal(calls.filter(x=>x.url).length,0);
});

test('native removal verifies signed absence despite a failed DELETE transport',async()=>{
 const {client,calls}=attachmentTransport({deleteOk:false});
 const result=await client.removeVerified('301',asset);
 assert.deepEqual(result.pendingAttachmentCleanup,[]);
 assert.equal(calls.filter(x=>x.name==='toolbox_issues_confirm_attachment_purged').length,1);
 assert.match(calls.find(x=>x.url&&x.init.method==='GET').url,/cacheNonce=/);
});

test('uncertain DELETE followed by cached or real GET 200 never confirms purge',async()=>{
 const {client,calls}=attachmentTransport({deleteOk:false});
 client.fetch=async(url,init)=>{
  calls.push({url,init});
  if(init.method==='DELETE')throw new TypeError('Failed to fetch');
  if(init.method==='GET')return {ok:true,status:200};
  throw Error('Unexpected method');
 };
 await assert.rejects(()=>client.removeVerified('301',asset),/remains downloadable/);
 assert.equal(calls.filter(x=>x.name==='toolbox_issues_confirm_attachment_purged').length,0);
});

test('already-absent Storage DELETE 400 permits proof-based cleanup but never bypasses signed GET',async()=>{
 const {client,calls}=attachmentTransport();
 client.fetch=async(url,init)=>{
  calls.push({url,init});
  if(init.method==='DELETE')return {ok:false,status:400};
  if(init.method==='GET')return {ok:false,status:404};
  throw Error('Unexpected method');
 };
 const result=await client.removeVerified('301',asset);
 assert.equal(result.pendingAttachmentCleanup.length,0);
 assert.equal(calls.filter(x=>x.name==='toolbox_issues_confirm_attachment_purged').length,1);
 const freshGet=calls.find(x=>x.url&&x.init.method==='GET');
 assert.match(freshGet.url,/cacheNonce=/);
});

test('already-absent DELETE 400 without a signed GET 404 remains recoverable',async()=>{
 const {client,calls}=attachmentTransport();
 client.fetch=async(url,init)=>{
  calls.push({url,init});
  if(init.method==='DELETE')return {ok:false,status:400};
  if(init.method==='GET')return {ok:true,status:200};
  throw Error('Unexpected method');
 };
 await assert.rejects(()=>client.removeVerified('301',asset),/Attachment remains downloadable/);
 assert.equal(calls.filter(x=>x.name==='toolbox_issues_confirm_attachment_purged').length,0);
});

test('private cleanup resumes after signed absence readback failed on first attempt',async()=>{
 const {client,calls}=attachmentTransport({deleteFailures:1});
 let getAttempts=0,deleteAttempts=0;
 client.fetch=async(url,init)=>{
  calls.push({url,init});
  if(init.method==='DELETE'){
   deleteAttempts++;
   return {ok:deleteAttempts>1,status:deleteAttempts>1?200:500};
  }
  if(init.method==='GET'){
   getAttempts++;
   return {ok:false,status:getAttempts>1?404:503};
  }
  throw Error('Unexpected method');
 };
 await assert.rejects(()=>client.removeVerified('301',asset),/use Retry cleanup/);
 assert.equal(calls.filter(x=>x.name==='toolbox_issues_confirm_attachment_purged').length,0);
 const result=await client.removeVerified('301',asset);
 assert.equal(result.pendingAttachmentCleanup.length,0);
 assert.equal(calls.filter(x=>x.url&&x.init.method==='DELETE').length,2);
 assert.equal(calls.filter(x=>x.name==='toolbox_issues_confirm_attachment_purged').length,1);
});

test('native private GET and DELETE routes differ by documented authenticated path',()=>{
 const src=readFileSync('frontend/talkbox-attachments.js','utf8');
 assert.match(src,/method==='GET'\?'authenticated\/'/);
 assert.match(src,/toolbox_issues_unregister_attachment/);
 const html=renderTalkBoxApplication({page:{items:[],total:0},selected:base,
  canEdit:true,features:{threadedReplies:true,attachmentRemoval:true}});
 assert.match(html,/data-action="tb-reply"/);
 assert.match(html,/data-action="tb-file-remove"/);
 const disabled=renderTalkBoxApplication({page:{items:[],total:0},selected:base,
  canEdit:true,features:{}});
 assert.doesNotMatch(disabled,/data-action="tb-reply"|data-action="tb-file-remove"/);
});

test('native pending backend migration remains candidate, not deployable migration',()=>{
 const sql=readFileSync('supabase/migration-candidates/cp_tb_independent_native_02_thread_and_media.sql','utf8');
 assert.match(sql,/CANDIDATE ONLY: DO NOT DEPLOY/);
 assert.match(sql,/reply_to_update_id/);
 assert.match(sql,/public\.toolbox_issues_reply_update/);
 assert.match(sql,/public\.toolbox_issues_unregister_attachment/);
 assert.match(sql,/public\.toolbox_issues_confirm_attachment_purged/);
 assert.match(sql,/storage_purged_at/);
 assert.match(sql,/private\.toolbox_issues_has_access/);
 assert.doesNotMatch(sql,/service_role|grant .* to anon/i);
});
