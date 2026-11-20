import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoardCacheChannel,BOARD_CACHE_CHANNEL} from '../board/cache-channel.js';
import {DomainApi} from '../data.js';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const foreign='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const workspace='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const at=1783670000000;
class Channel {
 static peers=[];
 constructor(name){assert.equal(name,BOARD_CACHE_CHANNEL);this.closed=false;Channel.peers.push(this);}
 postMessage(data){for(const peer of Channel.peers)if(peer!==this&&!peer.closed)peer.onmessage?.({data});}
 close(){this.closed=true;}
}
function tab(id,workspaceId=workspace){
 const auth={userId:id,isSignedIn:true,accessToken:'disposable-'+id,authorized:async()=>({effective:true})};
 const observed=[];
 const sync=new BoardCacheChannel({auth,Channel,sender:id+'-'+Channel.peers.length,
  clock:()=>at,onInvalidate:v=>observed.push(v)});
 assert.equal(sync.start({userId:id,workspaceId}),true);
 const api=new DomainApi(auth);
 api.onBoardMutation=({boardId,revision})=>sync.publish(boardId,revision);
 return {auth,sync,api,observed};
}
test('signed scoped-role mutation propagates only to same-user same-workspace sessions',async()=>{
 Channel.peers=[];
 const actor=tab(user),peer=tab(user),other=tab(foreign);
 await actor.api.rpc('apsyntra_role_scoped_six_set',
  {p_workspace_id:workspace,p_target_user_id:foreign,p_module_id:'time-tracker',p_role:'Employee'});
 assert.equal(peer.observed.length,1);
 assert.deepEqual(peer.observed[0],{boardId:null,revision:null,userId:user,workspaceId:workspace});
 assert.equal(other.observed.length,0);
 actor.sync.stop();peer.sync.stop();other.sync.stop();
});
test('denied role RPC causes no cross-tab acknowledgement or invalidation',async()=>{
 Channel.peers=[];
 const actor=tab(user),peer=tab(user);
 actor.auth.authorized=async()=>{throw Object.assign(Error('denied'),{status:403});};
 await assert.rejects(actor.api.rpc('apsyntra_role_frt_workspace_set',{p_role:'DENIED'}),/denied/);
 assert.equal(peer.observed.length,0);
 actor.sync.stop();peer.sync.stop();
});
test('changing workspace or losing a session prevents stale role hint acceptance',async()=>{
 Channel.peers=[];
 const actor=tab(user),peer=tab(user,'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 await actor.api.rpc('apsyntra_role_tooltrace_workspace_set',{p_role:'USER'});
 assert.equal(peer.observed.length,0);
 peer.sync.start({userId:user,workspaceId:workspace});
 peer.auth.isSignedIn=false;
 await actor.api.rpc('apsyntra_role_charter_workspace_set',{p_role:'user'});
 assert.equal(peer.observed.length,0);
 actor.sync.stop();peer.sync.stop();
});
test('disposable SQL requires persisted receipts, revision conflicts, signed role recalculation and read-only production isolation',()=>{
 const sql=readFileSync('sql/tests/cp-crm-urm-integrity-02-disposable-acceptance.sql','utf8');
 const runner=readFileSync('scripts/cp-crm-urm-integrity-02-disposable.sh','utf8');
 for(const source of ['apsyntra_role_manage_user_access','apsyntra_crm_platform_role_set',
  'module_role_for','apsyntra_crm_effective_role','apsyntra_role_change_audit',
  'PT409','42501','work_board_members','ROLLBACK;'])assert.ok(sql.includes(source),source);
 assert.match(runner,/--network none/);
 assert.match(runner,/--read-only/);
 assert.match(runner,/cp-urm04b-disposable-setup\.sql/);
 assert.match(runner,/cp-crm-urm-integrity-02-disposable-acceptance\.sql/);
 assert.doesNotMatch(runner,/supabase login|supabase link|db push|remote\/|production\.supabase\.co/i);
});
