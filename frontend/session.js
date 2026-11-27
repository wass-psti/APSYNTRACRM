import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
import {GoTrueClient} from './vendor/supabase-auth.js';
import {classifyAuthFailure} from './auth/failure-classification.js';

const STORE_KEY='apsyntra.crm.auth.v1';
const MIGRATION_KEY='apsyntra.crm.auth.migration.v1';
const VERIFIED_USER_CACHE_TTL_MS=30000;
const PROVIDER_SESSION_REFRESH_MARGIN_MS=90000;
const PROVIDER_SESSION_CHECK_INTERVAL_MS=30000;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validProviderSession=value=>isObject(value)&&
  typeof value.access_token==='string'&&value.access_token.length>0&&
  typeof value.refresh_token==='string'&&value.refresh_token.length>0&&
  Number.isFinite(Number(value.expires_at));
const browserSessionStorage=()=>{
  try{return globalThis.sessionStorage??null;}
  catch{return null;}
};
const browserLocalStorage=()=>{
  try{return globalThis.localStorage??null;}
  catch{return null;}
};
const providerError=(error,operation='request')=>{
  const failure=classifyAuthFailure(error,{operation});
  const normalized=new ApiError(
    typeof error?.message==='string'?error.message:'Authentication request failed.',
    Number.isInteger(error?.status)?error.status:0,
    typeof error?.code==='string'&&error.code?error.code:failure.code
  );
  normalized.providerErrorName=error?.providerErrorName||error?.name||'';
  normalized.failureClassification=failure;
  normalized.failureOperation=operation;
  if(Number.isFinite(Number(error?.retryAfterMs))&&Number(error.retryAfterMs)>=0)
    normalized.retryAfterMs=Number(error.retryAfterMs);
  return normalized;
};
const validLegacySession=value=>isObject(value)&&isObject(value.user)&&
  typeof value.user.id==='string'&&typeof value.access_token==='string'&&
  typeof value.refresh_token==='string'&&Number.isFinite(value.expires_at);
export class ApiError extends Error {
  constructor(message,status=0,code=''){ super(message);this.name='ApiError';this.status=status;this.code=code; }
}
export class AuthClient {
  constructor(options={}){
    const {fetchImpl=globalThis.fetch?.bind(globalThis),storage=browserSessionStorage(),
      clock=()=>Date.now(),requestTimeoutMs=12000,
      wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
      random=Math.random,maxReadRetries=1,retryBaseDelayMs=250}=options;
    this.fetchImpl=fetchImpl;this.storage=storage;this.clock=clock;this.session=null;
    this.refreshing=null;this.verifiedUserPending=null;this.verifiedUserCache=null;
    this.verifiedUserRevision=0;this.restorePending=null;
    this.providerSessionReadAt=null;this.providerSessionReadPending=null;
    this.onExpired=()=>{};this.onSessionChange=()=>{};
    this.wait=wait;this.random=random;
    this.maxReadRetries=Number.isInteger(maxReadRetries)&&maxReadRetries>=0&&maxReadRetries<=2?maxReadRetries:1;
    this.retryBaseDelayMs=Number.isInteger(retryBaseDelayMs)&&retryBaseDelayMs>=0&&retryBaseDelayMs<=2000?retryBaseDelayMs:250;
    this.requestTimeoutMs=Number.isInteger(requestTimeoutMs)&&requestTimeoutMs>=10&&requestTimeoutMs<=30000?
      requestTimeoutMs:12000;
    this.provider=options.provider||null;
    this.providerMode=!!this.provider||options.providerMode===true||
      (Object.keys(options).length===0&&typeof globalThis.window!=='undefined');
    this.legacyStorage=options.legacyStorage??browserSessionStorage();
    this.signInInProgress=false;this.signOutInProgress=false;
    this.ignoreProviderSessionEvents=false;
    if(this.providerMode)this.storage=options.storage??browserLocalStorage();
    if(this.providerMode&&!this.provider){
      this.provider=new GoTrueClient({
        url:SUPABASE_URL+'/auth/v1',
        headers:{apikey:SUPABASE_PUBLISHABLE_KEY},
        storageKey:STORE_KEY,
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:false,
        fetch:this.fetchImpl
      });
    }
    if(this.provider){
      this.providerSubscription=this.provider.onAuthStateChange((event,session)=>{
        this.receiveProviderEvent(event,session);
      });
    }
  }
  get isSignedIn(){return !!this.session?.access_token;}
  get userId(){return this.session?.user?.id??null;}
  get accessToken(){return this.session?.access_token??null;}
  legacyMigrationComplete(){
    try{return this.storage?.getItem(MIGRATION_KEY)==='1';}catch{return false;}
  }
  markLegacyMigrationComplete(){
    try{this.storage?.setItem(MIGRATION_KEY,'1');}catch{}
    try{this.legacyStorage?.removeItem(STORE_KEY);}catch{}
  }
  invalidateVerifiedUser(){
    this.verifiedUserCache=null;
    this.verifiedUserPending=null;
    this.verifiedUserRevision++;
  }
  handleAuthFailure(error,operation){
    const failure=error?.failureClassification&&error.failureOperation===operation?
      error.failureClassification:classifyAuthFailure(error,{operation});
    if(failure.invalidateSession)this.expireSession();
    return failure;
  }
  expireSession(){
    if(!this.session)return false;
    this.clear();
    this.onExpired();
    return true;
  }
  receiveProviderEvent(event,session){
    if(this.ignoreProviderSessionEvents||event==='INITIAL_SESSION')return;
    const previous=this.session;
    this.session=session||null;
    this.providerSessionReadAt=null;
    this.invalidateVerifiedUser();
    if(event==='SIGNED_OUT'){
      this.markLegacyMigrationComplete();
      if(previous&&!this.signOutInProgress&&!this.signInInProgress)this.onExpired();
      return;
    }
    if(this.signInInProgress)return;
    if(event==='TOKEN_REFRESHED'){
      this.onSessionChange(event,session,previous);
      return;
    }
    if(event!=='SIGNED_IN')return;
    const previousUser=previous?.user?.id||null;
    const nextUser=session?.user?.id||null;
    if(previousUser&&nextUser&&previousUser!==nextUser)this.onExpired();
    this.onSessionChange(event,session,previous);
  }
  async restoreProvider(){
    this.ignoreProviderSessionEvents=false;
    let result;
    try{result=await this.provider.getSession();}
    catch(error){
      const normalized=providerError(error,'session-read');
      const failure=this.handleAuthFailure(normalized,'session-read');
      if(failure.invalidateSession&&!this.session)return false;
      throw normalized;
    }
    if(result?.error){
      const normalized=providerError(result.error,'session-read');
      const failure=this.handleAuthFailure(normalized,'session-read');
      if(failure.invalidateSession&&!this.session)return false;
      throw normalized;
    }
    if(!isObject(result)||!isObject(result.data))
      throw new ApiError('Authentication provider returned an incomplete session response.',500,'AUTH_RESPONSE_INVALID');
    let session=result.data.session||null;
    if(session&&!validProviderSession(session))
      throw new ApiError('Authentication provider returned an incomplete session.',500,'AUTH_RESPONSE_INVALID');
    if(!session){
      if(this.session)this.expireSession();
      else this.session=null;
    }else{
      this.session=session;
      this.invalidateVerifiedUser();
    }
    let migrated=false;
    let migratedUser=null;
    if(!session){
      if(this.legacyMigrationComplete()){
        try{this.legacyStorage?.removeItem(STORE_KEY);}catch{}
        return false;
      }
      let raw=null;
      try{raw=this.legacyStorage?.getItem(STORE_KEY)||null;}catch{}
      if(raw){
        let legacy=null;
        try{legacy=JSON.parse(raw);}catch{}
        if(!validLegacySession(legacy)){
          this.markLegacyMigrationComplete();
          return false;
        }
        let imported;
        try{
          imported=await this.provider.setSession({
            access_token:legacy.access_token,refresh_token:legacy.refresh_token
          });
        }catch(error){
          const normalized=providerError(error,'legacy-import');
          const failure=this.handleAuthFailure(normalized,'legacy-import');
          if(failure.invalidateSession){
            this.markLegacyMigrationComplete();
            return false;
          }
          throw normalized;
        }
        if(imported?.error){
          const normalized=providerError(imported.error,'legacy-import');
          const failure=this.handleAuthFailure(normalized,'legacy-import');
          if(failure.invalidateSession){
            this.markLegacyMigrationComplete();
            return false;
          }
          throw normalized;
        }
        session=imported.data?.session||null;
        migratedUser=imported.data?.user||null;
        if(session&&!validProviderSession(session))
          throw new ApiError('Authentication provider returned an incomplete migrated session.',500,'AUTH_RESPONSE_INVALID');
        migrated=!!session;
        if(!session){
          this.markLegacyMigrationComplete();
          return false;
        }
        this.session=session;
        this.invalidateVerifiedUser();
      }
    }
    if(!session){this.session=null;return false;}
    this.session=session;
    try{
      if(migrated&&migratedUser){
        this.session={...session,user:migratedUser};
      }else{
        await this.getVerifiedUser();
      }
      this.markLegacyMigrationComplete();
      return true;
    }catch(error){
      const failure=this.handleAuthFailure(error,'identity');
      if(failure.invalidateSession){
        this.markLegacyMigrationComplete();
        return false;
      }
      throw error;
    }
  }
  save(session){
    if(this.provider){
      if(!isObject(session)||typeof session.access_token!=='string'||
         typeof session.refresh_token!=='string')throw new ApiError('Invalid authentication response');
      const pending=this.provider.setSession({
        access_token:session.access_token,refresh_token:session.refresh_token
      }).then(result=>{
        if(result.error)throw providerError(result.error);
        this.session=result.data?.session||null;
        this.invalidateVerifiedUser();
        this.providerSessionReadAt=null;
        return this.session;
      });
      this.providerSavePending=pending;
      return pending;
    }
    if(!isObject(session)||typeof session.access_token!=='string'||typeof session.refresh_token!=='string'
       ||!isObject(session.user)||typeof session.user.id!=='string')throw new ApiError('Invalid authentication response');
    this.session={access_token:session.access_token,refresh_token:session.refresh_token,
      expires_at:this.clock()+(Number(session.expires_in)||3600)*1000,user:session.user};
    this.invalidateVerifiedUser();
    // Browser storage is persistence, not the authentication authority. Keep
    // the verified in-memory session usable if storage is unavailable/quota-limited.
    try{this.storage?.setItem(STORE_KEY,JSON.stringify(this.session));}
    catch{/* The current tab can continue; a later reload may require sign-in. */}
  }
  clear({persist=true}={}){
    this.session=null;this.invalidateVerifiedUser();
    this.providerSessionReadAt=null;
    if(this.provider){
      if(!persist){this.ignoreProviderSessionEvents=true;return;}
      this.markLegacyMigrationComplete();
      this.signOutInProgress=true;
      void this.provider.signOut({scope:'local'}).catch(()=>{}).finally(()=>{
        this.signOutInProgress=false;
      });
      return;
    }
    // A storage failure must never prevent in-memory sign-out or token invalidation.
    try{this.storage?.removeItem(STORE_KEY);}
    catch{/* The stale persisted entry cannot be removed in this browser context. */}
  }
  async call(path,{method='GET',body,accessToken,signal,readTimeoutMs,requestKind='unknown',preflightCacheEligible=false}={}){
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
        preflightCacheEligible===true&&path.startsWith('/rest/v1/rpc/');
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
    if(this.provider){
      this.ignoreProviderSessionEvents=false;
      this.signInInProgress=true;
      try{
        const result=await this.provider.signInWithPassword({email:email.trim(),password});
        if(result.error)throw providerError(result.error,'sign-in');
        const session=result.data?.session;
        const user=result.data?.user||session?.user;
        if(!session||typeof user?.id!=='string'||user.id!==session.user?.id)
          throw new ApiError('Authentication did not return a valid session.',401,'AUTH_RESPONSE_INVALID');
        this.session={...session,user};
        this.invalidateVerifiedUser();
        this.providerSessionReadAt=null;
        this.markLegacyMigrationComplete();
        return user;
      }finally{this.signInInProgress=false;}
    }
    const data=await this.call('/auth/v1/token?grant_type=password',{
      method:'POST',body:{email:email.trim(),password}
    });
    this.save(data);
    try{await this.getVerifiedUser();}
    catch(err){
      this.handleAuthFailure(err,'identity');
      throw err;
    }
    return this.session.user;
  }
  async getVerifiedUser({fresh=false}={}){
    if(this.provider){
      const token=await this.token();
      const expectedUserId=this.userId;
      if(!expectedUserId)throw new ApiError('Please sign in to continue.',401,'SESSION_MISSING');
      const key=expectedUserId+':'+token;
      const cached=this.verifiedUserCache;
      const cacheAge=this.clock()-(cached?.verifiedAt??0);
      if(!fresh&&cached?.key===key&&cacheAge>=0&&cacheAge<VERIFIED_USER_CACHE_TTL_MS)
        return cached.user;
      if(this.verifiedUserPending?.key===key)return this.verifiedUserPending.promise;
      const revision=this.verifiedUserRevision;
      const pending=(async()=>{
        let result;
        try{result=await this.provider.getUser(token);}
        catch(error){
          const normalized=providerError(error,'identity');
          this.handleAuthFailure(normalized,'identity');
          throw normalized;
        }
        if(result?.error){
          const normalized=providerError(result.error,'identity');
          this.handleAuthFailure(normalized,'identity');
          throw normalized;
        }
        const user=result?.data?.user;
        if(!this.session||this.userId!==expectedUserId)
          throw new ApiError('Session changed during verification.',409,'SESSION_CHANGED');
        if(!isObject(user)||typeof user.id!=='string')
          throw new ApiError('Authentication provider returned an incomplete identity response.',500,'AUTH_RESPONSE_INVALID');
        if(user.id!==expectedUserId){
          const error=new ApiError('Session verification failed.',401,'AUTH_SESSION_INVALID');
          this.handleAuthFailure(error,'identity');
          throw error;
        }
        if(revision===this.verifiedUserRevision&&this.accessToken===token){
          this.session={...this.session,user};
          this.verifiedUserCache={key,user,verifiedAt:this.clock()};
        }
        return user;
      })();
      const entry={key,promise:pending};
      this.verifiedUserPending=entry;
      try{return await pending;}
      finally{if(this.verifiedUserPending===entry)this.verifiedUserPending=null;}
    }
    if(!this.session)throw new ApiError('You are not signed in.',401);
    const token=await this.token();
    const expectedUserId=this.session?.user?.id;
    if(!this.session||typeof expectedUserId!=='string')
      throw new ApiError('Session changed during verification.',409,'SESSION_CHANGED');
    const key=expectedUserId+':'+token;
    const cached=this.verifiedUserCache;
    const cacheAge=this.clock()-(cached?.verifiedAt??0);
    if(!fresh&&cached?.key===key&&cacheAge>=0&&cacheAge<VERIFIED_USER_CACHE_TTL_MS)
      return cached.user;
    if(this.verifiedUserPending?.key===key)return this.verifiedUserPending.promise;
    const revision=this.verifiedUserRevision;
    const pending=(async()=>{
      let data;
      try{data=await this.call('/auth/v1/user',{accessToken:token,requestKind:'read'});}
      catch(error){
        this.handleAuthFailure(error,'identity');
        throw error;
      }
      if(!this.session||this.userId!==expectedUserId)
        throw new ApiError('Session changed during verification.',409,'SESSION_CHANGED');
      if(!isObject(data)||typeof data.id!=='string')
        throw new ApiError('Authentication service returned an incomplete identity response.',500,'AUTH_RESPONSE_INVALID');
      if(data.id!==expectedUserId){
        const error=new ApiError('Session verification failed.',401,'AUTH_SESSION_INVALID');
        this.handleAuthFailure(error,'identity');
        throw error;
      }
      if(revision===this.verifiedUserRevision&&this.accessToken===token){
        this.session={...this.session,user:data};
        try{this.storage?.setItem(STORE_KEY,JSON.stringify(this.session));}
        catch{/* In-memory identity remains verified for this tab. */}
        this.verifiedUserCache={key,user:data,verifiedAt:this.clock()};
      }
      return data;
    })();
    const entry={key,promise:pending};
    this.verifiedUserPending=entry;
    try{return await pending;}
    finally{if(this.verifiedUserPending===entry)this.verifiedUserPending=null;}
  }
  async restore(){
    if(this.provider){
      if(this.restorePending)return this.restorePending;
      this.restorePending=this.restoreProvider().finally(()=>{this.restorePending=null;});
      return this.restorePending;
    }
    let raw=null;
    try{raw=this.storage?.getItem(STORE_KEY);}
    catch{
      // If storage becomes unavailable after this client already acquired a
      // session, verify that in-memory session rather than discarding it.
      if(!this.session)return false;
      try{await this.getVerifiedUser();return true;}
      catch(error){
        const failure=this.handleAuthFailure(error,'identity');
        if(failure.invalidateSession)return false;
        throw error;
      }
    }
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
      const failure=this.handleAuthFailure(error,'identity');
      if(failure.invalidateSession)return false;
      // Transport, storage and malformed-response failures do not prove that
      // the previously stored session has been revoked.
      throw error;
    }
  }
  async refresh(){
    if(this.provider){
      if(this.refreshing)return this.refreshing;
      this.refreshing=(async()=>{
        let result;
        try{result=await this.provider.refreshSession();}
        catch(rawError){
          const error=providerError(rawError,'refresh');
          const failure=this.handleAuthFailure(error,'refresh');
          const currentExpiry=Number(this.session?.expires_at)*1000;
          if(failure.category==='SESSION_CHANGED'&&this.session?.access_token&&
             Number.isFinite(currentExpiry)&&currentExpiry>this.clock())
            return this.session.access_token;
          throw error;
        }
        if(result?.error){
          const error=providerError(result.error,'refresh');
          const failure=this.handleAuthFailure(error,'refresh');
          const currentExpiry=Number(this.session?.expires_at)*1000;
          if(failure.category==='SESSION_CHANGED'&&this.session?.access_token&&
             Number.isFinite(currentExpiry)&&currentExpiry>this.clock())
            return this.session.access_token;
          throw error;
        }
        const next=result?.data?.session||null;
        if(!next){
          const error=new ApiError('Session expired.',401,'SESSION_MISSING');
          this.handleAuthFailure(error,'refresh');
          throw error;
        }
        if(!validProviderSession(next))
          throw new ApiError('Authentication provider returned an incomplete refreshed session.',500,'AUTH_RESPONSE_INVALID');
        this.session=next;
        this.invalidateVerifiedUser();
        this.providerSessionReadAt=null;
        return this.session.access_token;
      })().finally(()=>{this.refreshing=null;});
      return this.refreshing;
    }
    if(!this.session)throw new ApiError('Session expired.',401,'SESSION_MISSING');
    if(this.refreshing)return this.refreshing;
    this.refreshing=(async()=>{
      const prev=this.session;
      try{
        const next=await this.call('/auth/v1/token?grant_type=refresh_token',{
          method:'POST',body:{refresh_token:prev.refresh_token}
        });
        this.save(next);return this.session.access_token;
      }catch(error){
        this.handleAuthFailure(error,'refresh');
        throw error;
      }
    })().finally(()=>{this.refreshing=null;});
    return this.refreshing;
  }
  async readProviderSession({force=false}={}){
    if(!this.provider)throw new ApiError('Authentication provider is unavailable.',503);
    if(this.providerSessionReadPending)return this.providerSessionReadPending;
    const now=this.clock();
    const current=this.session;
    const expiresAt=Number(current?.expires_at)*1000;
    const checkedAt=this.providerSessionReadAt;
    if(!force&&current?.access_token&&Number.isFinite(expiresAt)&&expiresAt>now&&
       Number.isFinite(checkedAt)&&now>=checkedAt&&
       now-checkedAt<PROVIDER_SESSION_CHECK_INTERVAL_MS)return current;
    const pending=(async()=>{
      const revision=this.verifiedUserRevision;
      this.providerSessionReadAt=this.clock();
      let result;
      try{result=await this.provider.getSession();}
      catch(rawError){
        const error=providerError(rawError,'session-read');
        this.handleAuthFailure(error,'session-read');
        throw error;
      }
      if(result?.error){
        const error=providerError(result.error,'session-read');
        this.handleAuthFailure(error,'session-read');
        throw error;
      }
      if(!isObject(result)||!isObject(result.data))
        throw new ApiError('Authentication provider returned an incomplete session response.',500,'AUTH_RESPONSE_INVALID');
      const next=result.data.session||null;
      if(revision!==this.verifiedUserRevision)return this.session;
      if(next&&!validProviderSession(next))
        throw new ApiError('Authentication provider returned an incomplete session.',500,'AUTH_RESPONSE_INVALID');
      const previousToken=this.accessToken,previousUser=this.userId;
      if(!next){
        if(this.session)this.expireSession();
        else this.session=null;
        return null;
      }
      this.session=next;
      if(previousToken!==this.accessToken||previousUser!==this.userId)
        this.invalidateVerifiedUser();
      return next;
    })();
    this.providerSessionReadPending=pending;
    try{return await pending;}
    finally{if(this.providerSessionReadPending===pending)this.providerSessionReadPending=null;}
  }
  async token(){
    if(this.provider){
      const current=this.session;
      const now=this.clock();
      const expiresAt=Number(current?.expires_at)*1000;
      if(current?.access_token&&Number.isFinite(expiresAt)&&
         expiresAt>now+PROVIDER_SESSION_REFRESH_MARGIN_MS)return current.access_token;
      let latest;
      try{latest=await this.readProviderSession();}
      catch(error){
        // Reuse the last token only when the classifier says the failure did
        // not prove that the session was invalidated.
        const failure=error?.failureClassification||
          classifyAuthFailure(error,{operation:'session-read'});
        const latest=this.session;
        const latestExpiresAt=Number(latest?.expires_at)*1000;
        if(failure.preserveSession&&latest?.access_token&&
           Number.isFinite(latestExpiresAt)&&latestExpiresAt>this.clock())
          return latest.access_token;
        throw error;
      }
      if(!latest?.access_token)
        throw new ApiError('Please sign in to continue.',401,'SESSION_MISSING');
      return latest.access_token;
    }
    if(!this.session)throw new ApiError('Please sign in to continue.',401);
    if(this.session.expires_at<=this.clock()+60000)return this.refresh();
    return this.session.access_token;
  }
  async recoverAfterUnauthorized(rejectedToken){
    if(this.provider){
      let current;
      try{current=await this.readProviderSession({force:true});}
      catch(error){
        const failure=error?.failureClassification||
          classifyAuthFailure(error,{operation:'session-read'});
        const cached=this.session;
        const expiresAt=Number(cached?.expires_at)*1000;
        if(failure.preserveSession&&cached?.access_token&&
           cached.access_token!==rejectedToken&&
           Number.isFinite(expiresAt)&&expiresAt>this.clock())return cached.access_token;
        throw error;
      }
      if(!current?.access_token)
        throw new ApiError('Please sign in to continue.',401,'SESSION_MISSING');
      const expiresAt=Number(current.expires_at)*1000;
      if(current.access_token!==rejectedToken&&
         Number.isFinite(expiresAt)&&expiresAt>this.clock())return current.access_token;
      return this.refresh();
    }
    const current=this.session;
    if(current?.access_token&&current.access_token!==rejectedToken&&
       Number(current.expires_at)>this.clock())return current.access_token;
    return this.refresh();
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
          token=await this.recoverAfterUnauthorized(token);
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
    if(this.provider){
      this.signOutInProgress=true;
      let serverAcknowledged=false;
      try{
        const result=await this.provider.signOut({scope});
        serverAcknowledged=!result.error;
        if(result.error&&scope!=='local')
          await this.provider.signOut({scope:'local'}).catch(()=>{});
      }catch{
        if(scope!=='local')await this.provider.signOut({scope:'local'}).catch(()=>{});
      }finally{
        this.session=null;this.invalidateVerifiedUser();
        this.providerSessionReadAt=null;
        this.markLegacyMigrationComplete();
        this.signOutInProgress=false;
      }
      return serverAcknowledged;
    }
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
