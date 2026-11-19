import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';

const STORE_KEY='apsyntra.crm.auth.v1';
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export class ApiError extends Error {
  constructor(message,status=0,code=''){ super(message);this.name='ApiError';this.status=status;this.code=code; }
}
export class AuthClient {
  constructor({fetchImpl=globalThis.fetch?.bind(globalThis),storage=globalThis.sessionStorage,
    clock=()=>Date.now(),requestTimeoutMs=12000,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
    random=Math.random,maxReadRetries=1,retryBaseDelayMs=250}={}){
    this.fetchImpl=fetchImpl;this.storage=storage;this.clock=clock;this.session=null;
    this.refreshing=null;this.verifiedUserPending=null;this.onExpired=()=>{};
    this.wait=wait;this.random=random;
    this.maxReadRetries=Number.isInteger(maxReadRetries)&&maxReadRetries>=0&&maxReadRetries<=2?maxReadRetries:1;
    this.retryBaseDelayMs=Number.isInteger(retryBaseDelayMs)&&retryBaseDelayMs>=0&&retryBaseDelayMs<=2000?retryBaseDelayMs:250;
    this.requestTimeoutMs=Number.isInteger(requestTimeoutMs)&&requestTimeoutMs>=10&&requestTimeoutMs<=30000?
      requestTimeoutMs:12000;
  }
  get isSignedIn(){return !!this.session?.access_token;}
  get userId(){return this.session?.user?.id??null;}
  get accessToken(){return this.session?.access_token??null;}
  save(session){
    if(!isObject(session)||typeof session.access_token!=='string'||typeof session.refresh_token!=='string'
       ||!isObject(session.user)||typeof session.user.id!=='string')throw new ApiError('Invalid authentication response');
    this.session={access_token:session.access_token,refresh_token:session.refresh_token,
      expires_at:this.clock()+(Number(session.expires_in)||3600)*1000,user:session.user};
    this.storage?.setItem(STORE_KEY,JSON.stringify(this.session));
  }
  clear(){this.session=null;this.verifiedUserPending=null;this.storage?.removeItem(STORE_KEY);}
  async call(path,{method='GET',body,accessToken,signal,readTimeoutMs,requestKind='unknown'}={}){
    if(signal?.aborted)throw new ApiError('Request was cancelled.',0,'REQUEST_ABORTED');
    const controller=new AbortController();
    const abort=()=>controller.abort();
    signal?.addEventListener('abort',abort,{once:true});
    let deadlineId,timedOut=false,timeoutError=null,phase='request';
    const timeoutMs=method==='POST'&&
      /^\/rest\/v1\/rpc\/(?:wm_get_board_shell|wm_get_board_items_page|wm_import_extended_refs_read)$/.test(path)&&
      Number.isInteger(readTimeoutMs)&&readTimeoutMs>=this.requestTimeoutMs&&readTimeoutMs<=30000?
      readTimeoutMs:this.requestTimeoutMs;
    const deadline=new Promise((_,reject)=>{
      deadlineId=setTimeout(()=>{
        timedOut=true;
        const message=requestKind==='read'?
          'The service read exceeded its response deadline.':
          'The service did not confirm this request before its response deadline. Verify any change before retrying.';
        timeoutError=new ApiError(message,0,'REQUEST_TIMEOUT');
        timeoutError.phase=phase;
        timeoutError.mayHaveCommitted=method!=='GET'&&requestKind!=='read';
        controller.abort();
        reject(timeoutError);
      },timeoutMs);
    });
    try{
      // Keep authenticated GETs and mutations out of the browser HTTP cache.
      // Explicitly allowlisted read-only REST RPC POSTs use the default fetch
      // cache mode so Chromium can reuse the independent CORS preflight cache
      // (Access-Control-Max-Age: 3600). POST responses are not HTTP-cacheable
      // without explicit freshness and Content-Location response metadata.
      const reusePreflightCache=method==='POST'&&requestKind==='read'&&
        path.startsWith('/rest/v1/rpc/');
      const response=await Promise.race([this.fetchImpl(SUPABASE_URL+path,{
        method,mode:'cors',redirect:'error',cache:reusePreflightCache?'default':'no-store',
        headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',
           ...(accessToken?{Authorization:'Bearer '+accessToken}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        signal:controller.signal
      }),deadline]);
      if(signal?.aborted)throw new ApiError('Request was cancelled.',0,'REQUEST_ABORTED');
      let data=null,raw='';
      try{
        phase='response-body';
        const bodyPromise=typeof response.text==='function'?
          response.text():Promise.resolve(response.json()).then(value=>JSON.stringify(value));
        raw=await Promise.race([bodyPromise,deadline]);
      }catch(error){
        if(error?.code==='REQUEST_TIMEOUT'||timedOut||error?.code==='REQUEST_ABORTED'||error instanceof ApiError)throw error;
        if(response.ok){
          const interrupted=new ApiError(
            requestKind==='read'?
              'The network connection was interrupted while receiving the service response.':
              'The connection was interrupted before the service confirmed the result. Verify any change before retrying.',
            0,'NETWORK_UNAVAILABLE');
          interrupted.phase='response-body';
          interrupted.mayHaveCommitted=method!=='GET'&&requestKind!=='read';
          interrupted.cause=error;
          throw interrupted;
        }
        raw='';
      }
      if(signal?.aborted)throw new ApiError('Request was cancelled.',0,'REQUEST_ABORTED');
      if(typeof raw==='string'&&raw.trim()){
        try{data=JSON.parse(raw);}
        catch(cause){
          if(response.ok){
            const invalid=new ApiError(
              'The service returned an invalid JSON response.',
              response.status,'INVALID_JSON_RESPONSE');
            invalid.cause=cause;
            throw invalid;
          }
        }
      }
      if(!response.ok){
        const errorMessage=isObject(data)?(data.msg||data.message||data.error_description||data.error):null;
        const error=new ApiError(typeof errorMessage==='string'?errorMessage:'Request failed ('+response.status+')',
          response.status,isObject(data)?String(data.code||data.error_code||''):'');
        const retryAfter=response.headers?.get?.('Retry-After');
        if(retryAfter){
          const seconds=Number(retryAfter);
          const dateMs=Number.isFinite(seconds)?seconds*1000:Date.parse(retryAfter)-this.clock();
          if(Number.isFinite(dateMs)&&dateMs>=0)error.retryAfterMs=Math.min(5000,dateMs);
        }
        throw error;
      }
      return data;
    }catch(error){
      if(error instanceof ApiError)throw error;
      if(timedOut)throw timeoutError||new ApiError('The service did not respond before its response deadline.',0,'REQUEST_TIMEOUT');
      if(signal?.aborted)throw new ApiError('Request was cancelled.',0,'REQUEST_ABORTED');
      const unavailable=new ApiError(requestKind==='read'?
        'Network unavailable. Verify your internet connection and retry.':
        'The connection was interrupted before the service confirmed the result. Verify any change before retrying.',
        0,'NETWORK_UNAVAILABLE');
      unavailable.phase=phase;
      unavailable.mayHaveCommitted=method!=='GET'&&requestKind!=='read';
      throw unavailable;
    }finally{
      clearTimeout(deadlineId);
      signal?.removeEventListener('abort',abort);
    }
  }
  async signIn(email,password){
    if(!email?.trim()||!password)throw new ApiError('Enter your email and password.');
    const data=await this.call('/auth/v1/token?grant_type=password',{
      method:'POST',body:{email:email.trim(),password}
    });
    this.save(data);
    try{await this.getVerifiedUser();}
    catch(err){
      // Bad credentials/revoked tokens invalidate a session. An offline or
      // timed-out *verification* does not revoke the freshly issued tokens.
      if([400,401,403].includes(err?.status))this.clear();
      throw err;
    }
    return this.session.user;
  }
  async getVerifiedUser(){
    if(!this.session)throw new ApiError('You are not signed in.',401);
    const token=await this.token();
    const expectedUserId=this.session?.user?.id;
    if(!this.session||typeof expectedUserId!=='string')
      throw new ApiError('Session changed during verification.',401,'SESSION_CHANGED');
    const key=expectedUserId+':'+token;
    if(this.verifiedUserPending?.key===key)return this.verifiedUserPending.promise;
    const pending=(async()=>{
      const data=await this.call('/auth/v1/user',{accessToken:token,requestKind:'read'});
      if(!this.session||this.session.user?.id!==expectedUserId)
        throw new ApiError('Session changed during verification.',401,'SESSION_CHANGED');
      if(!isObject(data)||typeof data.id!=='string'||data.id!==expectedUserId){
        this.clear();throw new ApiError('Session verification failed.',401);
      }
      // Server-side identity has already been verified. Persisting updated
      // profile metadata is a best-effort cache update, not a new auth gate.
      this.session.user=data;
      try{this.storage?.setItem(STORE_KEY,JSON.stringify(this.session));}
      catch{/* In-memory identity remains verified for the current tab. */}
      return data;
    })();
    const entry={key,promise:pending};
    this.verifiedUserPending=entry;
    try{return await pending;}
    finally{if(this.verifiedUserPending===entry)this.verifiedUserPending=null;}
  }
  async restore(){
    const raw=this.storage?.getItem(STORE_KEY);
    if(!raw)return false;
    let previous;
    try{
      previous=JSON.parse(raw);
      if(!isObject(previous)||!isObject(previous.user)
         ||typeof previous.user.id!=='string'
         ||typeof previous.access_token!=='string'||typeof previous.refresh_token!=='string'
         ||!Number.isFinite(previous.expires_at))throw Error('invalid');
    }catch{this.clear();return false;}
    this.session=previous;
    try{
      await this.getVerifiedUser();return true;
    }catch(error){
      if([400,401,403].includes(error?.status)){
        this.clear();return false;
      }
      // Network outage, timeouts, 5xx and 429 are indeterminate; preserve the
      // original secure session for an explicit same-page recovery attempt.
      throw error;
    }
  }
  async refresh(){
    if(!this.session)throw new ApiError('Session expired.',401);
    if(this.refreshing)return this.refreshing;
    this.refreshing=(async()=>{
      const prev=this.session;
      try{
        const next=await this.call('/auth/v1/token?grant_type=refresh_token',{
          method:'POST',body:{refresh_token:prev.refresh_token}
        });
        this.save(next);return this.session.access_token;
      }catch(err){
        if(err.status===400||err.status===401||err.status===403){
          this.clear();this.onExpired();
        }
        throw err;
      }
    })().finally(()=>{this.refreshing=null;});
    return this.refreshing;
  }
  async token(){
    if(!this.session)throw new ApiError('Please sign in to continue.',401);
    if(this.session.expires_at<=this.clock()+60000)return this.refresh();
    return this.session.access_token;
  }
  async authorized(path,options={}){
    const {retryUnauthorized=true,retryableRead=false,...requestOptions}=options;
    let token=await this.token(),unauthorizedRetried=false,readRetries=0;
    while(true){
      try{
        return await this.call(path,{...requestOptions,accessToken:token,
          requestKind:requestOptions.requestKind||(retryableRead?'read':'unknown')});
      }catch(error){
        if(error?.status===401&&retryUnauthorized&&!unauthorizedRetried){
          token=await this.refresh();
          unauthorizedRetried=true;
          continue;
        }
        const transient=error?.code==='NETWORK_UNAVAILABLE'||error?.code==='REQUEST_TIMEOUT'||
          [408,429,502,503,504,520].includes(error?.status);
        if(!retryableRead||!transient||readRetries>=this.maxReadRetries||
           requestOptions.signal?.aborted){
          if(readRetries>0)error.retryAttempts=readRetries;
          throw error;
        }
        readRetries++;
        const base=Math.min(1500,this.retryBaseDelayMs*2**(readRetries-1));
        const randomValue=Number(this.random());
        const jitter=Math.round(base*0.5*(Number.isFinite(randomValue)?Math.max(0,Math.min(1,randomValue)):0));
        const retryAfterMs=Number(error?.retryAfterMs);
        const delay=Number.isFinite(retryAfterMs)&&retryAfterMs>0?
          Math.max(base+jitter,retryAfterMs):error?.status===429?Math.max(1000,base+jitter):base+jitter;
        await this.wait(delay);
        if(requestOptions.signal?.aborted)
          throw new ApiError('Request was cancelled.',0,'REQUEST_ABORTED');
      }
    }
  }
  async signOut({scope='global'}={}){
    if(scope!=='global'&&scope!=='local')throw new ApiError('Unsupported sign-out scope.');
    const token=this.session?.access_token;
    let serverAcknowledged=false;
    try{
      if(token){
        await this.call('/auth/v1/logout'+(scope==='local'?'?scope=local':''),{
          method:'POST',accessToken:token
        });
        serverAcknowledged=true;
      }
    }catch{/* Always end the local session even if the network is unavailable. */}
    finally{this.clear();}
    return serverAcknowledged;
  }
  async changePassword(newPassword){
    if(!this.isSignedIn)throw new ApiError('Please sign in to continue.',401);
    if(typeof newPassword!=='string'||newPassword.length<12||newPassword.length>72)
      throw new ApiError('Use a password between 12 and 72 characters.',400);
    await this.authorized('/auth/v1/user',{method:'PUT',body:{password:newPassword}});
    return true;
  }
  async passwordRecovery(email,redirectTo){
    const redirect=new URL(redirectTo);
    const path='/auth/v1/recover?redirect_to='+encodeURIComponent(redirect.href);
    return this.call(path,{method:'POST',body:{email:email.trim()}});
  }
  /** Access-token export is only an explicit user action; never log or render tokens. */
  copyAccessToken(){return this.token();}
}
export {STORE_KEY};
