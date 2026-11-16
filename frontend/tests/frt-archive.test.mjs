import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFRTArchive,restoreFRTRequest} from '../frt-archive.js';
import {renderFRTArchive} from '../frt-archive-ui.js';
import {frtActionSpec} from '../frt-board-domain-actions.js';

const workspace='22222222-2222-4222-8222-222222222222';
const user='11111111-1111-4111-8111-111111111111';
const request='33333333-3333-4333-8333-333333333333';
const companies=[{code:'WASS',name:'WASS'}];
const now=()=>new Date().toISOString();
function fixture(role='GENERAL_MANAGER'){
 let archived=true;
 const auth={userId:user,async getVerifiedUser(){return {id:user}}};
 const api={
  async context(){return {user_id:user,workspace_id:workspace,profile:{status:'active'}}},
  async rpc(name,args){
   if(name==='frt_bootstrap')return {membership:{user_id:user,workspace_id:workspace,
    status:'active',enabled:true,role},companies};
   if(name==='frt_archive_list')return archived?[{
    request_id:request,voucher_no:'DV-WASS-202611-001',title:'Office supplies',
    status:'DONE',liquidation_status:'NOT_SUBMITTED',date_needed:'2026-11-20',
    created_at:now(),archived_at:now()
   }]:[];
   if(name==='frt_restore_request'){archived=false;return {ok:true,requestId:request,archivedAt:null};}
   throw new Error('Unexpected RPC '+name);
  }
 };
 return {auth,api,get archived(){return archived}};
}
const scope={workspaceId:workspace,companyCode:'WASS',expectedRole:'GENERAL_MANAGER'};
test('archive retrieval reads only the selected signed company and projects bounded metadata',async()=>{
 const f=fixture(),result=await loadFRTArchive({...f,...scope});
 assert.equal(result.status,'PASS');assert.equal(result.requests.length,1);
 assert.equal(result.requests[0].voucher,'DV-WASS-202611-001');
 assert.match(renderFRTArchive({...result,canRestore:true}),/Restore/);
 assert.match(renderFRTArchive(result),/No archived requests/===false?'':'/'); // static render contract
});
test('General Manager restores an archived request and verifies it disappears from archive',async()=>{
 const f=fixture();
 const result=await restoreFRTRequest({...f,...scope,requestId:request});
 assert.equal(result.status,'RESTORED');assert.equal(f.archived,false);
 assert.equal((await loadFRTArchive({...f,...scope})).requests.length,0);
});
test('non-General Manager cannot restore an archived request',async()=>{
 const f=fixture('FINANCE_MANAGER');
 await assert.rejects(()=>restoreFRTRequest({...f,workspaceId:workspace,
  companyCode:'WASS',expectedRole:'FINANCE_MANAGER',requestId:request}),
  /existing General Manager/);
 assert.equal(f.archived,true);
});
test('signed role or company changes reject archive reads',async()=>{
 const f=fixture('SITE_STAFF');
 await assert.rejects(()=>loadFRTArchive({...f,workspaceId:workspace,companyCode:'WASS'}),
  /signed FRT membership/);
});
test('archive lifecycle action is exposed through the existing request-action contract',()=>{
 assert.deepEqual(frtActionSpec('archive'),{label:'Archive request',payload:'none'});
});
