import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ApiError} from '../session.js';
import {
 BOARD_STRUCTURE_ADMIN_ENABLED,BoardStructureClient,describeBoardColumns,
 normalizeBoardUi,applyBoardViewSettings,displayColumnLabel,
 renderBoardStructureAdmin
} from '../board-structure-admin.js';

const board='33333333-3333-4333-8333-333333333333';
const domain='11111111-1111-4111-8111-111111111111';
const custom='22222222-2222-4222-8222-222222222222';
const other='44444444-4444-4444-8444-444444444444';
const detail={board:{id:board,updated_at:'2026-11-03T01:00:00Z'},
 columns:[
  {id:domain,name:'Attendance Ref',column_key:'col_original',data_type:'text',
   system_key:null,visible:true},
  {id:custom,name:'Supervisor note',column_key:'custom:abc',
   data_type:'text',system_key:null,visible:true,config:{}}
 ]};
const raw={board_id:board,revision:1,primary_label:'Work item',
 tabs:[{key:'items',label:'Tasks',visible:true},{key:'attendance',label:'Clock',visible:true}],
 column_labels:{[domain]:'Attendance reference'}};
const tabs=[
 {key:'items',title:'Board items',label:'▤ Board items <span class="csp-u060">(2)</span>'},
 {key:'issues',title:'Issues',label:'◇ APSYNTRA Issues <span class="csp-u060">(1)</span>'},
 {key:'attendance',title:'TimeTracker attendance',label:'◷ TimeTracker attendance'}
];
function spy({manage=true,read=raw}={}){
 const calls=[];
 return {calls,api:{
  allowed:async(id,permission)=>{calls.push(['allowed',id,permission]);return manage;},
  rpc:async(op,args)=>{calls.push([op,args]);if(op==='wm_board_ui_read')return read;
   if(op==='wm_board_ui_save')return {...read,revision:2};
   if(op==='wm_board_schema_mutate')return {
    board_id:board,column_id:custom,action:args.p_action,updated_at:'2026-11-03T01:00:01Z'};
   throw Error('Unexpected operation: '+op); }
 }};
}
test('no production configuration calls while feature gate is disabled',async()=>{
 const s=spy(),client=new BoardStructureClient(s.api);
 assert.equal(BOARD_STRUCTURE_ADMIN_ENABLED,true);
 assert.equal((await client.read(board,{enabled:false})).status,'LOCKED');
 await assert.rejects(()=>client.save(detail,normalizeBoardUi(raw,board),{enabled:false}),/pending/);
 await assert.rejects(()=>client.mutate(detail,{action:'delete',columnId:custom,
  confirmation:'DELETE Supervisor note'},{enabled:false}),/pending/);
 assert.deepEqual(s.calls,[]);
 const html=renderBoardStructureAdmin(detail,{status:'LOCKED'},{canManage:true,availableTabs:tabs,enabled:false});
 assert.match(html,/staged but not activated/);
 assert.match(html,/Primary column — permanently protected/);
 assert.doesNotMatch(html,/data-structure-delete|columnLabel:|Supervisor note/);
});
test('primary and application columns cannot be physically deleted or retyped',async()=>{
 const columns=describeBoardColumns(detail);
 assert.equal(columns[0].key,'record');assert.equal(columns[0].deletable,false);
 assert.equal(columns[1].kind,'domain');assert.equal(columns[1].deletable,false);
 assert.equal(columns[2].kind,'custom');assert.equal(columns[2].deletable,true);
 const s=spy(),client=new BoardStructureClient(s.api);
 await assert.rejects(()=>client.mutate(detail,{action:'delete',columnId:domain,
  confirmation:'DELETE Attendance Ref'},{enabled:true}),/cannot be altered/);
 await assert.rejects(()=>client.mutate(detail,{action:'delete',columnId:null,
  confirmation:'DELETE Record'},{enabled:true}),/cannot be altered/);
 assert.deepEqual(s.calls.map(x=>x[0]),['allowed','allowed']);
});
test('manager-only permission always checks server before mutation',async()=>{
 const s=spy({manage:false}),client=new BoardStructureClient(s.api);
 await assert.rejects(()=>client.save(detail,normalizeBoardUi(raw,board),{enabled:true}),e=>e instanceof ApiError&&e.status===403);
 await assert.rejects(()=>client.mutate(detail,{action:'create',name:'New',type:'text'},{enabled:true}),/not permitted/);
 assert.equal(s.calls.some(c=>c[0]==='wm_board_ui_save'||c[0]==='wm_board_schema_mutate'),false);
});
test('signed state normalizes display-only labels and preserves immutable IDs',()=>{
 const settings=normalizeBoardUi(raw,board);
 assert.equal(settings.primaryLabel,'Work item');
 assert.equal(displayColumnLabel(settings,describeBoardColumns(detail)[0]),'Work item');
 assert.equal(displayColumnLabel(settings,describeBoardColumns(detail)[1]),'Attendance reference');
 const ordered=applyBoardViewSettings(tabs,settings);
 assert.deepEqual(ordered.map(t=>t.key),['items','attendance','issues']);
 assert.match(ordered[0].label,/Tasks/);
 assert.match(ordered[0].label,/\(2\)/);
 assert.equal(ordered.length,3);
 const hidden=applyBoardViewSettings(tabs,{...settings,
  tabs:[{key:'items',label:'Tasks',visible:true},{key:'issues',label:'Hidden',visible:false}]});
 assert.deepEqual(hidden.map(t=>t.key),['items','attendance']);
});
test('rendering escapes untrusted labels, never creates destructive primary actions',()=>{
 const settings=normalizeBoardUi({...raw,primary_label:'<img src=x onerror=1>',
  column_labels:{[domain]:'<svg onload=1>'}},board);
 const html=renderBoardStructureAdmin(detail,settings,{
  canManage:true,availableTabs:tabs,enabled:true});
 assert.match(html,/&lt;img src=x onerror=1&gt;/);
 assert.match(html,/&lt;svg onload=1&gt;/);
 assert.doesNotMatch(html,/<img src=|<svg onload=/);
 assert.equal((html.match(/data-structure-delete/g)||[]).length,1);
 assert.doesNotMatch(html,/data-structure-delete="null"|data-structure-delete="11111111/);
});
test('configured settings save uses verified revision, validated owned column labels',async()=>{
 const s=spy(),client=new BoardStructureClient(s.api);
 const managerSettings=normalizeBoardUi({...raw,
  column_labels:{[custom]:'Supervisor comment'}},board);
 const saved=await client.save(detail,managerSettings,{enabled:true});
 assert.equal(saved.revision,2);
 assert.deepEqual(s.calls.map(c=>c[0]),['allowed','wm_board_ui_save']);
 assert.equal(s.calls[1][1].p_expected_revision,1);
 assert.equal(s.calls[1][1].p_primary_label,'Work item');
 assert.equal(s.calls[1][1].p_column_labels[custom],'Supervisor comment');
 assert.equal(s.calls[1][1].p_column_labels[domain],undefined);
 await assert.rejects(()=>client.save(detail,{...normalizeBoardUi(raw,board),
  columnLabels:{[other]:'Foreign field'}},{enabled:true}),/Foreign or invalid/);
 await assert.rejects(()=>client.save(detail,{...normalizeBoardUi(raw,board),
  tabs:[{key:'items',label:'Tasks',visible:false}]},{enabled:true}),/Invalid board view/);
});
test('custom add/update/delete use one guarded signed CAS RPC only',async()=>{
 const s=spy(),client=new BoardStructureClient(s.api);
 const created=await client.mutate(detail,{action:'create',name:'Task note',
  type:'text',config:{}},{enabled:true});
 assert.equal(created.action,'create');
 const change=s.calls.find(c=>c[0]==='wm_board_schema_mutate');
 assert.equal(change[1].p_expected_updated_at,detail.board.updated_at);
 assert.equal(change[1].p_name,'Task note');
 assert.equal(change[1].p_confirm_delete,false);
 await assert.rejects(()=>client.mutate(detail,{action:'delete',columnId:custom,
  confirmation:'DELETE wrong'},{enabled:true}),/exact column deletion confirmation/);
 const deleted=await client.mutate(detail,{action:'delete',columnId:custom,
  confirmation:'DELETE Supervisor note'},{enabled:true});
 assert.equal(deleted.action,'delete');
 assert.equal(s.calls.at(-1)[1].p_confirm_delete,true);
 assert.equal(s.calls.at(-1)[1].p_column_id,custom);
 assert.equal(s.calls.some(c=>c[0]==='wm_delete_board_column'),false);
});
test('malformed signed settings fail closed instead of faking persistence',async()=>{
 for(const bad of [
  {...raw,board_id:other},{...raw,revision:-1},
  {...raw,primary_label:''},{...raw,tabs:[{key:'items',label:'Tasks',visible:'yes'}]},
  {...raw,column_labels:{[other]:{name:'unsafe'}}}
 ])assert.throws(()=>normalizeBoardUi(bad,board));
 const s=spy({read:{...raw,board_id:other}});
 await assert.rejects(()=>new BoardStructureClient(s.api).read(board,{enabled:true}));
});
test('app is wired into board options while existing item permissions remain separate',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'board-structure'/);
 assert.match(app,/BoardStructureClient/);
 assert.match(app,/state\.edit&&state\.tab==='items'/);
 assert.match(app,/async function writeGuard\(\)/);
 assert.match(app,/board-column-move/);
 assert.match(app,/loadBoard\(state\.boardId,state\.tab\)/);
 assert.doesNotMatch(app,/wm_delete_board_column\(/);
});

test('typed domain board keeps restricted projection until approved config gate',async()=>{
 const {boardGridColumns,boardGrid}=await import('../board-grid.js');
 const detail={board:{name:'TimeTracker Attendance'},columns:[
  {id:domain,name:'Attendance Ref',column_key:'col_original',data_type:'text',
   system_key:null,visible:true},
  {id:custom,name:'Supervisor note',column_key:'custom:test',data_type:'text',
   system_key:null,visible:true},
  {id:other,name:'GPS coordinates and location',column_key:'custom:test2',
   data_type:'text',system_key:null,visible:true}
 ],items:[],values:[]};
 const before=boardGridColumns(detail);
 assert.deepEqual(before.map(c=>c.title),['Record','Status','Attendance Ref']);
 const active=boardGridColumns(detail,{primaryTitle:'Work item',allowCustom:true,
  columnLabels:{[domain]:'Shift reference'}});
 assert.deepEqual(active.map(c=>c.title),['Work item','Status','Shift reference','Supervisor note']);
 const markup=boardGrid(detail,{primaryTitle:'Work item',allowCustom:true});
 assert.match(markup,/Supervisor note/);
 assert.doesNotMatch(markup,/GPS coordinates and location/);
 assert.equal(BOARD_STRUCTURE_ADMIN_ENABLED,true);
});
test('view order controls are shown only as disabled until server activation',()=>{
 const ui=renderBoardStructureAdmin(detail,normalizeBoardUi(raw,board),{
  canManage:true,availableTabs:tabs,enabled:true});
 assert.match(ui,/name="order:items"/);
 assert.match(ui,/name="order:attendance"/);
 assert.match(ui,/board-structure-tab/);
 assert.doesNotMatch(ui,/staged but not activated/);
});
test('locked or unauthorized administration does not enumerate hidden metadata',()=>{
 const context={...detail,columns:[
  ...detail.columns,
  {id:other,column_key:'col_hidden',name:'Sensitive employee identity',
   data_type:'text',system_key:null}
 ]};
 const settings=normalizeBoardUi(raw,board);
 const locked=renderBoardStructureAdmin(context,settings,{canManage:true,availableTabs:tabs,enabled:false});
 const denied=renderBoardStructureAdmin(context,settings,{
  canManage:false,availableTabs:tabs,enabled:true});
 assert.doesNotMatch(locked,/Sensitive employee identity|Attendance Ref/);
 assert.doesNotMatch(denied,/Sensitive employee identity|Attendance Ref/);
 assert.match(denied,/Only authorized board managers/);
});


test('settings writes exclude restricted module columns even for board managers',async()=>{
 const restrictedDetail={board:{...detail.board,name:'TimeTracker Attendance'},
  columns:[
   {...detail.columns[0],name:'Attendance Ref'},
   detail.columns[1],
   {id:other,name:'GPS coordinates and location',data_type:'text',
    column_key:'custom:private',system_key:null,visible:true}
  ]};
 const visible=describeBoardColumns(restrictedDetail);
 assert.equal(visible.some(col=>col.id===other),false);
 const settings={...normalizeBoardUi(raw,board),
  columnLabels:{[domain]:'Attendance reference',[other]:'Should not reach server'}};
 const s=spy(),client=new BoardStructureClient(s.api);
 await assert.rejects(()=>client.save(restrictedDetail,settings,{enabled:true}),/Foreign or invalid/);
 assert.equal(s.calls.some(call=>call[0]==='wm_board_ui_save'),false);
});

test('first-run board configuration accepts empty preferences without hiding existing views',()=>{
 const initial=normalizeBoardUi({
  board_id:board,revision:0,primary_label:'Record',tabs:[],column_labels:{}
 },board);
 assert.equal(initial.status,'VERIFIED_READ');
 assert.equal(initial.revision,0);
 assert.deepEqual(applyBoardViewSettings(tabs,initial),tabs);
 assert.equal(displayColumnLabel(initial,describeBoardColumns(detail)[0]),'Record');
});
test('manager save forbids persisted domain-label overrides and marks inputs protected',async()=>{
 const clientSpy=spy(),client=new BoardStructureClient(clientSpy.api);
 const domainSettings=normalizeBoardUi({...raw,
  column_labels:{[domain]:'Change system field label'}},board);
 await assert.rejects(()=>client.save(detail,domainSettings,{enabled:true}),
  /Foreign or invalid column label/);
 assert.equal(clientSpy.calls.some(c=>c[0]==='wm_board_ui_save'),false);
 const html=renderBoardStructureAdmin(detail,normalizeBoardUi({...raw,
  column_labels:{[custom]:'Note display'}},board),{
   canManage:true,availableTabs:tabs,enabled:true
  });
 assert.match(html,/application schema — protected/);
 assert.doesNotMatch(html,/name="columnLabel:11111111-1111-4111-8111-111111111111"/);
 assert.match(html,/name="columnLabel:22222222-2222-4222-8222-222222222222"/);
});

test('enabled configuration initializes from live zero-revision settings without hiding existing tabs',async()=>{
 const response={board_id:board,revision:0,primary_label:'Record',tabs:[],column_labels:{}};
 const backend=spy({read:response}),client=new BoardStructureClient(backend.api);
 const config=await client.read(board);
 assert.equal(config.status,'VERIFIED_READ');
 assert.equal(config.revision,0);
 assert.deepEqual(applyBoardViewSettings(tabs,config),tabs);
 assert.deepEqual(backend.calls.map(call=>call[0]),['wm_board_ui_read']);
 const html=renderBoardStructureAdmin(detail,config,{canManage:true,availableTabs:tabs});
 assert.match(html,/data-structure-form="create"/);
 assert.match(html,/Save board display settings/);
 assert.doesNotMatch(html,/staged but not activated/);
});
test('enabled configuration denies editor control rendering while preserving board item operations',()=>{
 const ui=normalizeBoardUi({board_id:board,revision:0,
  primary_label:'Record',tabs:[],column_labels:{}},board);
 const html=renderBoardStructureAdmin(detail,ui,{canManage:false,availableTabs:tabs});
 assert.match(html,/Only authorized board managers/);
 assert.doesNotMatch(html,/data-structure-form|data-structure-delete|Supervisor note/);
});
