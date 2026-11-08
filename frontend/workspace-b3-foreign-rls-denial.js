/**
 * CP-WS-02D/B3 — two real, independent signed principals; one existing
 * Order Intake record; one targeted direct PostgREST table RLS read.
 *
 * Phase 1: an authorized owner session confirms that an existing row
 * belongs to its authoritative current workspace. Only a UUID is kept
 * in volatile module memory, max 15 minutes, never storage/clipboard.
 * Phase 2: a DIFFERENT genuinely signed user in a DIFFERENT authoritative
 * workspace requests that exact row by ID using the caller's own JWT.
 *
 * A PASS is strictly scoped to the tested RLS SELECT policy/table/row.
 * It cannot attest ALL workspace services, all tables, or revocation.
 * No invitations, mock accounts, policy/grant changes, mutation or telemetry.
 */
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
import {validUuid} from './data.js';

export const WS02D_B3_FOREIGN_RLS_CHECKPOINT='CP-WS-02D-B3-FOREIGN-TABLE-RLS';
const ORIGIN='https://wass-psti.github.io';
const HOST='https://jtlusodorfnyzgyuewkz.supabase.co';
const TABLE='/rest/v1/order_intake_orders';
const TIME_TO_LIVE_MS=15*60*1000;
const STATES=new Set(['PASS','FAIL','BLOCKED','INCONCLUSIVE','READY']);
const STAGES=new Set(['prerequisite','owner-signed-context','owner-read',
 'owner-no-fixture','owner-row-confirmed','foreign-principal-required',
 'foreign-same-user','foreign-same-workspace','foreign-read','foreign-row-visible','foreign-row-denied','expired-fixture',
 'session-changed','no-fixture','fixture-cleared','network']);
let fixture=null;

const stageSafe=x=>STAGES.has(x)?x:'prerequisite';
// Do not include user IDs, workspace IDs, tokens or row references in diagnostics.
const STAGE_GUIDANCE=Object.freeze({
 'foreign-same-user':'Step 2 is still using the row owner account. Sign in as a different existing user before retrying.',
 'foreign-same-workspace':'The signed user differs, but the server-authoritative active workspace is the same as the row owner workspace. Use an existing user with a different active workspace.',
 'foreign-principal-required':'A verified signed user and authoritative workspace could not be established. Reauthenticate before retrying.',
 'owner-no-fixture':'Step 1 found no authorized Order Intake row in this signed workspace. Run Step 1 under an authorized Work Management account.'
});
const report=(status,stage)=>Object.freeze({
 checkpoint:WS02D_B3_FOREIGN_RLS_CHECKPOINT,
 status:STATES.has(status)?status:'BLOCKED',
 stage:stageSafe(stage),
 fixtureConfirmed:status==='READY'||status==='PASS',
 genuineDistinctSignedPrincipalsVerified:status==='PASS',
 foreignWorkspaceDenialVerified:status==='PASS',
 independentTableRlsVerified:status==='PASS',
 scopedTable:'public.order_intake_orders',
 allWorkspaceModulesVerified:false,
 allWatchedTablesRlsVerified:false,
 revokedSessionDenialVerified:false,
 readOnly:true,writesAttempted:0,identifiersDisclosed:0,
 acceptanceBoundary:'ONE_EXISTING_ROW_TWO_GENUINE_SIGNED_PRINCIPALS_DIRECT_TABLE_RLS_ONLY'
});

function validConfiguration(origin,fetchImpl,auth,api){
 return origin===ORIGIN&&SUPABASE_URL===HOST&&
  typeof SUPABASE_PUBLISHABLE_KEY==='string'&&
  /^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(SUPABASE_PUBLISHABLE_KEY)&&
  typeof fetchImpl==='function'&&typeof auth?.getVerifiedUser==='function'&&
  typeof auth?.token==='function'&&typeof api?.context==='function';
}

async function verified(auth,api){
 const user=await auth.getVerifiedUser();
 const ctx=await api.context();
 if(!validUuid(user?.id)||auth.userId!==user.id||
    ctx?.user_id!==user.id||!validUuid(ctx?.workspace_id)||
    ctx?.profile?.status!=='active')return null;
 return {actor:user.id,workspace:ctx.workspace_id};
}
async function readTable({token,path,fetchImpl}){
 if(typeof token!=='string'||token.length<65||token.length>10000)return null;
 let response;
 try{response=await fetchImpl(HOST+path,{
  method:'GET',mode:'cors',redirect:'error',cache:'no-store',
  headers:{Authorization:'Bearer '+token,apikey:SUPABASE_PUBLISHABLE_KEY,
   Accept:'application/json'},signal:AbortSignal.timeout(10000)
 });}catch{return null;}
 if(response?.status!==200)return null;
 if(!response?.headers?.get('content-type')?.toLowerCase().includes('application/json'))
  return null;
 const length=response.headers.get('content-length');
 if(length&&(!/^\d+$/.test(length)||Number(length)>4096))return null;
 try{
  const text=await response.text();
  if(typeof text!=='string'||text.length>4096)return null;
  const value=JSON.parse(text);
  if(!Array.isArray(value)||value.length>1)return null;
  return value;
 }catch{return null;}
}

export function clearWs02dB3ForeignRlsFixture(){
 fixture=null;
 return report('BLOCKED','fixture-cleared');
}
export function hasWs02dB3ForeignRlsFixture(clock=()=>Date.now()){
 if(!fixture)return false;
 if(typeof clock!=='function'||clock()>=fixture.expiresAt){
  fixture=null;return false;
 }
 return true;
}

export async function captureWs02dB3OwnerRlsFixture({
 auth,api,fetchImpl=globalThis.fetch,origin=globalThis.location?.origin,
 clock=()=>Date.now()
}={}){
 fixture=null;
 if(!validConfiguration(origin,fetchImpl,auth,api)||typeof clock!=='function')
  return report('BLOCKED','prerequisite');
 let prior,token;
 try{
  prior=await verified(auth,api);
  if(!prior)return report('BLOCKED','owner-signed-context');
  token=await auth.token();
 }catch{return report('BLOCKED','owner-signed-context');}

 const qs=new URLSearchParams({
  select:'id,workspace_id',workspace_id:'eq.'+prior.workspace,
  order:'id.asc',limit:'1'
 });
 const rows=await readTable({token,path:TABLE+'?'+qs.toString(),fetchImpl});
 if(rows===null)return report('BLOCKED','network');
 if(rows.length===0)return report('INCONCLUSIVE','owner-no-fixture');
 const row=rows[0];
 if(!row||typeof row!=='object'||Array.isArray(row)||
    Object.keys(row).sort().join(',')!=='id,workspace_id'||
    !validUuid(row.id)||row.workspace_id!==prior.workspace)
  return report('FAIL','owner-read');
 try{
  const after=await verified(auth,api);
  if(!after||after.actor!==prior.actor||after.workspace!==prior.workspace)
   return report('BLOCKED','session-changed');
 }catch{return report('BLOCKED','session-changed');}

 const time=clock();
 if(!Number.isFinite(time))return report('BLOCKED','prerequisite');
 fixture={id:row.id,ownerActor:prior.actor,ownerWorkspace:prior.workspace,
  expiresAt:time+TIME_TO_LIVE_MS};
 return report('READY','owner-row-confirmed');
}

export async function verifyWs02dB3ForeignRlsDenial({
 auth,api,fetchImpl=globalThis.fetch,origin=globalThis.location?.origin,
 clock=()=>Date.now()
}={}){
 if(!validConfiguration(origin,fetchImpl,auth,api)||typeof clock!=='function')
  return report('BLOCKED','prerequisite');
 if(!hasWs02dB3ForeignRlsFixture(clock))
  return report('INCONCLUSIVE','no-fixture');
 const sample=fixture;
 let prior,token;
 try{
  prior=await verified(auth,api);
  if(!prior)return report('BLOCKED','foreign-principal-required');
  if(prior.actor===sample.ownerActor)
   return report('INCONCLUSIVE','foreign-same-user');
  if(prior.workspace===sample.ownerWorkspace)
   return report('INCONCLUSIVE','foreign-same-workspace');
  token=await auth.token();
 }catch{return report('BLOCKED','foreign-principal-required');}

 const qs=new URLSearchParams({select:'id',id:'eq.'+sample.id,limit:'1'});
 const rows=await readTable({token,path:TABLE+'?'+qs.toString(),fetchImpl});
 if(rows===null)return report('INCONCLUSIVE','network');
 if(rows.length!==0){
  fixture=null;
  return report('FAIL','foreign-row-visible');
 }
 try{
  const after=await verified(auth,api);
  if(!after||after.actor!==prior.actor||
     after.workspace!==prior.workspace)
   return report('BLOCKED','session-changed');
 }catch{return report('BLOCKED','session-changed');}
 if(!hasWs02dB3ForeignRlsFixture(clock)||fixture!==sample)
  return report('INCONCLUSIVE','expired-fixture');
 fixture=null;
 return report('PASS','foreign-row-denied');
}

export function sanitizeWs02dB3ForeignRlsReport(value){
 const status=STATES.has(value?.status)?value.status:'BLOCKED';
 const accepted=status==='PASS'&&
  value?.foreignWorkspaceDenialVerified===true&&
  value?.independentTableRlsVerified===true&&
  value?.genuineDistinctSignedPrincipalsVerified===true;
 return JSON.stringify({
  checkpoint:WS02D_B3_FOREIGN_RLS_CHECKPOINT,
  status:status==='PASS'&&!accepted?'BLOCKED':status,
  stage:stageSafe(value?.stage),
  genuineDistinctSignedPrincipalsVerified:accepted,
  foreignWorkspaceDenialVerified:accepted,
  independentTableRlsVerified:accepted,
  scopedTable:'public.order_intake_orders',
  allWatchedTablesRlsVerified:false,
  revokedSessionDenialVerified:false,
  writesAttempted:0,identifiersDisclosed:0,
  acceptanceBoundary:'ONE_EXISTING_ROW_TWO_GENUINE_SIGNED_PRINCIPALS_DIRECT_TABLE_RLS_ONLY'
 },null,2);
}

export function renderWs02dB3ForeignRlsDenial({
 busy=false,result=null,hasFixture=false
}={}){
 const status=STATES.has(result?.status)?result.status:'BLOCKED';
 const stage=stageSafe(result?.stage);
 return '<section class="panel" aria-labelledby="ws02d-b3-rls-title">'+
  '<div class="panel-header"><h2 id="ws02d-b3-rls-title">B3 · Genuine foreign-workspace table RLS</h2></div>'+
  '<div class="panel-body"><p class="muted">Read-only, two-step verification of one existing '+
  'Order Intake row under TWO DIFFERENT existing signed users in DIFFERENT workspaces. '+
  'Uses direct PostgREST SELECT, not a SECURITY DEFINER RPC. No record, user, '+
  'workspace ID or JWT is exported. The row reference stays in this tab only '+
  'for 15 minutes and disappears on refresh. No test accounts or data writes.</p>'+
  '<button class="secondary" type="button" data-action="security-ws02d-b3-rls-capture"'+
   (busy?' disabled':'')+'>1. Capture existing authorized row</button>'+
  (hasFixture?'<button class="secondary" type="button" data-action="security-ws02d-b3-rls-handoff"'+
   (busy?' disabled':'')+'>Continue: sign out this session only and sign in as the foreign user</button>':'')+
  '<button class="primary" type="button" data-action="security-ws02d-b3-rls-verify"'+
   (busy||!hasFixture?' disabled':'')+'>2. Test after signing in as foreign-workspace user</button>'+
  '<button class="secondary" type="button" data-action="security-ws02d-b3-rls-clear"'+
   (busy||!hasFixture?' disabled':'')+'>Discard temporary row reference</button>'+
  '<p class="muted">'+(hasFixture?'Authorized row captured in this tab; use the explicit local-session sign-out below, then sign in '+
    'as another EXISTING user in a different workspace, without refreshing this tab. '+
    'Use Continue above to switch accounts, then Step 2 ONLY; Step 1 would discard the row reference.':
    'No authorized row reference is currently retained.')+'</p>'+
  (result?'<div role="status" aria-live="polite"><p><strong>Targeted RLS: '+
   status+'</strong> · '+stage+'</p>'+
   (STAGE_GUIDANCE[stage]?'<p class="muted">'+STAGE_GUIDANCE[stage]+'</p>':'')+
   '<p class="muted">A PASS proves only one direct table/row denial; all-table RLS '+
   'and revoked-session acceptance remain pending.</p>'+
   '<button type="button" class="secondary" data-action="security-ws02d-b3-rls-copy">'+
    'Copy nonsecret targeted-RLS report</button></div>':'')+
  '</div></section>';
}
