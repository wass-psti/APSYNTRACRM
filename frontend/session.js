import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';

const STORE_KEY='apsyntra.crm.auth.v1';
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export class ApiError extends Error {
  constructor(message,status=0,code=''){ super(message);this.name='ApiError';this.status=status;this.code=code; }
}
export class AuthClient {
  constructor({fetchImpl=globalThis.fetch?.bind(globalThis),storage=globalThis.sessionStorage,clock=()=>Date.now()}={}){
    this.fetchImpl=fetchImpl;this.storage=storage;this.clock=clock;this.session=null;this.refreshing=null;this.onExpired=()=>{};
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
    let response;
    try{
      response=await this.fetchImpl(SUPABASE_URL+path,{
        method,mode:'cors',redirect:'error',cache:'no-store',
        headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',
           ...(accessToken?{Authorization:'Bearer '+accessToken}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),signal
      });
    }catch{throw new ApiError('Network unavailable. Verify your internet connection and retry.');}
    let data;
    try{data=await response.json();}catch{data=null;}
    if(!response.ok){
      const errorMessage=isObject(data)?(data.msg||data.message||data.error_description||data.error):null;
      throw new ApiError(typeof errorMessage==='string'?errorMessage:'Request failed ('+response.status+')',
       response.status,isObject(data)?String(data.code||data.error_code||''):'');
    }
    return data;
  }
  async signIn(email,password){
    if(!email?.trim()||!password)throw new ApiError('Enter your email and password.');
    const data=await this.call('/auth/v1/token?grant_type=password',{
      method:'POST',body:{email:email.trim(),password}
    });
    this.save(data);
    try{await this.getVerifiedUser();}catch(err){this.clear();throw err;}
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
    try{
      const previous=JSON.parse(raw);
      if(!isObject(previous)||!isObject(previous.user)
         ||typeof previous.access_token!=='string'||typeof previous.refresh_token!=='string'
         ||!Number.isFinite(previous.expires_at))throw Error('invalid');
      this.session=previous;
      await this.getVerifiedUser();return true;
    }catch{this.clear();return false;}
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
    const token=await this.token();
    try{return await this.call(path,{...options,accessToken:token});}
    catch(err){
      if(err.status!==401)throw err;
      const renewed=await this.refresh();
      return this.call(path,{...options,accessToken:renewed});
    }
  }
  async signOut(){
    const token=this.session?.access_token;
    try{if(token)await this.call('/auth/v1/logout',{method:'POST',accessToken:token});}
    catch{/* Always end the local session even if the network is unavailable. */}
    finally{this.clear();}
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
