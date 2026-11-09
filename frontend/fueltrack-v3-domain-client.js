/** FuelTrack+ v3 authoritative backend boundary.
 * Uses the existing signed DomainApi RPC transport; no duplicate authentication,
 * browser-side persistence, role inference, or silent mock fallback.
 *
 * Backend migration: fueltrack_v3_backend_core.
 * The caller must preserve the same clientKey on retry to achieve idempotency.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid=v=>typeof v==='string'&&UUID.test(v);
const revision=v=>Number.isSafeInteger(v)&&v>=1;
function requireUuid(v,label){
 if(!isUuid(v))throw new TypeError('Invalid '+label);
 return v;
}
function requireRead(result,boardId,workspaceId){
 if(!result||result.status!=='VERIFIED_READ'||result.boardId!==boardId||
    result.workspaceId!==workspaceId||!Array.isArray(result.rows)||
    !result.summary||typeof result.summary!=='object'||
    !['total','submitted','approved','rejected','refuelingDone','completed']
      .every(key=>Number.isSafeInteger(Number(result.summary[key]))&&Number(result.summary[key])>=0))
  throw new Error('Invalid signed FuelTrack v3 read response');
 return result;
}
function requireWrite(result){
 if(!result||!isUuid(result.id)||!revision(Number(result.revision))||
    !['submitted','approved','rejected','refueling_done','completed'].includes(result.state))
  throw new Error('Invalid FuelTrack v3 mutation response');
 return result;
}
export class FuelTrackV3DomainClient {
 constructor({api,auth,workspaceId,boardId}={}){
  if(!api||typeof api.rpc!=='function'||!auth||typeof auth.isSignedIn!=='boolean')
   throw new TypeError('FuelTrack requires signed DomainApi and auth');
  this.api=api;this.auth=auth;
  this.workspaceId=requireUuid(workspaceId,'workspace');
  this.boardId=requireUuid(boardId,'board');
 }
 assertSigned(){
  if(!this.auth.isSignedIn)throw new Error('FuelTrack signed session required');
 }
 async call(name,args){
  this.assertSigned();
  const actor=this.auth.userId??null;
  const result=await this.api.rpc(name,args);
  this.assertSigned();
  if(actor!==null&&this.auth.userId!==actor)
   throw new Error('FuelTrack signed identity changed during request');
  return result;
 }
 async read({limit=100}={}){
  this.assertSigned();
  if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw new TypeError('Invalid page size');
  return requireRead(await this.call('fueltrack_v3_read',
   {p_board_id:this.boardId,p_limit:limit}),this.boardId,this.workspaceId);
 }
 async analytics({days=90}={}){
  this.assertSigned();
  if(!Number.isSafeInteger(days)||days<1||days>365)
   throw new TypeError('Invalid analytics window');
  const result=await this.call('fueltrack_v3_analytics',
   {p_board_id:this.boardId,p_days:days});
  if(!result||result.status!=='VERIFIED_READ'||result.boardId!==this.boardId||
     result.workspaceId!==this.workspaceId||!Array.isArray(result.daily))
   throw new Error('Invalid signed FuelTrack analytics response');
  return result;
 }
 async audit({beforeId=null,limit=100}={}){
  this.assertSigned();
  if(!Number.isSafeInteger(limit)||limit<1||limit>200||
    (beforeId!==null&&(!Number.isSafeInteger(beforeId)||beforeId<1)))
   throw new TypeError('Invalid audit cursor or page size');
  const result=await this.call('fueltrack_v3_audit_read',
   {p_board_id:this.boardId,p_before_id:beforeId,p_limit:limit});
  if(!result||result.status!=='VERIFIED_READ'||result.boardId!==this.boardId||
     result.workspaceId!==this.workspaceId||!Array.isArray(result.events)||
     typeof result.hasMore!=='boolean')
   throw new Error('Invalid signed FuelTrack audit response');
  return result;
 }
 async submit({clientKey,kind,details}={}){
  this.assertSigned();
  requireUuid(clientKey,'clientKey');
  if(!['vehicle','container'].includes(kind)||!details||typeof details!=='object'||
   Array.isArray(details))throw new TypeError('Invalid request payload');
  return requireWrite(await this.call('fueltrack_v3_submit',
   {p_board_id:this.boardId,p_client_key:clientKey,p_kind:kind,p_details:details}));
 }
 async decide({requestId,expectedRevision,decision,reason=null}={}){
  this.assertSigned();requireUuid(requestId,'request');
  if(!revision(expectedRevision)||!['approved','rejected'].includes(decision))
   throw new TypeError('Invalid decision');
  return requireWrite(await this.call('fueltrack_v3_decide',
   {p_board_id:this.boardId,p_request_id:requestId,
    p_expected_revision:expectedRevision,p_decision:decision,p_reason:reason}));
 }
 async markRefueled({requestId,expectedRevision}={}){
  this.assertSigned();requireUuid(requestId,'request');
  if(!revision(expectedRevision))throw new TypeError('Invalid expected revision');
  return requireWrite(await this.call('fueltrack_v3_mark_refueled',
   {p_board_id:this.boardId,p_request_id:requestId,p_expected_revision:expectedRevision}));
 }
 async receiptPrepare({requestId}={}){
  this.assertSigned();requireUuid(requestId,'request');
  const result=await this.call('fueltrack_v3_receipt_prepare',
   {p_board_id:this.boardId,p_request_id:requestId});
  if(!result||result.status!=='VERIFIED_RECEIPT_PREPARE'||
     result.requestId!==requestId||result.boardId!==this.boardId||
     result.workspaceId!==this.workspaceId||!isUuid(result.boardItemId)||
     result.bucket!=='work-board-files')
   throw new Error('Invalid signed receipt preparation');
  return result;
 }
 async receiptRead({requestId}={}){
  this.assertSigned();requireUuid(requestId,'request');
  const result=await this.call('fueltrack_v3_receipt_read',
   {p_board_id:this.boardId,p_request_id:requestId});
  if(!result||result.requestId!==requestId||
   !['VERIFIED_RECEIPT','NO_RECEIPT'].includes(result.status))
   throw new Error('Invalid signed receipt record');
  if(result.status==='VERIFIED_RECEIPT'&&
    (!isUuid(result.boardItemId)||!isUuid(result.fileId)||
     typeof result.storagePath!=='string'||
     !result.storagePath.startsWith(this.boardId+'/'+result.boardItemId+'/')))
   throw new Error('Mismatched receipt Board identity');
  return result;
 }
 async receiptRegister({requestId,path,fileName,mimeType,sizeBytes}={}){
  this.assertSigned();requireUuid(requestId,'request');
  if(typeof path!=='string'||typeof fileName!=='string'||
    typeof mimeType!=='string'||!Number.isSafeInteger(sizeBytes))
   throw new TypeError('Invalid receipt object metadata');
  const result=await this.call('fueltrack_v3_attach_receipt',{
   p_board_id:this.boardId,p_request_id:requestId,p_storage_path:path,
   p_file_name:fileName,p_mime_type:mimeType,p_size_bytes:sizeBytes
  });
  if(!result||result.status!=='VERIFIED_RECEIPT'||
   result.requestId!==requestId||!isUuid(result.boardItemId)||
   !isUuid(result.fileId)||result.storagePath!==path||
   !path.startsWith(this.boardId+'/'+result.boardItemId+'/'))
   throw new Error('Invalid signed receipt registration');
  return result;
 }
 async complete({requestId,expectedRevision,actualAmount,fuelLiters,receiptNumber=null}={}){
  this.assertSigned();requireUuid(requestId,'request');
  if(!revision(expectedRevision)||typeof actualAmount!=='number'||!Number.isFinite(actualAmount)||
    actualAmount<=0||typeof fuelLiters!=='number'||!Number.isFinite(fuelLiters)||fuelLiters<=0||
    (receiptNumber!==null&&(typeof receiptNumber!=='string'||receiptNumber.length>120)))
   throw new TypeError('Invalid refueling receipt');
  return requireWrite(await this.call('fueltrack_v3_complete',
   {p_board_id:this.boardId,p_request_id:requestId,p_expected_revision:expectedRevision,
    p_actual_amount:actualAmount,p_fuel_liters:fuelLiters,p_receipt_number:receiptNumber}));
 }
}
