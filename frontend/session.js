import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';

const STORE_KEY='apsyntra.crm.auth.v1';
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export class ApiError extends Error {
  constructor(message,status=0,code=''){ super(message);this.name='ApiError';this.status=status;this.code=code; }
}
export class AuthClient {
  constructor({fetchImpl=globalThis.fetch?.bind(globalThis),storage=globalThis.sessionStorage,
    clock=()=>Date.now(),requestTimeoutMs=12000}={}){
    this.fetchImpl=fetchImpl;this.storage=storage;this.clock=clock;this.session=null;this.refreshing=null;this.onExpired=()=>{};
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
  clear(){this.session=null;this.storage?.removeItem(STORE_KEY);}
  async call(path,{method='GET',body,accessToken,signal}={}){
    if(signal?.aborted)throw new ApiError('Request timed out before confirmation.',0,'REQUEST_TIMEOUT');
    const controller=new AbortController();
    const abort=()=>controller.abort();
    signal?.addEventListener('abort',abort,{once:true});
    let deadlineId,timedOut=false;
    // Bound both network and body parsing. A hung provider or non-abortable
    // response cannot leave the startup auth/workspace gate unresolved forever.
    const deadline=new Promise((_,reject)=>{
      deadlineId=setTimeout(()=>{
        timedOut=true;controller.abort();
        reject(new ApiError('The service did not respond. Check your connection and retry.',0,'REQUEST_TIMEOUT'));
      },this.requestTimeoutMs);
    });
    try{
      const response=await Promise.race([this.fetchImpl(SUPABASE_URL+path,{
        method,mode:'cors',redirect:'error',cache:'no-store',
        headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',
           ...(accessToken?{Authorization:'Bearer '+accessToken}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        signal:controller.signal
      }),deadline]);
      let data=null;
      try{
        // Read the body once as text so a malformed successful response is
        // distinguishable from an empty/204 response. Previously response.json()
        // failures were silently converted to null, hiding the original token
        // error from atomic import receipt handling.
        const bodyPromise=typeof response.text==='function'?
          response.text():Promise.resolve(response.json()).then(value=>JSON.stringify(value));
        const raw=await Promise.race([bodyPromise,deadline]);
        if(typeof raw==='string'&&raw.trim()){
          try{data=JSON.parse(raw);}
          catch(cause){
            if(response.ok){
              const error=new ApiError(
                'The service returned an invalid JSON response.',
                response.status,'INVALID_JSON_RESPONSE');
              error.cause=cause;
              throw error;
            }
          }
        }
      }catch(error){
        if(error?.code==='REQUEST_TIMEOUT'||timedOut)throw error;
        if(error instanceof ApiError)throw error;
        if(response.ok){
          const invalid=new ApiError(
            'The service returned an invalid JSON response.',
            response.status,'INVALID_JSON_RESPONSE');
          invalid.cause=error;
          throw invalid;
        }
        data=null;
      }
      if(!response.ok){
        const errorMessage=isObject(data)?(data.msg||data.message||data.error_description||data.error):null;
        throw new ApiError(typeof errorMessage==='string'?errorMessage:'Request failed ('+response.status+')',
          response.status,isObject(data)?String(data.code||data.error_code||''):'');
      }
      return data;
    }catch(error){
      if(error instanceof ApiError)throw error;
      if(timedOut)throw new ApiError('The service did not respond. Check your connection and retry.',0,'REQUEST_TIMEOUT');
      if(signal?.aborted)throw new ApiError('Request was cancelled.',0,'REQUEST_ABORTED');
      throw new ApiError('Network unavailable. Verify your internet connection and retry.',0,'NETWORK_UNAVAILABLE');
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
    const data=await this.call('/auth/v1/user',{accessToken:await this.token()});
    if(!isObject(data)||typeof data.id!=='string'||data.id!==this.session.user.id){
      this.clear();throw new ApiError('Session verification failed.',401);
    }
    this.session.user=data;this.storage?.setItem(STORE_KEY,JSON.stringify(this.session));
    return data;
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
    const {retryUnauthorized=true,...requestOptions}=options;
    const token=await this.token();
    try{return await this.call(path,{...requestOptions,accessToken:token});}
    catch(err){
      if(err.status!==401||!retryUnauthorized)throw err;
      const renewed=await this.refresh();
      return this.call(path,{...requestOptions,accessToken:renewed});
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
