import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FRTRecipientClient} from '../frt-recipient-client.js';
import {renderFRTRequestWizard} from '../frt-request-wizard.js';
const user='11111111-1111-4111-8111-111111111111';
const ws='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333';
function fixture({outside=false,company='WASS',listFailure=false}={}){
 const calls=[];let qrPath=null;
 const auth={userId:user,isSignedIn:true,async getVerifiedUser(){return {id:user};},
  async token(){return 'synthetic-expiring-test-token';}};
 const api={async context(){return {user_id:user,workspace_id:outside?id:ws,profile:{status:'active'}};},
  async rpc(name,args){calls.push({name,args});
   if(name==='frt_bootstrap')return {membership:{enabled:true,status:'active',role:'GENERAL_MANAGER',
    user_id:user,workspace_id:ws},companies:[{code:company}]};
   if(name==='frt_list_saved_recipients'){
    if(listFailure)throw Object.assign(Error('RPC not installed'),{status:404});
    return [{id,recipientName:'Supplier',accountName:'Supplier Holding',
     bankName:'Bank',accountNumber:'123',qrPath}];
   }
   if(name==='frt_save_recipient')return {id,saved:true,qrPath:null};
   if(name==='frt_set_recipient_qr'){qrPath=args.p_next_path;return {id,saved:true,qrPath};}
   throw Error('Unexpected '+name);
  }};
 const requests=[];
 const fetchImpl=async(url,options)=>{
  requests.push({url,options});
  return {ok:true,status:200,async json(){return {path:'synthetic-object-path'};}};
 };
 const client=new FRTRecipientClient({auth,api,fetchImpl,baseUrl:'https://test.supabase.co',apiKey:'public-test'});
 return {client,calls,requests};
}
const scope={workspaceId:ws,companyCode:'WASS',role:'GENERAL_MANAGER'};
test('signed recipient read reuses existing workspace role/company scope',async()=>{
 const f=fixture(),rows=await f.client.list(scope);
 assert.equal(rows.length,1);
 assert.equal(f.calls[0].name,'frt_bootstrap');
 assert.deepEqual(f.calls[1],{name:'frt_list_saved_recipients',
  args:{p_workspace_id:ws,p_company:'WASS'}});
});
test('signed recipient save invokes RPC with intended scoped fields and no duplicate',async()=>{
 const f=fixture();const r=await f.client.save({...scope,recipientName:'Supplier',
  accountName:'Supplier Holding',bankName:'Bank',accountNumber:'123'});
 assert.equal(r.id,id);
 assert.equal(f.calls.filter(c=>c.name==='frt_save_recipient').length,1);
 assert.deepEqual(f.calls.at(-1).args,{
  p_workspace_id:ws,p_company:'WASS',p_recipient_name:'Supplier',
  p_account_name:'Supplier Holding',p_bank_name:'Bank',p_account_number:'123'});
});
test('foreign workspace, unrecognized company, blank account deny before mutation',async()=>{
 for(const [options,params] of [
  [{outside:true},{...scope,recipientName:'Supplier',accountName:'Supplier Holding',bankName:'Bank',accountNumber:'123'}],
  [{company:'WAO'},{...scope,recipientName:'Supplier',accountName:'Supplier Holding',bankName:'Bank',accountNumber:'123'}],
  [{},{...scope,recipientName:'Supplier',accountName:'',bankName:'Bank',accountNumber:'123'}]]){
  const f=fixture(options);
  await assert.rejects(()=>f.client.save(params));
  assert.equal(f.calls.filter(c=>c.name==='frt_save_recipient').length,0);
 }
});
test('when RPC is unavailable, the saved-account capability rejects without any writes',async()=>{
 const f=fixture({listFailure:true});
 await assert.rejects(()=>f.client.list(scope),{status:404});
 assert.equal(f.calls.filter(c=>c.name==='frt_save_recipient').length,0);
});
test('QR upload requires genuine signed image metadata and bytes',async()=>{
 const f=fixture();
 const invalid={type:'image/png',size:4,async arrayBuffer(){return Uint8Array.of(1,2,3,4).buffer}};
 await assert.rejects(()=>f.client.uploadQR({...scope,recipientId:id,file:invalid}));
 assert.equal(f.requests.length,0);
 const oversized={type:'image/png',size:3*1024*1024+1,async arrayBuffer(){throw Error('should not read')}};
 await assert.rejects(()=>f.client.uploadQR({...scope,recipientId:id,file:oversized}));
 assert.equal(f.requests.length,0);
});
test('valid private image upload is workspace-prefixed and registered by signed recipient QR RPC',async()=>{
 const f=fixture();
 const bytes=Uint8Array.of(137,80,78,71,13,10,26,10,0);
 const file={type:'image/png',size:bytes.length,async arrayBuffer(){return bytes.buffer}};
 const result=await f.client.uploadQR({...scope,recipientId:id,file});
 assert.equal(result.recipientId,id);
 assert.equal(f.requests.length,1);
 assert.match(f.requests[0].url,/\/storage\/v1\/object\/frt-attachments\//);
 assert.ok(f.requests[0].url.includes(ws+'/recipients/'+id+'/'));
 assert.equal(f.requests[0].options.headers['x-upsert'],'false');
 assert.equal(f.calls.filter(c=>c.name==='frt_set_recipient_qr').length,1);
 assert.equal(f.calls.at(-1).name,'frt_list_saved_recipients');
});
test('signed QR retrieval normalizes Supabase signed path and never creates a public URL',async()=>{
 const f=fixture();
 const path=ws+'/recipients/'+id+'/12345678-1234-4234-8234-123456789abc.png';
 f.client.api.rpc=async(name,args)=>{
  f.calls.push({name,args});
  if(name==='frt_bootstrap')return {membership:{enabled:true,status:'active',role:'GENERAL_MANAGER',
   user_id:user,workspace_id:ws},companies:[{code:'WASS'}]};
  if(name==='frt_list_saved_recipients')return [{id,recipientName:'Supplier',accountName:'Holder',
   bankName:'Bank',accountNumber:'123',qrPath:path}];
  throw Error(name);
 };
 f.client.fetchImpl=async(url,options)=>{
  f.requests.push({url,options});
  return {ok:true,status:200,async json(){return {signedURL:'/object/sign/frt-attachments/'+path+'?token=short-lived'};}};
 };
 const url=await f.client.signedQRUrl({...scope,recipientId:id,qrPath:path});
 assert.equal(url,'https://test.supabase.co/storage/v1/object/sign/frt-attachments/'+path+'?token=short-lived');
 assert.equal(f.requests.length,1);
 assert.ok(!url.includes('/object/public/'));
 await assert.rejects(()=>f.client.signedQRUrl({...scope,recipientId:id,qrPath:ws+'/recipients/'+id+'/different.png'}));
 assert.equal(f.requests.length,1);
});
test('an uncertain saved-account response is marked for refresh and never automatically retried',async()=>{
 const f=fixture();
 f.client.api.rpc=async(name)=>{
  f.calls.push({name});
  if(name==='frt_bootstrap')return {membership:{enabled:true,status:'active',role:'GENERAL_MANAGER',
   user_id:user,workspace_id:ws},companies:[{code:'WASS'}]};
  throw Object.assign(Error('Network after commit'),{status:503});
 };
 await assert.rejects(()=>f.client.save({...scope,recipientName:'Supplier',accountName:'Holder',
  bankName:'Bank',accountNumber:'123'}),error=>error.recipientOutcomeUncertain===true);
 assert.equal(f.calls.filter(c=>c.name==='frt_save_recipient').length,1);
});
test('wizard presents controls but defaults to disabled until signed recipient capability resolves',()=>{
 const html=renderFRTRequestWizard({companies:[{code:'WASS',name:'WASS'}],selectedCompany:'WASS'});
 assert.match(html,/data-frt-saved-recipient disabled/);
 assert.match(html,/data-frt-save-recipient disabled/);
 assert.match(html,/data-frt-upload-qr disabled/);
 assert.match(html,/data-frt-preview-qr disabled/);
 assert.match(html,/name="recipientAccountName"/);
 assert.match(html,/QR Code/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/mountFRTRecipientUI\(modal/);
});
test('candidate has no new bucket or policy changes; signed RPC and table RLS are explicit',()=>{
 const sql=readFileSync(new URL('../../sql/cp-frt-recipient02-CANDIDATE.sql',import.meta.url),'utf8');
 for(const term of ['ENABLE ROW LEVEL SECURITY','REVOKE ALL ON TABLE public.frt_saved_recipients',
 'private.frt_has_membership(p_workspace_id)','frt_list_saved_recipients',
 'frt_save_recipient','frt_set_recipient_qr','storage.objects'])assert.ok(sql.includes(term),term);
 assert.match(sql,/AND sr\.created_by=auth\.uid\(\)/);
 assert.doesNotMatch(sql,/CREATE POLICY|UPDATE storage\.buckets|INSERT INTO storage\.buckets/i);
});
