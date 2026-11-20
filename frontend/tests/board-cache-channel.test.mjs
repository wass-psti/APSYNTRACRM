import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoardCacheChannel,BOARD_CACHE_CHANNEL} from '../board/cache-channel.js';
import {DomainApi} from '../data.js';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const workspace='00000000-0000-4000-8000-000000000001';
const foreign='00000000-0000-4000-8000-000000000002';
const boardId='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
const scope={userId:user,workspaceId:workspace};
const now=1783670000000;
class FakeChannel {
 static list=[];
 constructor(name){assert.equal(name,BOARD_CACHE_CHANNEL);this.closed=false;FakeChannel.list.push(this);}
 postMessage(value){for(const peer of FakeChannel.list){if(peer!==this&&!peer.closed)peer.onmessage?.({data:value});}}
 close(){this.closed=true;}
}
function create(sender){
 const auth={userId:user,isSignedIn:true,accessToken:'token',authorized:async()=>null};
 const received=[];
 const sync=new BoardCacheChannel({auth,Channel:FakeChannel,sender,clock:()=>now,
  onInvalidate:value=>received.push(value)});
 sync.start(scope);
 return {auth,received,sync};
}
test('cross-tab invalidation sends identifiers only to matching active signed scope',()=>{
 FakeChannel.list=[];
 const a=create('tab-a'),b=create('tab-b');
 assert.equal(a.sync.publish(boardId,'2026-11-09T08:00:00Z'),true);
 assert.equal(b.received.length,1);
 assert.deepEqual(b.received[0],{boardId,revision:'2026-11-09T08:00:00Z',...scope});
 const message=JSON.stringify(b.received[0]);
 assert.doesNotMatch(message,/token|items|groups|content|permission/i);
 a.sync.stop();b.sync.stop();
});
test('foreign workspace, foreign user, stale sequence and malformed events are rejected',()=>{
 FakeChannel.list=[];
 const b=create('tab-b');
 const message={version:1,type:'invalidate',sender:'tab-a',sequence:1,
  ...scope,boardId,revision:null,at:now};
 assert.equal(b.sync.receive({...message,workspaceId:foreign}),false);
 assert.equal(b.sync.receive({...message,userId:other}),false);
 assert.equal(b.sync.receive({...message,boardId:'not-a-uuid'}),false);
 assert.equal(b.sync.receive({...message,at:now-121000}),false);
 assert.equal(b.sync.receive({...message,revision:'not-a-revision'}),false);
 assert.equal(b.sync.receive(message),true);
 assert.equal(b.sync.receive(message),false);
 assert.equal(b.sync.receive({...message,sequence:0}),false);
 assert.equal(b.received.length,1);
 b.auth.userId=other;
 assert.equal(b.sync.receive({...message,sequence:2}),false);
 b.sync.stop();
});
test('workspace change closes prior listener and session expiry prevents messages',()=>{
 FakeChannel.list=[];
 const a=create('tab-a'),b=create('tab-b');
 b.sync.start({...scope,workspaceId:foreign});
 a.sync.publish(boardId);
 assert.equal(b.received.length,0);
 b.sync.start(scope);
 b.auth.isSignedIn=false;
 a.sync.publish(boardId);
 assert.equal(b.received.length,0);
 b.sync.stop();a.sync.stop();
});
test('unsupported BroadcastChannel is a safe no-op',()=>{
 const auth={isSignedIn:true,userId:user};
 const sync=new BoardCacheChannel({auth,Channel:null,sender:'tab-z',clock:()=>now});
 assert.equal(sync.start(scope),true);
 assert.equal(sync.publish(boardId),false);
 sync.stop();
});
test('strictly older authoritative board version hints cannot evict a newer snapshot',async()=>{
 let reads=0;
 const auth={userId:user,accessToken:'token',authorized:async(path)=>{
  if(path.endsWith('/wm_get_board_shell')){
   reads++;return {board:{id:boardId,workspace_id:workspace,updated_at:'2026-11-09T10:00:00Z'},
    groups:[],members:[],columns:[]};
  }
  if(path.endsWith('/wm_get_board_items_page'))
   return {items:[],values:[],has_more:false,next_cursor:null};
  return true;
 }};
 const api=new DomainApi(auth);
 api.extendedRefsSupported=false; // Import references are disabled; shell and item pages remain authoritative.
 await api.boardCached(boardId,scope);
 assert.equal(api.invalidateBoardCache(boardId,{revision:'2026-11-09T09:00:00Z'}),false);
 await api.boardCached(boardId,scope);
 assert.equal(reads,1);
 assert.equal(api.invalidateBoardCache(boardId,{revision:'2026-11-09T10:00:00Z'}),true);
 await api.boardCached(boardId,scope);
 assert.equal(reads,2);
 assert.equal(api.invalidateBoardCache(boardId,{revision:'2026-11-09T10:01:00Z'}),true);
 await api.boardCached(boardId,scope);
 assert.equal(reads,3);
});
test('successful mutating RPC publishes one scoped hint, failed RPC publishes none',async()=>{
 let events=[];
 const auth={userId:user,accessToken:'token',authorized:async(path,options)=>{
  if(path.includes('deny_me'))throw Error('denied');
  if(path.endsWith('wm_list_board_events'))return [];
  return path.endsWith('wm_board_group_cas')?{updated_at:'2026-11-09T10:00:00Z'}:true;
 }};
 const api=new DomainApi(auth);
 api.onBoardMutation=hint=>events.push(hint);
 await api.allowed(boardId,'view');
 await api.boardEvents(boardId);
 await api.rpc('tl03_documents_page',{p_board_id:boardId});
 assert.equal(events.length,0);
 await api.rpc('wm_board_group_cas',{p_board_id:boardId});
 assert.deepEqual(events,[{boardId,revision:null}]);
 await assert.rejects(()=>api.rpc('deny_me',{p_board_id:boardId}));
 assert.equal(events.length,1);
});
test('all reviewed board and module write RPCs publish cross-window invalidations after success',async()=>{
 const writes=[
  'wm_add_board_group','wm_add_board_item','wm_create_board','wm_create_board_configured',
  'wm_delete_board_item','wm_delete_board_permanently','wm_import_board_wizard_atomic','wm_managed_board_delete_empty_group',
  'wm_set_board_cell_if_current','wm_set_board_status_labels','wm_update_board_group',
  'wm_update_board_item','wm_board_bulk_mutate','wm_board_card_mutate','wm_board_group_cas',
  'wm_board_schema_mutate','wm_board_ui_save','wm_ws01_config_update','wm_ws01_create',
  'wm_ws01_select','huly_sb06_transact','mrh_board_item_tasks_write','mrh_create_material_atomic',
  'mrh_sourcing_sensitive_write','fueltrack_v3_submit','fueltrack_v3_decide',
  'fueltrack_v3_mark_refueled','fueltrack_v3_complete','fueltrack_v3_attach_receipt',
  'timetracker_attendance_commit_v2','timetracker_ot_submit','timetracker_ot_decide',
  'tl03_document_commit','tl03_document_decide','tl03_document_operate','tl03_document_review',
  'tl03_document_submit','tl03_document_save','tl03_document_status_update',
  'tl03_record_review_stage','tl03_attachment_finish','tl03_attachment_prepare',
  'tl03_attachment_remove','tl03_record_pdf_approval_stage','frt_add_comment','frt_assign_request_person',
  'frt_create_request','frt_ic_create_obligation','frt_ic_record_settlement',
  'frt_record_bank_execution','frt_request_action','frt_request_assignment','frt_restore_request','frt_save_recipient',
  'frt_set_recipient_qr','frt_set_request_filing_status','frt_submit_liquidation_v2',
  'frt_update_request_date_cas','apsyntra_crm_platform_role_set',
  'apsyntra_role_manage_user_access','apsyntra_role_configuration_propose','update_own_profile'
 ];
 const events=[];
 const auth={userId:user,accessToken:'token',authorized:async()=>({ok:true})};
 const api=new DomainApi(auth);
 api.onBoardMutation=event=>events.push(event);
 for(const name of writes)await api.rpc(name,{p_board_id:boardId});
 assert.equal(events.length,writes.length);
 assert.ok(events.every(event=>event.boardId===boardId&&event.revision===null));
});
test('native issue Edge Function writes publish only after every signed receipt is verified',async()=>{
 const events=[];let calls=0;
 const auth={userId:user,accessToken:'token',authorized:async(path,options)=>{
  calls++;assert.equal(path,'/functions/v1/apsyntra-native-issues');
  assert.equal(options.method,'POST');
  return {applied:1,receipts:[{boardId,workspaceId:workspace,revision:7}]};
 }};
 const api=new DomainApi(auth);api.onBoardMutation=event=>events.push(event);
 const result=await api.nativeTransactions(boardId,workspace,[{action:'create'}]);
 assert.equal(result.applied,1);assert.equal(calls,1);
 assert.deepEqual(events,[{boardId,revision:null}]);
});
test('native issue rejected or malformed receipts do not publish success hints',async()=>{
 for(const response of [Error('denied'),{applied:1,receipts:[{boardId,workspaceId:foreign,revision:7}]}]){
  const events=[];
  const auth={userId:user,accessToken:'token',authorized:async()=>{
   if(response instanceof Error)throw response;
   return response;
  }};
  const api=new DomainApi(auth);api.onBoardMutation=event=>events.push(event);
  await assert.rejects(()=>api.nativeTransactions(boardId,workspace,[{action:'create'}]));
  assert.deepEqual(events,[]);
 }
});
test('overview board item totals use the refreshed signed board-list snapshot',async()=>{
 let itemCount=3,reads=0;
 const auth={userId:user,accessToken:'token',authorized:async(path)=>{
  assert.ok(path.endsWith('/wm_list_boards'));reads++;
  return [{id:boardId,item_count:itemCount,workspace_id:workspace}];
 }};
 const api=new DomainApi(auth);
 const first=await api.boards('active');
 itemCount=4;api.invalidateBoardCache();
 const second=await api.boards('active');
 assert.equal(first[0].item_count,3);assert.equal(second[0].item_count,4);
 assert.equal(reads,2);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/let changedBoards=refreshBoardCatalog&&!nativeModuleId&&JSON\.stringify\(state\.boards\)!==JSON\.stringify\(boards\)/);
 assert.match(app,/if\(refreshBoardCatalog&&!nativeModuleId\)state\.boards=boards/);
 assert.match(app,/if\(changedBoards\|\|roleChanged\|\|reason!=='broadcast'\)render\(\)/);
});
test('all native global-search read RPCs preserve cached Board snapshots',async()=>{
 const names=[
  'tl03_documents_page','tl03_document_read','tl03_document_history','tl03_document_revision_bundle',
  'tl03_assigned_documents','wm_ws01_list','frt_bootstrap','frt_board_list_safe',
  'frt_board_dashboard_safe','frt_liquidation_aging_company','frt_archive_list','frt_archive_list',
  'frt_restricted_request_detail','frt_ic_snapshot',
  'list_module_state','timetracker_ot_snapshot','timetracker_attendance_capabilities',
  'timetracker_board_private_snapshot','timetracker_team_directory_snapshot',
  'timetracker_gps_snapshot','timetracker_monitor_snapshot',
  'has_module_access','list_module_directory','fueltrack_v3_read',
  'tool_traceability_list_tools','tool_traceability_list_requests',
  'tool_traceability_get_item','toolbox_issues_list_issues','toolbox_issues_get_issue',
  'material_request_hub_list_requests','material_request_hub_get_request',
  'employee_evaluation_management_snapshot','employee_evaluation_my_snapshot',
  'charter_dispatch','fm1_list_tickets_v1','fm1_ticket_detail_v1'
 ];
 const auth={userId:user,accessToken:'token',authorized:async()=>({ok:true})};
 const api=new DomainApi(auth);
 api.boardReadCache.set(boardId,{value:{board:{id:boardId,updated_at:'2026-11-16T00:00:00Z'}}});
 const generation=api.boardReadGeneration;
 for(const name of names)await api.rpc(name,{});
 assert.equal(api.boardReadCache.has(boardId),true);
 assert.equal(api.boardReadGeneration,generation);
});

test('workspace and TradeLink read RPCs cannot invalidate an in-flight board hydration',async()=>{
 let releaseShell;
 const shellPending=new Promise(resolve=>{releaseShell=resolve;});
 const auth={userId:user,accessToken:'token',authorized:async(path)=>{
  if(path.endsWith('/wm_get_board_shell'))return shellPending;
  if(path.endsWith('/wm_get_board_items_page'))
   return {items:[],values:[],has_more:false,next_cursor:null};
  if(path.endsWith('/wm_ws01_list'))
   return {schemaVersion:1,userId:user,activeWorkspaceId:workspace,rows:[]};
  if(path.endsWith('/tl03_assigned_documents'))return [];
  throw Error('Unexpected RPC: '+path);
 }};
 const api=new DomainApi(auth);
 const hydration=api.board(boardId);
 await Promise.resolve();
 const generation=api.boardReadGeneration;
 await api.rpc('wm_ws01_list',{});
 await api.rpc('tl03_assigned_documents',{p_board_id:boardId,p_limit:50});
 assert.equal(api.boardReadGeneration,generation);
 releaseShell({board:{id:boardId,workspace_id:workspace},groups:[],members:[],columns:[]});
 const board=await hydration;
 assert.equal(board.board.id,boardId);
 assert.equal(api.boardReadGeneration,generation);
});

test('reviewed mutation and read RPC contracts remain disjoint',()=>{
 const source=readFileSync(new URL('../data.js',import.meta.url),'utf8');
 const names=key=>{
  const block=source.match(new RegExp('const '+key+'=new Set\\(\\[([\\s\\S]*?)\\]\\);'))?.[1]||'';
  return [...block.matchAll(/'([^']+)'/g)].map(match=>match[1]);
 };
 const reads=new Set(names('BOARD_READ_RPC'));
 const writes=names('BOARD_MUTATION_RPC');
 assert.equal(writes.length,78); // Native TalkBox archive, subtask removal and attachment registration invalidate cached reads.
 for(const name of ['toolbox_issues_create_issue','toolbox_issues_update_issue','toolbox_issues_add_update','toolbox_issues_create_subitem','toolbox_issues_update_subitem',
  'toolbox_issues_archive_issue','toolbox_issues_delete_subitem',
  'toolbox_issues_register_attachment',
  'toolbox_issues_reply_update','toolbox_issues_unregister_attachment'])
  assert.ok(writes.includes(name),'TalkBox writes must invalidate only after commit');
 assert.equal(new Set(writes).size,writes.length);
 assert.deepEqual(writes.filter(name=>reads.has(name)),[]);
 assert.ok(writes.includes('frt_add_comment'));
 assert.ok(reads.has('frt_bank_execution_snapshot'));
});
test('real BroadcastChannel transports invalidation between independent signed clients',async t=>{
 if(typeof BroadcastChannel!=='function'){t.skip('BroadcastChannel is unavailable in this Node runtime');return;}
 const authA={userId:user,isSignedIn:true},authB={userId:user,isSignedIn:true};
 const sender=new BoardCacheChannel({auth:authA,sender:'node-tab-a'});
 let resolve;const received=new Promise(done=>{resolve=done;});
 const receiver=new BoardCacheChannel({auth:authB,sender:'node-tab-b',onInvalidate:resolve});
 sender.start(scope);receiver.start(scope);
 try{
  assert.equal(sender.publish(boardId,null),true);
  const event=await Promise.race([received,new Promise((_,reject)=>setTimeout(()=>reject(Error('BroadcastChannel delivery timeout')),500))]);
  assert.deepEqual(event,{boardId,revision:null,...scope});
 }finally{sender.stop();receiver.stop();}
});
test('read-only receipt preparation remains excluded from mutation broadcasts',async()=>{
 let events=0;
 const auth={userId:user,accessToken:'token',authorized:async()=>({ready:true})};
 const api=new DomainApi(auth);api.onBoardMutation=()=>events++;
 await api.rpc('fueltrack_v3_receipt_prepare',{p_board_id:boardId});
 assert.equal(events,0);
});
test('UI hooks source-cache invalidation into signed reconciliation and lifecycle',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/boardCacheChannel\.start\(\{userId:state\.context\?\.user_id,workspaceId:state\.context\?\.workspace_id\}\)/);
 assert.match(app,/onInvalidate:\(\{boardId,revision,userId,workspaceId\}\)=>\{/);
 assert.match(app,/db\.invalidateBoardCache\(boardId,\{revision\}\)/);
 assert.match(app,/reconcilePlatformSync\(\{boardIds:/);
 assert.ok(app.includes('onMutation:()=>boardCacheChannel.publish(state.boardId,null)'));
 assert.ok(app.includes('boardCacheChannel.publish(null,null)'));
 assert.match(app,/container:root\.querySelector\('#fueltrans-native-host'\),auth,api:db/);
 assert.ok(app.includes('refresh:true,onMutation:()=>boardCacheChannel.publish(boardId,null)'));
 assert.match(app,/window\.addEventListener\('focus',\(\)=>platformSync\.focusChanged\(\)\)/);
 assert.match(app,/window\.addEventListener\('pageshow',event=>\{\s*if\(event\.persisted\)platformSync\.focusChanged\(\)/);
 assert.doesNotMatch(app,/if\(state\.view==='board'&&\(boardId===null\|\|boardId===state\.boardId\)\)/);
 assert.match(app,/if\(tab==='fueltrack'&&boardId===FUELTRACK_V3_ID\)\{[\s\S]*?await loadFuelTrackBackend\(serial\)[\s\S]*?await loadFuelTrackActivity\(serial\)/);
 assert.match(app,/if\(tab==='tradelink'&&boardId===TRADELINK_BOARD_ID\)\{/);
 assert.match(app,/await loadTradeLinkActivity\(serial\)/);
 assert.match(app,/await loadTradeLinkDrafts\(serial\)/);
 assert.match(app,/tradeLinkDraftHasUnsavedChanges\(state\.tradeLinkDraft\)/);
 assert.match(app,/state\.fuelTrackBackendBusy\|\|state\.fuelTrackActivityBusy/);
 assert.match(app,/state\.mrhAddView&&state\.tab==='sourcing'/);
 assert.match(app,/auth\.onExpired=\(\)=>\{boardCacheChannel\.stop\(\)/);
 assert.doesNotMatch(readFileSync(new URL('../board/cache-channel.js',import.meta.url),'utf8'),/localStorage|sessionStorage|indexedDB/);
});

test('signed role snapshots do not invalidate unrelated Board cache',async()=>{
 let hints=0,reads=[];
 const api=new DomainApi({userId:user,accessToken:'signed-token',authorized:async(path)=>{
  reads.push(path.split('/').at(-1));return {adminVerified:true};
 }});
 api.onBoardMutation=()=>hints++;
 const names=['apsyntra_role_user_management_snapshot','apsyntra_role_configuration_snapshot',
  'apsyntra_crm_platform_role_snapshot','apsyntra_role_fueltrans_workspace_snapshot',
  'apsyntra_role_tooltrace_workspace_snapshot','apsyntra_role_frt_workspace_snapshot',
  'apsyntra_role_scoped_six_snapshot','apsyntra_role_charter_workspace_snapshot'];
 const generation=api.boardReadGeneration;
 for(const name of names)await api.rpc(name,{p_workspace_id:workspace});
 assert.deepEqual(reads,names);
 assert.equal(api.boardReadGeneration,generation);
 assert.equal(hints,0);
});
test('scoped role writes publish post-success hints but never on denied responses',async()=>{
 const hints=[],calls=[];
 const api=new DomainApi({userId:user,accessToken:'signed-token',authorized:async(path,options)=>{
  const name=path.split('/').at(-1);calls.push({name,kind:options.requestKind});
  if(options.body?.p_role==='DENIED')throw Object.assign(Error('denied'),{status:403});
  return {effective:true};
 }});
 api.onBoardMutation=hint=>hints.push(hint);
 const names=['apsyntra_role_fueltrans_workspace_set','apsyntra_role_tooltrace_workspace_set',
  'apsyntra_role_frt_workspace_set','apsyntra_role_scoped_six_set',
  'apsyntra_role_charter_workspace_set'];
 const generation=api.boardReadGeneration;
 for(const name of names)await api.rpc(name,{p_workspace_id:workspace,p_role:'User'});
 assert.equal(api.boardReadGeneration,generation+names.length);
 assert.deepEqual(hints,names.map(()=>({boardId:null,revision:null})));
 assert.deepEqual(calls.map(c=>c.kind),names.map(()=>'mutation'));
 await assert.rejects(api.rpc(names[0],{p_workspace_id:workspace,p_role:'DENIED'}));
 assert.equal(hints.length,names.length);
});
