import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PlatformSync,SYNC_MAX_BOARD_CHANNELS,SYNC_POLL_INTERVAL_MS}
 from '../platform-sync.js';

const uid='20000000-0000-4000-8000-000000000001';
const wid='10000000-0000-4000-8000-000000000001';
const id=n=>'30000000-0000-4000-8000-'+String(n).padStart(12,'0');
const b1=id(1),b2=id(2);
function fake(){
 const sockets=[],timeouts=new Map(),intervals=new Map();
 let next=0,time=1000000,visible=true,online=true,token='signed-jwt';
 class Socket {
  constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}
  open(){this.readyState=1;this.onopen?.();}
  send(str){this.sent.push(JSON.parse(str));}
  emit(frame){this.onmessage?.({data:JSON.stringify(frame)});}
  close(){this.readyState=3;}
 }
 const statuses=[],invalidations=[];
 const auth={
  get isSignedIn(){return true;},get userId(){return uid;},
  async getVerifiedUser(){return {id:uid};},async token(){return token;}
 };
 const api={async context(){return {user_id:uid,workspace_id:wid};}};
 const ctl=new PlatformSync({
  auth,api,url:'https://jtlusodorfnyzgyuewkz.supabase.co',
  publishableKey:'sb_publishable_test',WebSocketImpl:Socket,now:()=>time,
  visible:()=>visible,online:()=>online,random:()=>0,
  onStatus:s=>statuses.push(s),
  onInvalidate:async event=>{invalidations.push(event);return true;},
  setTimeoutFn:(fn,ms)=>{const t=++next;timeouts.set(t,{fn,ms});return t;},
  clearTimeoutFn:t=>timeouts.delete(t),
  setIntervalFn:(fn,ms)=>{const t=++next;intervals.set(t,{fn,ms});return t;},
  clearIntervalFn:t=>intervals.delete(t)
 });
 const flush=async ms=>{
  for(const [t,item] of [...timeouts]){
   if(item.ms===ms){timeouts.delete(t);item.fn();}
  }
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
 };
 const wait=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 const join=async sock=>{
  sock.open();
  for(const frame of sock.sent.filter(m=>m[3]==='phx_join'))
   sock.emit([frame[0],frame[1],frame[2],'phx_reply',{status:'ok',response:{}}]);
  await wait();
 };
 return {ctl,sockets,statuses,invalidations,wait,flush,join,intervals,
  setVisible:v=>{visible=v;},setOnline:v=>{online=v;},setToken:v=>{token=v;},
  advance:ms=>{time+=ms;}};
}
test('private one-socket board subscriptions use v2 protocol and signed JWT',async()=>{
 const x=fake();
 x.ctl.start({userId:uid,workspaceId:wid,boardIds:[b1,b2]});
 await x.wait();
 assert.equal(x.sockets.length,1);
 assert.match(x.sockets[0].url,/^wss:\/\/jtlusodorfnyzgyuewkz.supabase.co\/realtime\/v1\/websocket\?/);
 assert.match(x.sockets[0].url,/vsn=2\.0\.0/);
 assert.doesNotMatch(x.sockets[0].url,/signed-jwt/);
 await x.join(x.sockets[0]);
 const frames=x.sockets[0].sent.filter(m=>m[3]==='phx_join');
 assert.equal(frames.length,2);
 assert.deepEqual(frames.map(m=>m[2]).sort(),
  ['realtime:board:'+b1,'realtime:board:'+b2].sort());
 for(const frame of frames){
  assert.equal(frame[4].config.private,true);
  assert.equal(frame[4].access_token,'signed-jwt');
 }
 assert.equal(x.invalidations.length,1);
 assert.equal(x.statuses.at(-1).phase,'synchronized');
 x.ctl.stop();assert.equal(x.sockets[0].readyState,3);
});
test('events only invalidate exact authorized board scopes and debounce safely',async()=>{
 const x=fake();x.ctl.start({userId:uid,workspaceId:wid,boardIds:[b1,b2]});
 await x.wait();await x.join(x.sockets[0]);
 const sock=x.sockets[0],n=x.invalidations.length;
 const emit=(topic,change,event='board-change')=>
  sock.emit([null,null,topic,'broadcast',{event,payload:change}]);
 emit('realtime:board:'+id(3),{board_id:id(3),entity:'cell'});
 emit('realtime:board:'+b1,{board_id:b2,entity:'cell'});
 emit('realtime:board:'+b1,{board_id:b1,entity:'private_password'});
 emit('realtime:board:'+b1,{board_id:b1,entity:'cell'},'untrusted-event');
 assert.equal(x.invalidations.length,n);
 emit('realtime:board:'+b1,{board_id:b1,entity:'cell'});
 emit('realtime:board:'+b1,{board_id:b1,entity:'item'});
 emit('realtime:board:'+b2,{board_id:b2,entity:'group'});
 await x.flush(250);
 assert.equal(x.invalidations.length,n+1);
 assert.deepEqual([...x.invalidations.at(-1).boardIds].sort(),[b1,b2].sort());
 assert.equal(x.invalidations.at(-1).reason,'broadcast');
 x.ctl.stop();
});
test('unavailable socket uses only bounded visible authorized polling',async()=>{
 const x=fake();x.ctl.WebSocketImpl=null;
 x.ctl.start({userId:uid,workspaceId:wid,boardIds:[b1]});
 await x.wait();
 assert.equal(x.sockets.length,0);
 assert.equal([...x.intervals.values()].filter(v=>v.ms===SYNC_POLL_INTERVAL_MS).length,1);
 await x.ctl.pollTick(x.ctl.generation);
 assert.equal(x.invalidations.length,1);
 assert.equal(x.statuses.at(-1).phase,'synchronized');
 assert.equal(x.statuses.at(-1).transport,'polling');
 x.advance(SYNC_POLL_INTERVAL_MS);
 await x.ctl.pollTick(x.ctl.generation);
 assert.equal(x.invalidations.length,2);
 x.setVisible(false);x.advance(SYNC_POLL_INTERVAL_MS);
 await x.ctl.pollTick(x.ctl.generation);
 assert.equal(x.invalidations.length,2);
 x.ctl.stop();assert.equal(x.intervals.size,0);
});
test('visibility pause closes socket and returns with fresh signed join',async()=>{
 const x=fake();x.ctl.start({userId:uid,workspaceId:wid,boardIds:[b1]});
 await x.wait();await x.join(x.sockets[0]);
 x.setVisible(false);x.ctl.visibilityChanged();
 assert.equal(x.sockets[0].readyState,3);
 x.setVisible(true);x.ctl.visibilityChanged();await x.wait();
 assert.equal(x.sockets.length,2);
 await x.join(x.sockets[1]);
 assert.equal(x.statuses.at(-1).phase,'synchronized');
 x.ctl.stop();
});
test('token rotation updates private channels in-band without exposing tokens in URLs',async()=>{
 const x=fake();x.ctl.start({userId:uid,workspaceId:wid,boardIds:[b1]});
 await x.wait();await x.join(x.sockets[0]);
 const sock=x.sockets[0];
 x.setToken('rotated-jwt');
 await x.ctl.tickHeartbeat(sock,x.ctl.generation);
 const updates=sock.sent.filter(m=>m[3]==='access_token');
 assert.equal(updates.length,1);
 assert.equal(updates[0][4].access_token,'rotated-jwt');
 assert.doesNotMatch(sock.url,/rotated-jwt/);
 x.ctl.stop();
});
test('channel authorization failure does not claim synchronization and triggers backoff',async()=>{
 const x=fake();x.ctl.start({userId:uid,workspaceId:wid,boardIds:[b1]});
 await x.wait();const sock=x.sockets[0];sock.open();
 const frame=sock.sent.find(m=>m[3]==='phx_join');
 sock.emit([frame[0],frame[1],frame[2],'phx_reply',{status:'error',response:{reason:'denied'}}]);
 assert.equal(x.statuses.at(-1).phase,'reconnecting');
 assert.equal(x.invalidations.length,0);
 assert.equal(x.sockets[0].readyState,3);
 x.ctl.stop();
});
test('missed heartbeat acknowledgments trigger bounded reconnection',async()=>{
 const x=fake();x.ctl.start({userId:uid,workspaceId:wid,boardIds:[b1]});
 await x.wait();await x.join(x.sockets[0]);
 const socket=x.sockets[0],gen=x.ctl.generation;
 await x.ctl.tickHeartbeat(socket,gen);
 assert.equal(x.ctl.heartbeatsPending,1);
 const heartbeat=socket.sent.at(-1);
 assert.equal(heartbeat[3],'heartbeat');
 socket.emit([null,heartbeat[1],'phoenix','phx_reply',{status:'ok',response:{}}]);
 assert.equal(x.ctl.heartbeatsPending,0);
 await x.ctl.tickHeartbeat(socket,gen);
 await x.ctl.tickHeartbeat(socket,gen);
 assert.equal(x.ctl.heartbeatsPending,2);
 await x.ctl.tickHeartbeat(socket,gen);
 assert.equal(x.ctl.heartbeatsPending,0);
 assert.equal(socket.readyState,3);
 assert.equal(x.statuses.at(-1).phase,'reconnecting');
 x.ctl.stop();
});
test('subscription counts stay bounded and stop disposes socket/timers',async()=>{
 const x=fake();
 x.ctl.start({userId:uid,workspaceId:wid,
  boardIds:Array.from({length:50},(_,i)=>id(i+1))});
 await x.wait();x.sockets[0].open();
 assert.equal(x.sockets[0].sent.filter(m=>m[3]==='phx_join').length,SYNC_MAX_BOARD_CHANNELS);
 x.ctl.stop();assert.equal(x.intervals.size,0);
 assert.equal(x.sockets[0].readyState,3);
});
test('frontend integration preserves signed state, edits and background-independent status',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const index=readFileSync('index.html','utf8');
 const css=readFileSync('frontend/platform-sync.css','utf8');
 assert.match(app,/const platformSync=new PlatformSync/);
 assert.match(app,/function reconcilePlatformSync\(/);
 assert.match(app,/function platformSyncEditInProgress\(/);
 assert.match(app,/root\.querySelector\('\.aps-sync'\)/);
 assert.match(app,/if\(platformSyncEditInProgress\(\)\)return false/);
 assert.match(app,/if\(state\.context&&auth\.isSignedIn\)platformSync\.start/);
 const logout=app.split("case 'logout':{")[1];
 assert.ok(logout,'Logout handler must exist');
 assert.match(logout,/closeWorkspacePanels\(\);clearBulkActivation\(\);platformSync\.stop\(\)/);
 const expired=app.split('auth.onExpired=()=>{')[1];
 assert.ok(expired,'Session-expiration cleanup must exist');
 assert.match(expired,/closeWorkspacePanels\(\);state\.context=null/);
 assert.match(app,/state\.userRoleData=null;state\.boards=\[\];platformSync\.stop\(\)/);
 assert.match(index,/wss:\/\/jtlusodorfnyzgyuewkz.supabase.co/);
 assert.match(index,/frontend\/platform-sync.css/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/\[data-sync-state="synchronized"\]/);
 assert.match(css,/\.aps-sync-orbit/);
 assert.doesNotMatch(css,/WebGL|canvas|will-change/);
});
