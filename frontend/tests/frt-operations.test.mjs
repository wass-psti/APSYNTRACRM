import test from 'node:test';
import assert from 'node:assert/strict';
import {
 loadFRTActivity,loadFRTComments,addFRTComment,loadFRTArchive,restoreFRTRequest
} from '../frt-operations-client.js';
import {
 renderFRTActivityLog,renderFRTComments,renderFRTArchive,serializeFRTActivityCsv
} from '../frt-operations-ui.js';
import {frtActionSpec} from '../frt-board-domain-actions.js';

const workspace='22222222-2222-4222-8222-222222222222';
const user='11111111-1111-4111-8111-111111111111';
const request='33333333-3333-4333-8333-333333333333';
const commentId='44444444-4444-4444-8444-444444444444';
const companies=[{code:'WASS',name:'Watchdog Automation Sales & Services'}];
const now=()=>new Date().toISOString();
function fixture(role='GENERAL_MANAGER'){
 let archived=true;
 const comments=[];
 const events=[{id:1,request_id:request,request_title:'Office supplies',
  voucher_no:'DV-WASS-202611-001',action:'REQUEST_CREATED',actor_name:'Test User',
  created_at:now(),details:{company:'WASS',total:100}}];
 const auth={userId:user,async getVerifiedUser(){return {id:user}}};
 const api={
  async context(){return {user_id:user,workspace_id:workspace,profile:{status:'active'}}},
  async rpc(name,args){
   if(name==='frt_bootstrap')return {membership:{user_id:user,workspace_id:workspace,
    status:'active',enabled:true,role},companies};
   if(name==='frt_activity_list')return events;
   if(name==='frt_request_comments_list')return comments;
   if(name==='frt_add_comment'){
    comments.unshift({id:commentId,body:args.p_body,created_at:now(),
     author_name:'Test User',is_mine:true});return {ok:true,commentId};
   }
   if(name==='frt_archive_list')return archived?[{
    request_id:request,voucher_no:'DV-WASS-202611-001',title:'Office supplies',
    status:'DONE',liquidation_status:'NOT_SUBMITTED',date_needed:'2026-11-20',
    created_at:now(),archived_at:now()
   }]:[];
   if(name==='frt_restore_request'){archived=false;return {ok:true,requestId:request,archivedAt:null};}
   throw new Error('Unexpected RPC '+name);
  }
 };
 return {auth,api,get archived(){return archived},comments,events};
}
const scope={workspaceId:workspace,companyCode:'WASS'};
test('signed activity read projects only bounded audit fields',async()=>{
 const f=fixture(),result=await loadFRTActivity({...f,...scope});
 assert.equal(result.status,'PASS');assert.equal(result.events.length,1);
 assert.equal(result.events[0].action,'REQUEST_CREATED');
 assert.deepEqual(result.events[0].details,{company:'WASS',total:100});
 assert.match(renderFRTActivityLog(result),/REQUEST_CREATED/);
});
test('comments use the existing signed add-comment RPC and verify the exact saved comment',async()=>{
 const f=fixture();
 const saved=await addFRTComment({...f,...scope,requestId:request,
  allowedRequestIds:[request],body:'Please attach the supplier invoice.'});
 assert.equal(saved.id,commentId);assert.equal(saved.isMine,true);
 assert.match(renderFRTComments({comments:[saved],requestTitle:'Office supplies'}),/supplier invoice/);
});
test('discussion rejects an unlisted request before a write',async()=>{
 const f=fixture();
 await assert.rejects(()=>addFRTComment({...f,...scope,requestId:request,
  allowedRequestIds:[],body:'Not allowed'}),/current signed FRT list/);
 assert.equal(f.comments.length,0);
});
test('archive list reads existing archived records and General Manager restores them',async()=>{
 const f=fixture();
 const before=await loadFRTArchive({...f,...scope});
 assert.equal(before.requests.length,1);
 assert.match(renderFRTArchive({...before,canRestore:true}),/Restore/);
 const restored=await restoreFRTRequest({...f,...scope,requestId:request});
 assert.equal(restored.status,'RESTORED');assert.equal(f.archived,false);
 assert.equal((await loadFRTArchive({...f,...scope})).requests.length,0);
});
test('archive restore reuses the existing General Manager role without adding another role',async()=>{
 const f=fixture('FINANCE_MANAGER');
 await assert.rejects(()=>restoreFRTRequest({...f,...scope,requestId:request}),
  /existing General Manager/);
 assert.equal(f.archived,true);
});
test('archive action is now exposed through the existing request-action contract',()=>{
 assert.deepEqual(frtActionSpec('archive'),{label:'Archive request',payload:'none'});
});
test('activity CSV quotes cells and neutralizes spreadsheet formulas',()=>{
 const csv=serializeFRTActivityCsv([{createdAt:'2026-11-16T10:00:00Z',
  action:'=HYPERLINK("x")',title:'Office, supplies',voucher:'DV-001',
  actorName:'Test "User"',details:{company:'WASS'}}]);
 assert.match(csv,/'=HYPERLINK/);
 assert.match(csv,/"Office, supplies"/);
 assert.match(csv,/"Test ""User"""/);
});
test('invalid signed context prevents FRT activity reads',async()=>{
 const f=fixture();f.api.context=async()=>({user_id:user,workspace_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',profile:{status:'active'}});
 await assert.rejects(()=>loadFRTActivity({...f,...scope}),/signed FRT session/);
});
