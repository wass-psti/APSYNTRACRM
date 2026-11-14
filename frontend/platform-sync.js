/** CP-CRM-RT01: one signed connection for existing private board broadcasts.
 * Events are invalidation hints ONLY. Every visible record is re-read from signed RPCs.
 * No data, coordinates, roles or permissions are accepted from WebSocket payloads.
 * See Supabase Realtime Protocol v2.0.0 (JSON array framing).
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTITIES=new Set(['board','member','group','item','column','cell','update','file']);
const PHASES=new Set(['connecting','synchronized','synchronizing','reconnecting','offline','error']);
export const SYNC_MAX_BOARD_CHANNELS=24;
export const SYNC_POLL_INTERVAL_MS=30000;
export const SYNC_RECONCILE_INTERVAL_MS=90000;
export const SYNC_FOCUS_COOLDOWN_MS=3000;
const noop=()=>{};
export class PlatformSync {
 constructor({auth,api,url,publishableKey,WebSocketImpl=globalThis.WebSocket,
  setTimeoutFn=globalThis.setTimeout?.bind(globalThis),
  clearTimeoutFn=globalThis.clearTimeout?.bind(globalThis),
  setIntervalFn=globalThis.setInterval?.bind(globalThis),
  clearIntervalFn=globalThis.clearInterval?.bind(globalThis),
  now=()=>Date.now(),random=Math.random,
  visible=()=>!globalThis.document?.hidden,
  online=()=>globalThis.navigator?.onLine!==false,
  onStatus=noop,onInvalidate=async()=>false}={}){
  Object.assign(this,{auth,api,url,publishableKey,WebSocketImpl,
   setTimeoutFn,clearTimeoutFn,setIntervalFn,clearIntervalFn,
   now,random,visible,online,onStatus,onInvalidate});
  this.running=false;this.generation=0;this.timer=null;this.flushTimer=null;
  this.heartbeat=null;this.reconnectTimer=null;this.socket=null;
  this.ref=0;this.attempt=0;this.pending=new Set();this.joins=new Map();
  this.joined=new Map();this.inFlight=false;this.heartbeatsPending=0;this.lastSyncAt=null;
  this.lastCheckAt=null;this.lastTransport='none';
  this.scope=null;this.lastStatus=null;this.boardIds=[];
  this.lastFocusSyncAt=null;this.queuedSync=null;
 }
 status(phase,detail=''){
  if(!PHASES.has(phase))throw new Error('Invalid sync state');
  const snapshot={phase,detail,transport:this.lastTransport,lastSyncAt:this.lastSyncAt};
  if(JSON.stringify(snapshot)!==JSON.stringify(this.lastStatus)){
   this.lastStatus=snapshot;this.onStatus(Object.freeze(snapshot));
  }
 }
 sameScope(userId,workspaceId){
  return this.running&&this.scope?.userId===userId&&
   this.scope?.workspaceId===workspaceId&&this.auth?.isSignedIn&&
   this.auth?.userId===userId;
 }
 start({userId,workspaceId,boardIds=[],priorityBoardId=null}={}){
  if(!UUID.test(userId||'')||!UUID.test(workspaceId||'')||
   !this.auth?.isSignedIn||this.auth.userId!==userId){
   this.stop();return;
  }
  const ids=[...new Set([priorityBoardId,...boardIds].filter(id=>UUID.test(id||'')))];
  const unchanged=this.sameScope(userId,workspaceId)&&
   ids.join('|')===this.boardIds.join('|');
  if(unchanged)return;
  this.stop();
  this.running=true;this.scope={userId,workspaceId};
  this.boardIds=ids;
  const gen=this.generation;
  this.timer=this.setIntervalFn?.(()=>this.pollTick(gen),SYNC_POLL_INTERVAL_MS);
  if(!this.online()){this.status('offline','Network connection unavailable');return;}
  if(!this.visible()){this.status('connecting','Suspended in background');return;}
  this.status('connecting','Authorizing board subscriptions');
  void this.connect(gen);
 }
 stop(){
  this.running=false;this.generation++;
  if(this.timer!==null)this.clearIntervalFn?.(this.timer);
  if(this.reconnectTimer!==null)this.clearTimeoutFn?.(this.reconnectTimer);
  if(this.flushTimer!==null)this.clearTimeoutFn?.(this.flushTimer);
  this.timer=null;this.reconnectTimer=null;this.flushTimer=null;
  this.pending.clear();this.boardIds=[];this.scope=null;
  this.closeSocket();this.inFlight=false;this.lastTransport='none';
  this.lastSyncAt=null;this.lastCheckAt=null;this.attempt=0;
  this.lastFocusSyncAt=null;this.queuedSync=null;
  this.status('offline','Not connected');
 }
 closeSocket(){
  if(this.heartbeat!==null)this.clearIntervalFn?.(this.heartbeat);
  this.heartbeat=null;
  const ws=this.socket;this.socket=null;
  this.joins.clear();this.joined.clear();this.heartbeatsPending=0;
  if(ws){ws.onopen=ws.onclose=ws.onmessage=ws.onerror=null;try{ws.close();}catch{}}
 }
 async authenticate(gen){
  if(gen!==this.generation||!this.running||!this.auth?.isSignedIn)
   throw new Error('Inactive signed scope');
  const who=await this.auth.getVerifiedUser();
  const context=await this.api.context();
  if(gen!==this.generation||!this.sameScope(who?.id,context?.workspace_id)||
   context.user_id!==this.scope.userId||context.workspace_id!==this.scope.workspaceId)
   throw new Error('Signed workspace scope changed');
  const token=await this.auth.token();
  if(gen!==this.generation||!this.sameScope(who.id,context.workspace_id)||!token)
   throw new Error('Signed session changed during connection');
  return token;
 }
 async connect(gen=this.generation){
  if(!this.running||gen!==this.generation||!this.visible()||!this.online())return;
  if(!this.WebSocketImpl||!this.url||!this.publishableKey){
   this.lastTransport='polling';this.status('reconnecting','Secure Realtime unavailable; polling fallback');
   return;
  }
  try{
   const token=await this.authenticate(gen);
   if(gen!==this.generation||!this.running||!this.visible()||!this.online())return;
   this.closeSocket();
   this.token=token;
   const base=new URL(this.url);
   if(base.protocol!=='https:')throw Error('Secure Realtime origin required');
   const endpoint='wss://'+base.host+'/realtime/v1/websocket?apikey='+
    encodeURIComponent(this.publishableKey)+'&vsn=2.0.0';
   const ws=new this.WebSocketImpl(endpoint);
   this.socket=ws;
   ws.onopen=()=>this.joinChannels(ws,gen);
   ws.onmessage=event=>this.receive(ws,gen,event.data);
   ws.onerror=()=>{}; // onclose controls backoff; do not log network details
   ws.onclose=()=>{if(gen===this.generation&&this.running&&this.socket===ws)
    this.reconnect(gen);};
  }catch(error){
   if(gen!==this.generation||!this.running)return;
   if(/scope changed|Inactive signed scope|session changed/i.test(String(error.message))){
    this.stop();this.status('error','Signed workspace requires reauthentication');return;
   }
   this.reconnect(gen);
  }
 }
 send(ws,joinRef,topic,event,payload={}){
  if(ws!==this.socket||ws.readyState!==1)return false;
  try{const ref=String(++this.ref);ws.send(JSON.stringify([joinRef,ref,topic,event,payload]));return ref;}
  catch{return false;}
 }
 joinChannels(ws,gen){
  if(ws!==this.socket||gen!==this.generation)return;
  this.joins.clear();this.joined.clear();
  const boardIds=this.boardIds.slice(0,SYNC_MAX_BOARD_CHANNELS);
  for(const id of boardIds){
   const joinRef=String(++this.ref),topic='realtime:board:'+id;
   const requestRef=this.send(ws,joinRef,topic,'phx_join',{
    config:{broadcast:{ack:false,self:false},presence:{enabled:false},
     postgres_changes:[],private:true},access_token:this.token
   });
   if(!requestRef)return this.reconnect(gen);
   this.joins.set(requestRef,{boardId:id,joinRef});
  }
  this.heartbeat=this.setIntervalFn?.(()=>this.tickHeartbeat(ws,gen),20000);
  if(boardIds.length===0){this.lastTransport='polling';void this.syncNow('join',[]);}
 }
 async tickHeartbeat(ws,gen){
  if(ws!==this.socket||gen!==this.generation)return;
  if(!this.online()){this.network(false);return;}
  try{
   const token=await this.auth.token();
   if(gen!==this.generation||ws!==this.socket)return;
   if(token!==this.token){
    this.token=token;
    for(const [id,ref] of this.joined)
     this.send(ws,ref,'realtime:board:'+id,'access_token',{access_token:token});
   }
   if(this.heartbeatsPending>=2){this.reconnect(gen);return;}
   if(this.send(ws,null,'phoenix','heartbeat',{}))this.heartbeatsPending++;
  }catch{this.stop();this.status('error','Signed session verification failed');}
 }
 receive(ws,gen,raw){
  if(ws!==this.socket||gen!==this.generation||typeof raw!=='string')return;
  let packet;try{packet=JSON.parse(raw);}catch{return;}
  if(!Array.isArray(packet)||packet.length!==5)return;
  const [joinRef,ref,topic,event,payload]=packet;
  if(typeof topic!=='string'||typeof event!=='string')return;
  if(topic==='phoenix'&&event==='phx_reply'){
   if(payload?.status==='ok')this.heartbeatsPending=0;
   else this.reconnect(gen);
   return;
  }
  if(event==='phx_reply'&&this.joins.has(String(ref))){
   const requested=this.joins.get(String(ref));this.joins.delete(String(ref));
   if(payload?.status!=='ok'){this.reconnect(gen);return;}
   this.joined.set(requested.boardId,requested.joinRef);
   if(this.joins.size===0){
    this.attempt=0;this.lastTransport='realtime';
    void this.syncNow('join',[]);
   }
   return;
  }
  if(event==='phx_error'||event==='phx_close'){
   this.reconnect(gen);return;
  }
  if(event!=='broadcast')return;
  const prefix='realtime:board:';
  if(!topic.startsWith(prefix)||payload?.event!=='board-change')return;
  const id=topic.slice(prefix.length),change=payload?.payload;
  if(!this.joined.has(id)||!this.boardIds.includes(id)||!UUID.test(id)||
   change?.board_id!==id||!ENTITIES.has(change?.entity))return;
  this.pending.add(id);
  if(this.flushTimer===null)this.flushTimer=this.setTimeoutFn?.(()=>{
   this.flushTimer=null;const ids=[...this.pending];this.pending.clear();
   void this.syncNow('broadcast',ids);
  },250);
 }
 reconnect(gen){
  if(gen!==this.generation||!this.running)return;
  this.closeSocket();
  if(!this.online()){this.status('offline','Network disconnected');return;}
  this.lastTransport='polling';this.status('reconnecting','Reconnecting secure board updates');
  if(this.reconnectTimer!==null)return;
  const wait=Math.min(30000,1000*2**Math.min(this.attempt++,5));
  const jitter=Math.round(wait*0.2*this.random());
  this.reconnectTimer=this.setTimeoutFn?.(()=>{
   this.reconnectTimer=null;void this.connect(gen);
  },wait+jitter);
 }
 async pollTick(gen){
  if(gen!==this.generation||!this.running||!this.visible()||!this.online())return;
  const interval=this.lastTransport==='realtime'?SYNC_RECONCILE_INTERVAL_MS:SYNC_POLL_INTERVAL_MS;
  if(this.lastCheckAt!==null&&this.now()-this.lastCheckAt<interval)return;
  await this.syncNow('poll',[]);
 }
 queueSync(reason,boardIds=[]){
  const full=reason!=='broadcast';
  if(!this.queuedSync||full){
   if(full)this.queuedSync={reason,boardIds:new Set()};
   else this.queuedSync={reason,boardIds:new Set(boardIds)};
  }
  if(!full)for(const id of boardIds)this.queuedSync.boardIds.add(id);
 }
 async syncNow(reason='manual',boardIds=[]){
  if(!this.running||!this.visible()||!this.online())return false;
  if(this.inFlight){this.queueSync(reason,boardIds);return false;}
  const gen=this.generation,scope=this.scope;
  if(!scope||!this.sameScope(scope.userId,scope.workspaceId))return false;
  this.inFlight=true;this.lastCheckAt=this.now();
  this.status('synchronizing',reason==='broadcast'?'Board changes detected':'Checking authorized updates');
  try{
   const ok=await this.onInvalidate(Object.freeze({
    reason,boardIds:Object.freeze([...boardIds]),userId:scope.userId,
    workspaceId:scope.workspaceId
   }));
   if(gen!==this.generation||!this.sameScope(scope.userId,scope.workspaceId))return false;
   if(ok===true){
    this.lastSyncAt=this.now();
    this.status('synchronized',this.lastTransport==='realtime'?
     'Authorized Realtime connected':'Authorized polling fallback');
    return true;
   }
   this.status('reconnecting','Pending authoritative reconciliation');
   return false;
  }catch{
   if(gen===this.generation)this.status('error','Signed refresh unavailable');
   return false;
  }finally{
   if(gen===this.generation){
    this.inFlight=false;
    const queued=this.queuedSync;this.queuedSync=null;
    if(queued&&this.running&&this.visible()&&this.online())
     Promise.resolve().then(()=>this.syncNow(queued.reason,[...queued.boardIds]));
   }
  }
 }
 focusChanged(){
  if(!this.running||!this.visible()||!this.online())return false;
  const now=this.now();
  if(this.lastFocusSyncAt!==null&&now-this.lastFocusSyncAt<SYNC_FOCUS_COOLDOWN_MS)
   return false;
  this.lastFocusSyncAt=now;
  void this.syncNow('focus',[]);
  return true;
 }
 visibilityChanged(){
  if(!this.running)return;
  if(!this.visible()){
   this.closeSocket();this.status('connecting','Paused while tab is hidden');
  }else if(this.online()){
   if(this.reconnectTimer!==null){this.clearTimeoutFn?.(this.reconnectTimer);this.reconnectTimer=null;}
   this.status('connecting','Restoring authorized updates');
   void this.connect(this.generation);
   void this.syncNow('visible',[]);
  }
 }
 network(isOnline){
  if(!this.running)return;
  if(!isOnline){
   this.closeSocket();this.status('offline','Network disconnected');
  }else if(this.visible()){
   if(this.reconnectTimer!==null){
    this.clearTimeoutFn?.(this.reconnectTimer);this.reconnectTimer=null;
   }
   this.status('reconnecting','Reconnecting authenticated updates');
   void this.connect(this.generation);
   void this.syncNow('online',[]);
  }
 }
}
