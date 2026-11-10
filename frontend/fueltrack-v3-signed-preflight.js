/** Interactive, read-only FuelTrack acceptance preflight.
 * Uses the existing in-page AuthClient and DomainApi as one signed identity.
 * Never accepts, exports, logs or returns bearer tokens; never mutates records
 * or Storage. Unknown request probes must be denied by the live RPC layer.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function freshProbeId(){
 const value=globalThis.crypto?.randomUUID?.();
 if(typeof value!=='string'||!UUID.test(value))
  throw new Error('Secure random identifiers are required for denial probes.');
 return value;
}
const denial=e=>[401,403,404].includes(Number(e?.status))||
 e?.code==='42501'||e?.code==='PGRST301';
async function requiresDenial(task,label){
 try{await task();}
 catch(err){
  if(denial(err))return label;
  throw new Error(label+' could not be verified (unexpected failure).');
 }
 throw new Error(label+' FAILED: server unexpectedly granted access.');
}
export async function runFuelTrackSignedPreflight({client,api,boardId,isCurrent=()=>true}={}){
 if(!client||typeof client.read!=='function'||typeof client.analytics!=='function'||
    typeof api?.rpc!=='function'||typeof boardId!=='string'||
    !client.auth||client.auth!==api.auth||
    client.boardId!==boardId||typeof client.workspaceId!=='string'||typeof isCurrent!=='function')
  throw new TypeError('FuelTrack client and RPC transport must share the same signed session and Board');
 const auth=client.auth;
 const actor=auth.userId;
 const ensureCurrent=()=>{
  if(!auth.isSignedIn||!actor||auth.userId!==actor)
   throw new Error('FuelTrack signed identity changed during acceptance.');
  if(!isCurrent())throw new Error('FuelTrack page context changed during acceptance.');
 };
 if(typeof auth.getVerifiedUser!=='function')
  throw new TypeError('Server-verified Auth identity is required');
 const checks=[];
 const wrongBoardId=freshProbeId();
 const unknownRequestId=freshProbeId();
 ensureCurrent();
 const identity=await auth.getVerifiedUser();
 ensureCurrent();
 if(identity?.id!==actor)
  throw new Error('FuelTrack Auth identity verification did not match the active session.');
 checks.push('AUTH_IDENTITY_VERIFIED');
 const read=await client.read({limit:1});
 ensureCurrent();
 if(!['Admin','User'].includes(read.role))throw new Error('FuelTrack module role unverified');
 checks.push('SIGNED_READ_SCOPED');
 await client.analytics({days:7});
 ensureCurrent();
 checks.push('SIGNED_ANALYTICS_SCOPED');
 if(read.role==='Admin'){
  await client.audit({limit:1});
  ensureCurrent();
  checks.push('ADMIN_AUDIT_SCOPED');
 }else{
  checks.push(await requiresDenial(()=>client.audit({limit:1}),'USER_AUDIT_DENIED'));
  ensureCurrent();
 }
 checks.push(await requiresDenial(()=>api.rpc('fueltrack_v3_read',{
  p_board_id:wrongBoardId,p_limit:1
 }),'WRONG_BOARD_DENIED'));
 ensureCurrent();
 checks.push(await requiresDenial(()=>api.rpc('fueltrack_v3_receipt_read',{
  p_board_id:boardId,p_request_id:unknownRequestId
 }),'UNKNOWN_RECEIPT_READ_DENIED'));
 ensureCurrent();
 checks.push(await requiresDenial(()=>api.rpc('fueltrack_v3_receipt_prepare',{
  p_board_id:boardId,p_request_id:unknownRequestId
 }),'UNKNOWN_RECEIPT_PREPARE_DENIED'));
 ensureCurrent();
 return Object.freeze({status:'READ_ONLY_PREFLIGHT_PASS',role:read.role,
  checks:Object.freeze(checks)});
}
