/** Interactive, read-only FuelTrack preflight.
 * Call exclusively through the currently authenticated DomainApi/DomainClient.
 * This module never accepts tokens and never performs a mutation or Storage operation.
 */
const WRONG_BOARD='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
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
export async function runFuelTrackSignedPreflight({client,api,boardId}={}){
 if(!client||typeof client.read!=='function'||typeof client.analytics!=='function'||
   typeof api?.rpc!=='function'||typeof boardId!=='string')
  throw new TypeError('Signed FuelTrack client and Board are required');
 const checks=[];
 const read=await client.read({limit:1});
 if(!['Admin','User'].includes(read.role))throw new Error('FuelTrack module role unverified');
 checks.push('SIGNED_READ_SCOPED');
 await client.analytics({days:7});
 checks.push('SIGNED_ANALYTICS_SCOPED');
 if(read.role==='Admin'){
  await client.audit({limit:1});
  checks.push('ADMIN_AUDIT_SCOPED');
 }else{
  checks.push(await requiresDenial(()=>client.audit({limit:1}),'USER_AUDIT_DENIED'));
 }
 checks.push(await requiresDenial(()=>api.rpc('fueltrack_v3_read',{
  p_board_id:WRONG_BOARD,p_limit:1
 }),'WRONG_BOARD_DENIED'));
 return Object.freeze({status:'READ_ONLY_PREFLIGHT_PASS',role:read.role,
  checks:Object.freeze(checks)});
}
