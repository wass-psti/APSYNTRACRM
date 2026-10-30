/** Discover the signed user's authoritative active workspace and authorized board.
 * The CLI prints only workspace/board UUIDs; never the bearer token.
 */
import { pathToFileURL } from 'node:url';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '../../../frontend/config.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class AcceptanceBlocked extends Error{
 constructor(message){super(message);this.name='AcceptanceBlocked';}
}
export async function discoverScope({token,requestedWorkspaceId,requestedBoardId,writeRequested=false,
  url=SUPABASE_URL,key=SUPABASE_PUBLISHABLE_KEY,fetchImpl=fetch}={}){
 if(typeof token!=='string'||!token||/[\r\n]/.test(token))throw new AcceptanceBlocked('Missing or malformed access token.');
 const base=new URL(url);
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw new AcceptanceBlocked('Invalid Supabase URL.');
 async function call(path,body){
  let response;
  try{response=await fetchImpl(base.origin+path,{
   method:body===undefined?'GET':'POST',
   headers:{apikey:key,authorization:'Bearer '+token,accept:'application/json',
     ...(body===undefined?{}:{'content-type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),
   redirect:'error',signal:AbortSignal.timeout(15000)
  });}catch{throw new AcceptanceBlocked('Supabase connection failed.');}
  if(!response.ok)throw new AcceptanceBlocked('Supabase rejected '+path.split('?')[0]+' (HTTP '+response.status+').');
  try{return await response.json();}catch{throw new AcceptanceBlocked('Unexpected Supabase JSON response.');}
 }
 const me=await call('/auth/v1/user');
 if(!UUID.test(me?.id||''))throw new AcceptanceBlocked('Signed-user identity not verified.');
 const context=await call('/rest/v1/rpc/wm_auth_access_context',{});
 if(context?.user_id!==me.id||!UUID.test(context.workspace_id||'')||context.profile?.status!=='active')
  throw new AcceptanceBlocked('Authoritative active workspace context not available.');
 if(requestedWorkspaceId&&requestedWorkspaceId!==context.workspace_id)
  throw new AcceptanceBlocked('Requested workspace is not the active authenticated workspace.');
 const boards=await call('/rest/v1/rpc/wm_list_boards',{p_status:'active'});
 if(!Array.isArray(boards))throw new AcceptanceBlocked('Board-list API response is invalid.');
 const selected=requestedBoardId?boards.find(b=>b?.id===requestedBoardId):
   boards.find(b=>UUID.test(b?.id||''));
 if(!selected||!UUID.test(selected.id))throw new AcceptanceBlocked(
  requestedBoardId?'Requested board is not available in your active workspace.':'No accessible active board found.');
 const allowed=await call('/rest/v1/rpc/work_board_access',{
  p_board_id:selected.id,p_required:writeRequested?'edit':'view'
 });
 if(allowed!==true)throw new AcceptanceBlocked('Existing board authorization rejected the request.');
 return {userId:me.id,workspaceId:context.workspace_id,boardId:selected.id,boardName:selected.name||'Board'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.includes('--config')){
  process.stdout.write(SUPABASE_URL+'\n'+SUPABASE_PUBLISHABLE_KEY+'\n');
 }else{
  try{
   const result=await discoverScope({token:process.env.SUPABASE_ACCESS_TOKEN,
     requestedWorkspaceId:process.env.HULY_WORKSPACE_ID,
     requestedBoardId:process.env.HULY_BOARD_ID,
     writeRequested:process.env.SB07_WRITE_APPROVED==='yes'});
   process.stderr.write('PASS: signed user, active workspace and authorized board verified ('+result.boardName+').\n');
   process.stdout.write(result.workspaceId+' '+result.boardId+'\n');
  }catch(err){process.stderr.write('BLOCKED: '+err.message+'\n');process.exitCode=2;}
 }
}
