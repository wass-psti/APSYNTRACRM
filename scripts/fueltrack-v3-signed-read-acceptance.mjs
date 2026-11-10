#!/usr/bin/env node
/**
 * Signed, non-mutating production contract gate for FuelTrack+ v3.
 * No writes, roles, credentials, synthetic accounts, or migrations.
 * Credentials supplied via process environment at invocation time; never logged.
 *
 * Required: FT3_SUPABASE_URL, FT3_PUBLISHABLE_KEY, FT3_ACCESS_TOKEN,
 *           FT3_WORKSPACE_ID.
 * Optional: FT3_EXPECTED_ROLE=Admin|User, FT3_BOARD_ID.
 */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const BOARD='7af78b3f-67bf-4600-9aa1-9006d19d486e';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const EXPECTED_PROJECT='jtlusodorfnyzgyuewkz';
const fail=message=>{throw new Error(message);};
const assert=(value,message)=>{if(!value)fail(message);};
function checkConfig(env){
 const url=new URL(env.FT3_SUPABASE_URL||'https://example.invalid');
 assert(url.protocol==='https:'&&url.hostname===EXPECTED_PROJECT+'.supabase.co',
  'Target must be the approved existing WatchdogWorkspace Supabase project.');
 assert(typeof env.FT3_PUBLISHABLE_KEY==='string'&&env.FT3_PUBLISHABLE_KEY.length>=10,
  'Missing publishable key.');
 assert(typeof env.FT3_ACCESS_TOKEN==='string'&&env.FT3_ACCESS_TOKEN.length>=30,
  'Missing signed access token.');
 assert(UUID.test(env.FT3_WORKSPACE_ID||''),'Missing expected active workspace UUID.');
 assert(!env.FT3_BOARD_ID||env.FT3_BOARD_ID===BOARD,'Wrong FuelTrack Board ID.');
 assert(!env.FT3_EXPECTED_ROLE||['Admin','User'].includes(env.FT3_EXPECTED_ROLE),
  'Invalid expected FuelTrack role.');
 return {base:url.origin,board:BOARD,workspace:env.FT3_WORKSPACE_ID,
   role:env.FT3_EXPECTED_ROLE||null,
   headers:{apikey:env.FT3_PUBLISHABLE_KEY,
    Authorization:'Bearer '+env.FT3_ACCESS_TOKEN,'Content-Type':'application/json'}};
}
async function call(fetchImpl,url,options){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetchImpl(url,{...options,signal:controller.signal});
  let body=null;
  try{body=await response.json();}catch{}
  return {status:response.status,ok:response.ok,body};
 }finally{clearTimeout(timeout);}
}
export async function runFuelTrackSignedReadAcceptance({env=process.env,fetchImpl=fetch}={}){
 const cfg=checkConfig(env);
 const origin=cfg.base;
 const results=[];
 // Require identity verification against the Auth provider, not decoded claims alone.
 const identity=await call(fetchImpl,origin+'/auth/v1/user',
   {method:'GET',headers:cfg.headers});
 assert(identity.ok&&UUID.test(identity.body?.id||''),'Signed Auth user validation failed.');
 results.push('AUTH_USER_VERIFIED');
 const rpc=async(name,args,headers=cfg.headers)=>call(fetchImpl,
  origin+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args)});
 const read=await rpc('fueltrack_v3_read',{p_board_id:cfg.board,p_limit:1});
 assert(read.ok,'FuelTrack read RPC unavailable or signed read denied (HTTP '+read.status+').');
 const r=read.body;
 assert(r?.status==='VERIFIED_READ'&&r.boardId===cfg.board&&
   r.workspaceId===cfg.workspace&&
   ['Admin','User'].includes(r.role)&&(!cfg.role||r.role===cfg.role)&&
   Array.isArray(r.rows)&&r.rows.length<=1&&r.summary&&typeof r.summary==='object',
   'FuelTrack read scope, role, or response contract mismatch.');
 results.push('SIGNED_READ_SCOPED');
 const analytics=await rpc('fueltrack_v3_analytics',{p_board_id:cfg.board,p_days:7});
 assert(analytics.ok,'FuelTrack analytics read unavailable (HTTP '+analytics.status+').');
 assert(analytics.body?.status==='VERIFIED_READ'&&analytics.body.boardId===cfg.board&&
  analytics.body.workspaceId===cfg.workspace&&Array.isArray(analytics.body.daily),
  'Analytics scope mismatch.');
 results.push('SIGNED_ANALYTICS_SCOPED');
 if(r.role==='Admin'){
  const audit=await rpc('fueltrack_v3_audit_read',
   {p_board_id:cfg.board,p_before_id:null,p_limit:1});
  assert(audit.ok,'Admin audit read unavailable (HTTP '+audit.status+').');
  assert(audit.body?.status==='VERIFIED_READ'&&audit.body.boardId===cfg.board&&
   audit.body.workspaceId===cfg.workspace&&Array.isArray(audit.body.events),
   'Admin audit scope mismatch.');
  results.push('ADMIN_AUDIT_SCOPED');
 }else{
  const audit=await rpc('fueltrack_v3_audit_read',
    {p_board_id:cfg.board,p_before_id:null,p_limit:1});
  assert(audit.status===401||audit.status===403,
   'Non-Admin user unexpectedly allowed immutable audit read.');
  results.push('USER_AUDIT_DENIED');
 }
 // A foreign UUID cannot read another Board's FuelTrack records.
 const foreign=await rpc('fueltrack_v3_read',
  {p_board_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',p_limit:1});
 assert([401,403].includes(foreign.status),'Wrong Board read was not denied.');
 results.push('WRONG_BOARD_DENIED');
 // No Authorization: missing session must never return signed data.
 const unsigned=await rpc('fueltrack_v3_read',
  {p_board_id:cfg.board,p_limit:1},
  {apikey:cfg.headers.apikey,'Content-Type':'application/json'});
 assert([401,403,404].includes(unsigned.status),'Anonymous read was not denied.');
 results.push('ANONYMOUS_DENIED');
 // Real signed, no-write probes. Unknown request IDs must disclose neither
 // private receipt metadata nor permission to upload a receipt. Never use
 // an existing production request or create a Storage object here.
 const unknownRequest='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 const unavailableReceipt=await rpc('fueltrack_v3_receipt_read',{
  p_board_id:cfg.board,p_request_id:unknownRequest
 });
 assert([401,403,404].includes(unavailableReceipt.status),
  'Unknown request receipt metadata unexpectedly disclosed (HTTP '+unavailableReceipt.status+').');
 results.push('UNKNOWN_RECEIPT_DENIED');
 const receiptPrepare=await rpc('fueltrack_v3_receipt_prepare',{
  p_board_id:cfg.board,p_request_id:unknownRequest
 });
 assert([401,403,404].includes(receiptPrepare.status),
  'Unknown request receipt upload preparation unexpectedly authorized (HTTP '+receiptPrepare.status+').');
 results.push('UNKNOWN_RECEIPT_PREPARE_DENIED');
 const foreignReceipt=await rpc('fueltrack_v3_receipt_read',{
  p_board_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  p_request_id:unknownRequest
 });
 assert([401,403,404].includes(foreignReceipt.status),
  'Wrong Board receipt metadata unexpectedly disclosed (HTTP '+foreignReceipt.status+').');
 results.push('WRONG_BOARD_RECEIPT_DENIED');
 const unsignedReceipt=await rpc('fueltrack_v3_receipt_read',{
  p_board_id:cfg.board,p_request_id:unknownRequest
 },{apikey:cfg.headers.apikey,'Content-Type':'application/json'});
 assert([401,403,404].includes(unsignedReceipt.status),
  'Anonymous receipt metadata unexpectedly disclosed (HTTP '+unsignedReceipt.status+').');
 results.push('ANONYMOUS_RECEIPT_DENIED');
 // No domain mutations, Storage writes, or signed URL creation performed.
 return {status:'READ_ONLY_ACCEPTANCE_PASS',checks:results};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  const result=await runFuelTrackSignedReadAcceptance();
  process.stdout.write(result.status+'\n'+result.checks.map(x=>'PASS '+x).join('\n')+'\n');
 }catch(error){
  process.stderr.write('SIGNED_READ_ACCEPTANCE_BLOCKED: '+error.message+'\n');
  process.exitCode=1;
 }
}
