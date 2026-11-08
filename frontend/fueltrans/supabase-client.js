import {buildScopedCollectionQuery,verifyScopedCollectionRows} from './collection-scope20.js';
// Dependency-free browser adapter. Publishable key is safe for public clients; RLS enforces access.
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '../config.js';
export const CONFIG=Object.freeze({url:SUPABASE_URL,publishableKey:SUPABASE_PUBLISHABLE_KEY});
let host=null;
export function connectFuelTrans(context){host=context;return ()=>{if(host===context)host=null;};}
async function hostSession(required='view'){
 const context=host;
 if(!context||!context.isCurrent())throw Error('Open FuelTrans from its authorized CRM board.');
 const user=await context.auth.getVerifiedUser();
 const [access,board,allowed,moduleAllowed]=await Promise.all([context.api.context(),context.api.board(context.boardId),context.api.allowed(context.boardId,required),context.api.rpc('has_module_access',{p_module_id:'fueltrans'})]);
 if(host!==context||!context.isCurrent()||user.id!==context.userId||access.user_id!==user.id||access.workspace_id!==context.workspaceId||board.board?.workspace_id!==context.workspaceId||board.board?.name!=='FuelTrans Standalone'||!allowed||moduleAllowed!==true)
  throw Error('FuelTrans board access changed. Reopen the board.');
 return {access_token:await context.auth.token(),user,workspaceId:context.workspaceId};
}
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const seconds=()=>Math.floor(Date.now()/1000);
const headers=(token,extra={})=>({apikey:CONFIG.publishableKey,...(token?{Authorization:`Bearer ${token}`}:{}),Accept:'application/json',...extra});
export function clearSession(){}
export function restoreSession(){return null;}
async function request(url,{method='GET',token=null,body,extra={},timeout=15000}={}){
 const context=host,parsed=new URL(url);
 if(!context||!context.isCurrent())throw Error('FuelTrans view is no longer active.');
 if(parsed.pathname.startsWith('/rest/')){
  const workspace=body?.workspace_id||body?.p_workspace_id||parsed.searchParams.get('workspace_id')?.replace(/^eq\./,'');
  if(workspace!==context.workspaceId)throw Error('FuelTrans workspace does not match the active board.');
  if(method!=='GET'&&!await context.api.allowed(context.boardId,parsed.pathname.endsWith('/fueltrans_memberships')?'manage':'edit'))throw Error('Board editing permission is required.');
  if(context!==host||!context.isCurrent())throw Error('FuelTrans access changed.');
 }
const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),timeout);try{const r=await fetch(url,{method,signal:ctrl.signal,headers:{...headers(token,{'Content-Type':'application/json',...extra})},...(body!==undefined?{body:JSON.stringify(body)}:{})});let data=null;const ct=r.headers.get('content-type')||'';if(r.status!==204){const raw=await r.text();if(raw){try{data=JSON.parse(raw);}catch{data=raw;}}}
 if(!r.ok){const detail=typeof data==='object'&&data?(data.message||data.msg||data.error_description||data.error):null;const e=Error(typeof detail==='string'?detail:`Request failed (${r.status})`);e.status=r.status;throw e;}
 if(context!==host||!context.isCurrent())throw Error('FuelTrans view changed while loading.');
 return {data,range:r.headers.get('content-range'),status:r.status};}catch(e){if(e.name==='AbortError')throw Error('Supabase request timed out.');throw e;}finally{clearTimeout(timer);}}
export async function currentSession(required='view'){return hostSession(required);}
export async function verifiedUser(){const s=await currentSession();if(!s)return null;const {data}=await request(`${CONFIG.url}/auth/v1/user`,{token:s.access_token});if(data?.id!==s.user.id){clearSession();throw Error('Authenticated identity mismatch.');}return data;}
export async function signOut(){clearSession();}
const ALLOWED=new Set(['fueltrans_memberships','fueltrans_tickets','fueltrans_user_state']);
async function db(table,query,{method='GET',body,extra={}}={}){
 if(!ALLOWED.has(table))throw Error('Disallowed table.');
 const s=await currentSession();if(!s)throw Error('Authentication required.');
 const url=`${CONFIG.url}/rest/v1/${table}?${query}`;
 try{return await request(url,{method,body,token:s.access_token,extra});}
 catch(e){
  if(e.status!==401)throw e;

  // The host owns the embedded session. An expired read token is refreshed
  // through the authenticated host handshake, never through a second login.
  // Do not replay mutations: their outcome may be uncertain.

  if(method!=='GET')throw Error('FuelTrans session expired during a write. Refresh the page and verify the record before retrying.');
  const renewed=await hostSession();
  if(renewed.user.id!==s.user.id)throw Error('Host identity changed. Reload FuelTrans before continuing.');
  try{return await request(url,{method,body,token:renewed.access_token,extra});}
  catch(retryError){
   if(retryError.status===401){throw Error('APSYNTRA CRM session is no longer authorized. Reload the host session.');}
   throw retryError;
  }
 }
}
export async function select(table,query){const {data}=await db(table,query);if(!Array.isArray(data))throw Error('Invalid database response.');return data;}
export async function listTickets(query){const {data,range}=await db('fueltrans_tickets',query,{extra:{Prefer:'count=exact'}});if(!Array.isArray(data))throw Error('Invalid tickets response.');return {rows:data,totalRange:range};}
export async function insertTicket(row){const {data}=await db('fueltrans_tickets','',{method:'POST',body:row,extra:{Prefer:'return=representation'}});if(!Array.isArray(data)||data.length!==1)throw Error('Ticket creation was not confirmed.');return data[0];}
export async function countTickets(workspaceId,status){const q=new URLSearchParams({select:'id',workspace_id:`eq.${workspaceId}`,archived:'eq.false'});if(status)q.set('status',`eq.${status}`);q.set('limit','1');const {data,range}=await db('fueltrans_tickets',q.toString(),{extra:{Prefer:'count=exact'}});const m=/\/(\d+)$/.exec(range||'');if(!m)throw Error('Supabase did not return an exact count.');return Number(m[1]);}
export async function readTicket(workspaceId,id){const q=new URLSearchParams({select:'workspace_id,id,ticket_number,client_code,created_by,assigned_l1,assigned_l2,status,archived,payload,created_at,updated_at',workspace_id:`eq.${workspaceId}`,id:`eq.${id}`,limit:'1'});const rows=await select('fueltrans_tickets',q.toString());return rows[0]||null;}
// Checkpoint 23: separately allowlisted server RPCs. Never expose generic RPC execution.
const TICKET_RPC23=Object.freeze({
 fueltrans_soft_delete_ticket_v1:new Set(['p_workspace_id','p_ticket_id','p_expected_updated_at']),
 fueltrans_restore_deleted_ticket_v1:new Set(['p_workspace_id','p_ticket_id']),
 fueltrans_deleted_ticket_page_v1:new Set(['p_workspace_id','p_offset','p_limit','p_search']),
 fueltrans_permanently_delete_ticket_v1:new Set(['p_workspace_id','p_ticket_id','p_expected_deleted_at'])
});
export async function callTicketDeletionRpc(name,payload){
 const allow=TICKET_RPC23[name];
 if(!allow||!payload||Object.keys(payload).length!==allow.size||Object.keys(payload).some(key=>!allow.has(key)))throw Error('Unexpected ticket deletion RPC request.');
 const s=await currentSession();if(!s)throw Error('Authentication required.');
 const {data}=await request(`${CONFIG.url}/rest/v1/rpc/${name}`,{method:'POST',token:s.access_token,body:payload});
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Database did not acknowledge the operation. Do not automatically repeat.');
 return data;
}
// Checkpoint 04: explicitly bounded table access; every request carries a verified session.
for(const table of ['fueltrans_notifications','fueltrans_sessions','fueltrans_audit_events'])ALLOWED.add(table);
export async function readCollection(table,workspaceId,{selectFields='*',page=0,limit=25,extra={}}={}){
 if(!ALLOWED.has(table))throw Error('Disallowed table.');
 const query=buildScopedCollectionQuery(table,workspaceId,{selectFields,page,limit,extra});
 return verifyScopedCollectionRows(await select(table,query),workspaceId);
}
export async function updateTicket({workspaceId,id,expectedUpdatedAt,patch}){
 if(!/^[a-f0-9-]{36}$/i.test(String(workspaceId)))throw Error('Invalid workspace.');
 if(!/^[a-z0-9][a-z0-9._:-]{0,119}$/i.test(String(id))||!expectedUpdatedAt||!Number.isFinite(Date.parse(expectedUpdatedAt)))throw Error('Missing ticket or concurrency token.');
 const keys=Object.keys(patch||{});const allowed=['updated_at','status','archived','assigned_l1','assigned_l2','payload'];
 if(keys.length!==allowed.length||!keys.every(k=>allowed.includes(k))||!allowed.every(k=>keys.includes(k)))throw Error('Unexpected ticket patch fields.');
 const q=new URLSearchParams({workspace_id:`eq.${workspaceId}`,id:`eq.${id}`,updated_at:`eq.${expectedUpdatedAt}`,select:'workspace_id,id,status,updated_at,archived,payload'});
 const {data}=await db('fueltrans_tickets',q.toString(),{method:'PATCH',body:patch,extra:{Prefer:'return=representation'}});
 if(!Array.isArray(data)||data.length!==1)throw Error('Ticket changed or access denied; refresh before retrying.');
 const confirmed=data[0];
 if(confirmed.workspace_id!==workspaceId||String(confirmed.id)!==String(id)||
    confirmed.status!==patch.status||confirmed.archived!==patch.archived)
  throw Error('Ticket update confirmation did not match the requested record and state. Refresh before retrying; do not replay the write automatically.');
 return confirmed;
}
export async function updateFuelTransMembership({workspaceId,userId,expectedUpdatedAt,changes}){
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 if(!uuid.test(String(workspaceId))||!uuid.test(String(userId))||!Number.isFinite(Date.parse(expectedUpdatedAt)))throw Error('Invalid membership update identity/version.');
 if(!changes||Object.keys(changes).sort().join(',')!=='client_code,enabled,role,status')throw Error('Unexpected membership patch fields.');
 const q=new URLSearchParams({workspace_id:`eq.${workspaceId}`,user_id:`eq.${userId}`,updated_at:`eq.${expectedUpdatedAt}`,select:'workspace_id,user_id,role,status,enabled,client_code,updated_at'});
 const {data}=await db('fueltrans_memberships',q.toString(),{method:'PATCH',body:{...changes,updated_at:new Date().toISOString()},extra:{Prefer:'return=representation'}});
 if(!Array.isArray(data)||data.length!==1)throw Error('Membership changed or permission denied. Refresh and retry.');
 return data[0];
}
export async function markNotificationRead(workspaceId,id,userId){
 const q=new URLSearchParams({workspace_id:`eq.${workspaceId}`,id:`eq.${id}`,recipient_user_id:`eq.${userId}`,read_at:'is.null',select:'id,read_at'});
 const {data}=await db('fueltrans_notifications',q.toString(),{method:'PATCH',body:{read_at:new Date().toISOString()},extra:{Prefer:'return=representation'}});
 if(!Array.isArray(data)||data.length!==1)throw Error('Notification unavailable or already read.');return data[0];
}

// Per-user private draft persistence. RLS additionally enforces user_id = auth.uid().
export async function readBugDraftState(workspaceId,userId){
 const s=await currentSession();if(!s||s.user.id!==userId)throw Error('Identity mismatch.');
 const q=new URLSearchParams({select:'value,revision',workspace_id:`eq.${workspaceId}`,user_id:`eq.${userId}`,state_key:'eq.standalone_bug_reports_v1',limit:'1'});
 const rows=await select('fueltrans_user_state',q.toString());return rows[0]||null;
}
export async function saveBugDraftState(workspaceId,userId,expectedRevision,items){
 const s=await currentSession();if(!s||s.user.id!==userId)throw Error('Identity mismatch.');
 if(!/^[a-f0-9-]{36}$/i.test(workspaceId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!Array.isArray(items)||items.length>200)throw Error('Invalid draft state.');
 const key='standalone_bug_reports_v1';
 if(expectedRevision===0){
  const body={workspace_id:workspaceId,user_id:userId,state_key:key,revision:1,value:{items}};
  const {data}=await db('fueltrans_user_state','',{method:'POST',body,extra:{Prefer:'return=representation'}});
  if(!Array.isArray(data)||data.length!==1)throw Error('Draft creation not confirmed.');return data[0];
 }
 const q=new URLSearchParams({workspace_id:`eq.${workspaceId}`,user_id:`eq.${userId}`,state_key:`eq.${key}`,revision:`eq.${expectedRevision}`,select:'value,revision'});
 const {data}=await db('fueltrans_user_state',q.toString(),{method:'PATCH',body:{value:{items},revision:expectedRevision+1},extra:{Prefer:'return=representation'}});
 if(!Array.isArray(data)||data.length!==1)throw Error('Draft state changed or write denied. Refresh before retrying.');return data[0];
}

export async function readAllTicketsForSnapshot(workspaceId,offset,limit){
 if(!/^[a-f0-9-]{36}$/i.test(workspaceId)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid export query.');
 const q=new URLSearchParams({select:'workspace_id,id,ticket_number,client_code,created_by,assigned_l1,assigned_l2,status,archived,payload,created_at,updated_at',workspace_id:`eq.${workspaceId}`,order:'id.asc',offset:String(offset),limit:String(limit)});
 return select('fueltrans_tickets',q.toString());
}
export async function countAllTicketsForSnapshot(workspaceId){
 const q=new URLSearchParams({select:'id',workspace_id:`eq.${workspaceId}`,limit:'1'});
 const {range}=await db('fueltrans_tickets',q.toString(),{extra:{Prefer:'count=exact'}});
 const match=/\/(\d+)$/.exec(range||'');if(!match)throw Error('No authoritative ticket count.');return Number(match[1]);
}

// Checkpoint 08: optional shared issue and trusted history contract. Requires reviewed SQL migration.
for(const table of ['fueltrans_issue_reports','fueltrans_ticket_events_v2'])ALLOWED.add(table);
const UUID08=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISSUE_STATES08=new Set(['New','Investigating','Under Fix','Resolved']);
export async function submitSharedIssue({workspaceId,sourceDraftId,title,description,steps='',severity}){
 if(typeof title!=='string'||title.trim().length<5||title.trim().length>160||typeof description!=='string'||description.trim().length<10||description.trim().length>6000||typeof steps!=='string'||steps.length>4000||!['low','medium','high','critical'].includes(severity))throw Error('Invalid shared issue fields.');
 const s=await currentSession();if(!s||!UUID08.test(String(workspaceId))||!UUID08.test(String(sourceDraftId)))throw Error('Authenticated issue identity required.');
 const body={workspace_id:workspaceId,created_by:s.user.id,source_draft_id:sourceDraftId,title:title.trim(),description:description.trim(),steps,severity};
 const {data}=await db('fueltrans_issue_reports','',{method:'POST',body,extra:{Prefer:'return=representation'}});
 if(!Array.isArray(data)||data.length!==1||data[0].created_by!==s.user.id||data[0].workspace_id!==workspaceId)throw Error('IT issue submission was not confirmed.');
 return data[0];
}
export async function readSharedIssues(workspaceId,{page=0,ownerId=null}={}){
 if(!UUID08.test(String(workspaceId))||!Number.isInteger(page)||page<0||page>10000||ownerId!==null&&!UUID08.test(String(ownerId)))throw Error('Invalid shared issue query.');
 const q=new URLSearchParams({select:'id,workspace_id,created_by,source_draft_id,title,description,steps,severity,status,triage_note,created_at,updated_at',workspace_id:`eq.${workspaceId}`,order:'created_at.desc',limit:'50',offset:String(page*50)});
 if(ownerId!==null)q.set('created_by',`eq.${ownerId}`);
 return select('fueltrans_issue_reports',q.toString());
}
export async function triageSharedIssue({workspaceId,id,expectedUpdatedAt,status,triageNote=''}){
 if(!UUID08.test(String(workspaceId))||!UUID08.test(String(id))||!Number.isFinite(Date.parse(expectedUpdatedAt))||!ISSUE_STATES08.has(status)||typeof triageNote!=='string'||triageNote.length>4000)throw Error('Invalid issue triage request.');
 const q=new URLSearchParams({select:'id,workspace_id,status,updated_at',workspace_id:`eq.${workspaceId}`,id:`eq.${id}`,updated_at:`eq.${expectedUpdatedAt}`});
 const {data}=await db('fueltrans_issue_reports',q.toString(),{method:'PATCH',body:{status,triage_note:triageNote},extra:{Prefer:'return=representation'}});
 if(!Array.isArray(data)||data.length!==1||data[0].workspace_id!==workspaceId||data[0].id!==id)throw Error('Issue changed or permission denied; refresh before retrying.');
 return data[0];
}
export async function readTrustedTicketHistory(workspaceId,ticketId,{page=0}={}){
 if(!UUID08.test(String(workspaceId))||!/^[a-z0-9][a-z0-9._:-]{0,119}$/i.test(String(ticketId))||!Number.isInteger(page)||page<0||page>10000)throw Error('Invalid history request.');
 const q=new URLSearchParams({select:'id,ticket_id,workspace_id,actor_user_id,event_type,before_state,after_state,recorded_at',workspace_id:`eq.${workspaceId}`,ticket_id:`eq.${ticketId}`,order:'id.desc',limit:'40',offset:String(page*40)});
 return select('fueltrans_ticket_events_v2',q.toString());
}

// Checkpoint 11: revalidate identity and active role against the database before a ticket mutation.
export async function readFreshFuelTransMembership(workspaceId,userId){
 if(!UUID08.test(String(workspaceId))||!UUID08.test(String(userId)))throw Error('Invalid membership identity.');
 const identity=await verifiedUser();
 if(!identity||identity.id!==userId)throw Error('Session identity changed. Sign in again.');
 const q=new URLSearchParams({select:'workspace_id,user_id,role,client_code,enabled,status,display_name,email',workspace_id:`eq.${workspaceId}`,user_id:`eq.${userId}`,enabled:'eq.true',status:'eq.active',limit:'1'});
 const rows=await select('fueltrans_memberships',q.toString());
 if(rows.length!==1||rows[0].user_id!==userId||rows[0].workspace_id!==workspaceId||rows[0].enabled!==true||rows[0].status!=='active')throw Error('Active FuelTrans membership is no longer available.');
 return rows[0];
}

// Private source CreateTicketTab draft, using a separate fixed state key and CAS revision.
export async function readTicketDraftState(workspaceId,userId){
 if(!UUID08.test(String(workspaceId))||!UUID08.test(String(userId)))throw Error('Invalid private ticket draft identity.');
 const s=await currentSession();if(!s||s.user.id!==userId)throw Error('Draft owner identity mismatch.');
 const q=new URLSearchParams({select:'value,revision',workspace_id:`eq.${workspaceId}`,user_id:`eq.${userId}`,state_key:'eq.standalone_ticket_draft_v1',limit:'1'});
 const rows=await select('fueltrans_user_state',q.toString());
 if(rows.length>1)throw Error('Unexpected duplicate private state.');return rows[0]??null;
}
export async function saveTicketDraftState(workspaceId,userId,revision,draft){
 if(!UUID08.test(String(workspaceId))||!UUID08.test(String(userId))||!Number.isSafeInteger(revision)||revision<0||
 (draft!==null&&(!draft||draft.schemaVersion!==1||typeof draft.savedAt!=='string'||!draft.form)))throw Error('Invalid ticket draft update.');
 const s=await currentSession();if(!s||s.user.id!==userId)throw Error('Draft owner identity mismatch.');
 const value={draft};
 if(revision===0){
  const body={workspace_id:workspaceId,user_id:userId,state_key:'standalone_ticket_draft_v1',revision:1,value};
  const {data}=await db('fueltrans_user_state','',{method:'POST',body,extra:{Prefer:'return=representation'}});
  if(!Array.isArray(data)||data.length!==1||data[0].revision!==1)throw Error('Private ticket draft creation not confirmed.');
  return data[0];
 }
 const q=new URLSearchParams({workspace_id:`eq.${workspaceId}`,user_id:`eq.${userId}`,state_key:'eq.standalone_ticket_draft_v1',revision:`eq.${revision}`,select:'revision,value'});
 const {data}=await db('fueltrans_user_state',q.toString(),{method:'PATCH',body:{revision:revision+1,value},extra:{Prefer:'return=representation'}});
 if(!Array.isArray(data)||data.length!==1||data[0].revision!==revision+1)throw Error('Ticket draft changed in another tab or write was denied. Refresh before saving.');
 return data[0];
}
export async function findActiveTicketDuplicates(scope){
 const {buildTicketDuplicateQuery,projectTicketDuplicates}=await import('./ticket-draft17.js');
 const q=buildTicketDuplicateQuery(scope);
 const rows=await select('fueltrans_tickets',q);
 return projectTicketDuplicates(rows,scope);
}
