import {jwtSessionId} from './cp-frt-sec10-live-guards.mjs';

export class HttpStatusError extends Error {
 constructor(status){super('HTTP_STATUS_'+status);this.status=status;}
}
/** Real GoTrue password login and Data API. No tokens/credentials are logged. */
export class IsolatedSignedClient {
 constructor(config,fetcher=globalThis.fetch){
  if(typeof fetcher!=='function')throw Error('FETCH_REQUIRED');
  this.config=config;this.fetcher=fetcher;this.accessToken=null;
  this.identity=null;this.sessionProof=null;
 }
 async call(path,{body,method='POST',authorized=false}={}){
  const headers={'apikey':this.config.publishableKey,'Content-Type':'application/json'};
  if(authorized){
   if(!this.accessToken)throw Error('NO_SIGNED_SESSION');
   headers.Authorization='Bearer '+this.accessToken;
  }
  const response=await this.fetcher(this.config.url+path,{
   method,headers,redirect:'error',cache:'no-store',mode:'cors',
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  if(!response.ok)throw new HttpStatusError(response.status);
  return response.status===204?null:response.json();
 }
 async signIn(email,password){
  if(this.accessToken)throw Error('MUST_END_PRIOR_SESSION');
  const response=await this.call('/auth/v1/token?grant_type=password',{
   body:{email,password}
  });
  if(typeof response?.access_token!=='string')throw Error('SIGNED_TOKEN_MISSING');
  this.accessToken=response.access_token;
  const proof=jwtSessionId(this.accessToken);
  const user=await this.call('/auth/v1/user',{method:'GET',authorized:true});
  if(user?.id!==proof.userId){
   this.accessToken=null;throw Error('GOTRUE_IDENTITY_MISMATCH');
  }
  this.identity=user.id;this.sessionProof=proof;
  return {id:user.id,sessionId:proof.sessionId,issuedAt:proof.issuedAt};
 }
 rpc(name,args={}){
  if(!/^[a-z][a-z0-9_]{2,95}$/.test(name))throw Error('INVALID_RPC');
  return this.call('/rest/v1/rpc/'+name,{body:args,authorized:true});
 }
 async context(){
  const c=await this.rpc('wm_auth_access_context',{});
  if(c?.user_id!==this.identity||c?.profile?.status!=='active'||
     c?.workspace_id!==this.config.workspaceId)
    throw Error('ACTIVE_WORKSPACE_CONTEXT_MISMATCH');
  return c;
 }
 async self(){
  const s=await this.rpc('apsyntra_crm_my_effective_access',{});
  if(s?.workspaceId!==this.config.workspaceId||s?.schemaVersion!==1||
     typeof s.bootstrap!=='boolean'||!Array.isArray(s.boards)||
     !Array.isArray(s.modules)||!['admin','supervisor','employee','viewer'].includes(s.effectivePlatformRole))
    throw Error('INVALID_SIGNED_SELF_SNAPSHOT');
  return s;
 }
 async boardAllowed(permission){
  const x=await this.rpc('work_board_access',{
   p_board_id:this.config.boardId,p_required:permission});
  if(typeof x!=='boolean')throw Error('INVALID_BOARD_DECISION');
  return x;
 }
 async frtAllowed(){
  const x=await this.rpc('has_module_access',{
   p_module_id:'fund-released-tracker',p_user_id:this.identity});
  if(typeof x!=='boolean')throw Error('INVALID_FRT_DECISION');
  return x;
 }
 async endSession(){
  if(this.accessToken){
   try{await this.call('/auth/v1/logout',{authorized:true});}catch{/** Close locally even if expired. */}
  }
  this.accessToken=null;this.identity=null;this.sessionProof=null;
 }
}
