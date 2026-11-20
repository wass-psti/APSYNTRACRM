/**
 * ACCESS V2 REST TRANSPORT — STAGING CANDIDATE, NOT DEPLOYED.
 *
 * The verified end-user bearer is forwarded to GoTrue and PostgREST.
 * NO service-role token, role injection, auth claim forgery, direct table
 * writes, or client-declared System Admin status is accepted here.
 * Underlying signed RPCs + RLS must be deployed and independently tested
 * before enabling this Edge Function.
 *
 * Endpoint outline: see docs/ACCESS-MODEL-V2-API.md
 */
type Body=Record<string,unknown>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid=(x:unknown):x is string=>typeof x==='string'&&UUID.test(x);
const dataObject=(x:unknown):x is Body=>!!x&&typeof x==='object'&&!Array.isArray(x);
const safeText=(x:unknown,max=120)=>typeof x==='string'&&x.trim().length>0&&x.length<=max?x.trim():null;
const safeRev=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0?x:null;
const boardRoles=new Set(['viewer','editor']);
type Scope={workspaceId:string;actorId:string;token:string;apiUrl:string;apiKey:string};
class RouteError extends Error{constructor(readonly status:number,message:string){super(message);}}
const fail=(code:number,message:string):never=>{throw new RouteError(code,message);};
function cors(req:Request):Headers{
 const allowed=Deno.env.get('APSYNTRA_ALLOWED_ORIGIN')||'https://wass-psti.github.io';
 const origin=req.headers.get('origin');
 const headers=new Headers({'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store, max-age=0','pragma':'no-cache','vary':'Origin',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer'});
 if(origin===allowed){
  headers.set('access-control-allow-origin',allowed);
  headers.set('access-control-allow-methods','GET, POST, PATCH, DELETE, OPTIONS');
  headers.set('access-control-allow-headers','authorization,apikey,content-type');
 }
 return headers;
}
function response(req:Request,status:number,payload:unknown){
 return new Response(status===204?null:JSON.stringify(payload),{status,headers:cors(req)});
}
function config(){
 const url=Deno.env.get('SUPABASE_URL');
 const key=Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!/^https:\/\//.test(url)||!key)
  return fail(503,'Access service is not configured');
 return {url,key};
}
async function authenticate(req:Request):Promise<Omit<Scope,'workspaceId'>>{
 const auth=req.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9._-]{50,8192}$/.test(auth))
  return fail(401,'Authenticated session required');
 const token=auth.slice(7);
 const {url,key}=config();
 let res:Response;
 try{res=await fetch(new URL('/auth/v1/user',url),{headers:{
  authorization:auth,apikey:key},signal:AbortSignal.timeout(10000)});}
 catch{return fail(503,'Unable to verify authentication');}
 if(!res.ok)return fail(res.status===401||res.status===403?401:503,'Unable to verify authentication');
 let user:unknown;try{user=await res.json();}catch{return fail(503,'Unverified identity');}
 if(!dataObject(user)||!uuid(user.id)||user.is_anonymous===true||
   user.email_confirmed_at==null)return fail(403,'A verified account is required');
 return {actorId:user.id,token,apiUrl:url,apiKey:key};
}
async function input(req:Request):Promise<Body>{
 const length=Number(req.headers.get('content-length')||0);
 if(length>16384)return fail(413,'Payload too large');
 let txt='';
 try{txt=await req.text();}catch{return fail(400,'Invalid request body');}
 if(txt.length>16384)return fail(413,'Payload too large');
 try{
  const obj=txt?JSON.parse(txt):{};
  return dataObject(obj)?obj:fail(400,'JSON object expected');
 }catch{return fail(400,'Invalid JSON');}
}
function routeParts(req:Request){
 const path=new URL(req.url).pathname;
 const after=path.split('/access-v2')[1]||'';
 return after.split('/').filter(Boolean);
}
async function rpc(scope:Omit<Scope,'workspaceId'>,name:string,args:Body):Promise<unknown>{
 let result:Response;
 try{result=await fetch(new URL('/rest/v1/rpc/'+name,scope.apiUrl),{
  method:'POST',headers:{
   'content-type':'application/json','authorization':'Bearer '+scope.token,
   'apikey':scope.apiKey,'accept':'application/json'},
  body:JSON.stringify(args),signal:AbortSignal.timeout(14000)
 });}catch{return fail(503,'Authorization service temporarily unavailable');}
 const text=await result.text();
 let decoded:any;try{decoded=JSON.parse(text);}catch{decoded=null;}
 if(!result.ok){
  const sqlState=decoded?.code;
  if(sqlState==='PGRST202')return fail(503,'Required signed role service is not activated');
  if(sqlState==='PT409'||result.status===409)return fail(409,'Role data changed. Refresh and retry');
  if(sqlState==='42501'||result.status===403)return fail(403,'Permission denied');
  if(result.status===404)return fail(404,'Resource not found');
  if(sqlState==='22P02'||sqlState==='22023')return fail(400,'Invalid role request');
  return fail(503,'Role service rejected the request');
 }
 return decoded;
}
const workspace=(req:Request,body:Body)=>{
 const value=body.workspaceId||new URL(req.url).searchParams.get('workspaceId');
 return uuid(value)?value:fail(400,'workspaceId is required');
};
const teamChange=(body:Body,workspaceId:string,action:string,teamId:string|null=null)=>{
 const revision=safeRev(body.expectedRevision);
 if(revision===null)return fail(409,'Signed workspace revision required');
 const target=body.userId;
 return {p_workspace_id:workspaceId,p_action:action,p_team_id:teamId,
  p_target_user_id:uuid(target)?target:null,
  p_destination_team_id:uuid(body.destinationTeamId)?body.destinationTeamId:null,
  p_name:safeText(body.name,100),
  p_content_type:body.contentType==='board'?'board':null,
  p_content_id:uuid(body.contentId)?body.contentId:null,
  p_access_level:boardRoles.has(body.accessLevel as string)?body.accessLevel:null,
  p_asset_url:null,p_expected_revision:revision};
};
async function route(req:Request,scope:Omit<Scope,'workspaceId'>,body:Body){
 const parts=routeParts(req),verb=req.method,workspaceId=workspace(req,body);
 const result=(name:string,args:Body)=>rpc(scope,name,args);
 if(parts[0]==='teams'){
  if(parts.length===1&&verb==='GET')
   return result('apsyntra_teams_snapshot',{p_workspace_id:workspaceId});
  if(parts.length===1&&verb==='POST')
   return result('apsyntra_teams_change',teamChange(body,workspaceId,'create'));
  const teamId=parts[1];
  if(!uuid(teamId))return fail(404,'Team not found');
  if(parts.length===2&&verb==='PATCH')
   return result('apsyntra_teams_change',teamChange(body,workspaceId,'rename',teamId));
  if(parts.length===2&&verb==='DELETE')
   return result('apsyntra_teams_change',teamChange(body,workspaceId,'delete',teamId));
  if(parts[2]==='members'&&parts.length===3&&verb==='POST')
   return result('apsyntra_teams_change',teamChange(body,workspaceId,'add_member',teamId));
  if(parts[2]==='members'&&parts.length===4&&uuid(parts[3])){
   const userId=parts[3];
   if(verb==='DELETE')return result('apsyntra_teams_change',teamChange({...body,userId},workspaceId,'remove_member',teamId));
   if(verb==='PATCH'&&body.operation==='move')
    return result('apsyntra_teams_change',teamChange({...body,userId},workspaceId,'move_member',teamId));
   if(verb==='PATCH'&&body.operation==='add_other_team')
    return result('apsyntra_teams_change',teamChange({...body,userId},workspaceId,'add_other_team',teamId));
   if(verb==='PATCH'&&(body.operation==='make_owner'||body.operation==='remove_owner'))
    return result('apsyntra_teams_change',teamChange({...body,userId},workspaceId,body.operation as string,teamId));
  }
  if(parts[2]==='board-access'&&verb==='POST')
   return result('apsyntra_teams_change',teamChange({...body,contentType:'board'},workspaceId,'assign_content',teamId));
  if(parts[2]==='board-access'&&parts.length===4&&uuid(parts[3])&&verb==='PATCH')
   return result('apsyntra_teams_change',teamChange({...body,contentType:'board',contentId:parts[3]},workspaceId,'set_content_role',teamId));
  return fail(404,'Unknown team operation');
 }
 if(parts[0]==='boards'&&uuid(parts[1])){
  const boardId=parts[1];
  if(parts.length===3&&parts[2]==='access'&&verb==='GET')
   return result('apsyntra_access_board_snapshot_v2',{p_workspace_id:workspaceId,p_board_id:boardId});
  if(parts[2]==='teams'&&verb==='GET')
   return result('apsyntra_board_team_invite_candidates',{
    p_workspace_id:workspaceId,p_board_id:boardId,
    p_query:new URL(req.url).searchParams.get('q')||''});
  if(parts[2]==='teams'&&verb==='POST'){
   if(!uuid(body.teamId)||body.role!=='viewer'||safeRev(body.expectedRevision)===null)
    return fail(400,'Signed team Viewer invitation expected');
   return result('apsyntra_board_invite_team_viewer',{
    p_workspace_id:workspaceId,p_board_id:boardId,
    p_team_id:body.teamId,p_expected_revision:body.expectedRevision});
  }
  if(parts[2]==='people'&&['POST','PATCH','DELETE'].includes(verb))
   return fail(503,'Signed direct-user Viewer/Editor mutation cutover not activated');
 }
 if(parts[0]==='apps'){
  const key=parts[1];
  if(!safeText(key,64)||!/^[-a-z0-9]+$/.test(key))return fail(404,'Unknown application');
  if(parts[2]==='roles'&&parts.length===3&&verb==='GET')
   return result('apsyntra_access_app_roles_snapshot_v2',{
    p_workspace_id:workspaceId,p_app_key:key});
  if(parts[2]==='roles'&&['POST','PATCH','DELETE'].includes(verb))
   return result('apsyntra_access_app_roles_change_v2',{
    p_workspace_id:workspaceId,p_app_key:key,
    p_action:body.action,p_role_id:uuid(body.roleId)?body.roleId:null,
    p_name:safeText(body.name,100),p_description:safeText(body.description,500),
    p_capability_patch:dataObject(body.capabilities)?body.capabilities:null,
    p_target_user_id:uuid(body.userId)?body.userId:null,
    p_expected_revision:safeRev(body.expectedRevision)});
 }
 if(parts[0]==='system-admin'&&parts[1]==='grants'&&['POST','DELETE'].includes(verb)){
  if(!uuid(body.teamId)||!uuid(body.userId))return fail(400,'Target team and user required');
  return result('apsyntra_teams_change',
   teamChange(body,workspaceId,verb==='POST'?'grant_admin':'revoke_admin',body.teamId));
 }
 if(parts[0]==='audit'&&verb==='GET')
  return result('apsyntra_access_audit_snapshot_v2',{
   p_workspace_id:workspaceId,p_after:new URL(req.url).searchParams.get('after'),
   p_limit:Math.min(100,Math.max(1,Number(new URL(req.url).searchParams.get('limit')||50)))});
 return fail(404,'Access endpoint not found');
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return response(req,204,null);
 try{
  if(!['GET','POST','PATCH','DELETE'].includes(req.method))
   return fail(405,'Method not allowed');
  // The transport is not activated automatically on deployment.
  if(Deno.env.get('APSYNTRA_ACCESS_V2_ENABLED')!=='true')
   return fail(503,'Access V2 is not activated');
  const origin=req.headers.get('origin');
  const allowed=Deno.env.get('APSYNTRA_ALLOWED_ORIGIN')||'https://wass-psti.github.io';
  if(origin&&origin!==allowed)return fail(403,'Origin not allowed');
  const actor=await authenticate(req);
  const body=req.method==='GET'?{}:await input(req);
  const data=await route(req,actor,body);
  return response(req,200,{ok:true,data});
 }catch(error){
  const code=error instanceof RouteError?error.status:503;
  const message=error instanceof RouteError?error.message:'Access service unavailable';
  return response(req,code,{ok:false,error:{code,message}});
 }
});
