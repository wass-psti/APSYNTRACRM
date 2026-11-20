import test from 'node:test';
import assert from 'node:assert/strict';
import {TalkBoxAttachmentClient,validateTalkBoxAttachment,TALKBOX_MAX_ATTACHMENT_BYTES} from '../talkbox-attachments.js';
import {renderTalkBoxApplication} from '../talkbox-ui.js';
import {readFileSync} from 'node:fs';

const workspaceId='00000000-0000-4000-8000-000000000001';
const actorId='00000000-0000-4000-8000-000000000002';
const bytes=Uint8Array.of(10,20,30,40,50);
const file={
 name:'status.pdf',type:'application/pdf',size:5,
 arrayBuffer:async()=>bytes.slice().buffer
};
const opId='00000000-0000-4000-8000-000000000003';
const path=workspaceId+'/301/'+opId+'/status.pdf';
const asset={id:'501',storagePath:path,name:'status.pdf',size:5,contentType:'application/pdf'};

function fixture({brokenGet=false,brokenRegister=false,badBytes=false}={}){
 const calls=[];
 const auth={userId:actorId,isSignedIn:true,token:async()=> 'fake-signed-token'};
 const api={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='toolbox_issues_register_attachment'){
   if(brokenRegister)throw new Error('simulated interrupted registration');
   return asset;
  }
  if(name==='toolbox_issues_get_issue')return {id:'301',assets:brokenGet?[]:[asset]};
  throw Error('Unexpected RPC '+name);
 }};
 const fetchImpl=async(url,init)=>{
  calls.push({url,init});
  return {ok:true,status:200,arrayBuffer:async()=>badBytes?
   Uint8Array.of(1,2,3,4,5).buffer:bytes.slice().buffer};
 };
 return {client:new TalkBoxAttachmentClient({api,auth,workspaceId,fetchImpl,randomId:()=>opId}),calls};
}

test('native private attachment upload registers persisted issue record and verifies bytes',async()=>{
 const {client,calls}=fixture();
 const saved=await client.uploadVerified('301',file);
 assert.equal(saved.attachment.id,'501');
 const storageCalls=calls.filter(x=>x.url);
 assert.equal(storageCalls.length,2);
 assert.equal(storageCalls[0].init.method,'POST');
 assert.equal(storageCalls[1].init.method,'GET');
 assert.match(storageCalls[0].url,/storage\/v1\/object\/toolbox-issues-attachments/);
 assert.equal(storageCalls[0].init.credentials,'omit');
 assert.equal(storageCalls[0].init.headers.Authorization,'Bearer fake-signed-token');
 assert.equal(storageCalls[0].init.headers['x-upsert'],'false');
 const registration=calls.find(x=>x.name==='toolbox_issues_register_attachment');
 assert.equal(registration.args.p_storage_path,path);
 assert.equal(registration.args.p_workspace_id,workspaceId);
 assert.equal(registration.args.p_issue_id,'301');
 const result=await client.download('301',asset);
 assert.equal(result.fileName,'status.pdf');
 assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()),bytes);
});

test('native private attachment rejects missing or oversized files',()=>{
 assert.throws(()=>validateTalkBoxAttachment(null),/nonempty/);
 assert.throws(()=>validateTalkBoxAttachment({...file,size:0}),/nonempty/);
 assert.throws(()=>validateTalkBoxAttachment({...file,size:TALKBOX_MAX_ATTACHMENT_BYTES+1}),/50 MiB/);
 assert.throws(()=>validateTalkBoxAttachment({...file,name:'../..'}),/filename/);
});

test('native private attachment does not claim successful save after failed registration',async()=>{
 const {client}=fixture({brokenRegister:true});
 await assert.rejects(()=>client.uploadVerified('301',file),/registration was not confirmed/);
});

test('native private attachment refuses absent signed issue readback',async()=>{
 const {client}=fixture({brokenGet:true});
 await assert.rejects(()=>client.uploadVerified('301',file),/readback is incomplete/);
});

test('native private attachment detects changed download bytes',async()=>{
 const {client}=fixture({badBytes:true});
 await assert.rejects(()=>client.uploadVerified('301',file),/byte verification failed/);
});

test('native private download cannot use untrusted cross-issue asset reference',async()=>{
 const {client}=fixture();
 await assert.rejects(()=>client.download('302',asset),/does not belong/);
});

test('attachment controls escape filenames and use native delegated actions',()=>{
 const selected={id:'301',name:'Native issue',status:'Done',version:1,
  date:null,person:[],updates:[],subitems:[],
  assets:[{...asset,name:'<img src=x onerror=alert(1)>'}]};
 const html=renderTalkBoxApplication({page:{items:[],total:0},selected,canEdit:true});
 assert.match(html,/data-action="tb-file-upload"/);
 assert.match(html,/data-action="tb-file-download"/);
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'tb-file-upload':/);
 assert.match(app,/case 'tb-file-download':/);
 assert.doesNotMatch(readFileSync('frontend/talkbox-attachments.js','utf8'),/monday\.com|service_role/);
});
