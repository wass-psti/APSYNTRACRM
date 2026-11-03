import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ApiError} from '../session.js';
import {genericBoardColumns} from '../board-inline-items.js';
import {
 BoardStructureClient,normalizeBoardUi,ORDINARY_VIRTUAL_COLUMNS,
 canConfigureVirtualBoardColumns,normalizeHiddenVirtualColumns,
 renderBoardStructureAdmin,setOptionalVirtualColumnVisibility
} from '../board-structure-admin.js';
const bid='11111111-1111-4111-8111-111111111111';
const wid='22222222-2222-4222-8222-222222222222';
const uid='33333333-3333-4333-8333-333333333333';
const colid='44444444-4444-4444-8444-444444444444';
const board={id:bid,workspace_id:wid,name:'Contacts',description:'',
 status:'active',updated_at:'2026-11-03T08:00:00Z'};
const detail={board,columns:[{id:colid,name:'Team comment',column_key:'custom:note',
 system_key:null,data_type:'text',position:0,visible:true}],items:[
 {id:'55555555-5555-4555-8555-555555555555',title:'Contact',status:'not_started'}
]};
const tabs=[{key:'items',label:'Board items',visible:true},{key:'issues',label:'APSYNTRA Issues',visible:true}];
const raw=(hidden=[])=>({board_id:bid,revision:3,primary_label:'Title',
 tabs:[{...tabs[0],...(hidden.length?{hidden_virtual_columns:hidden}:{})},tabs[1]],column_labels:{}});
function harness({manage=true,foreign=false,protectedBoard=false,schemaMode='legacy'}={}){
 const calls=[];
 const auth={userId:uid,getVerifiedUser:async()=>({id:uid})};
 const live=protectedBoard?{...board,name:'TimeTracker Attendance',
  description:'[APSYNTRA:MODULE:timetracker:v1] Restricted'}:board;
 const api={context:async()=>({user_id:uid,workspace_id:foreign?
  '66666666-6666-4666-8666-666666666666':wid,profile:{status:'active'}}),
  allowed:async(_,role)=>role==='manage'&&manage,
  board:async()=>({...detail,board:live}),
  rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='wm_board_ui_save')
    return {...raw(args.p_tabs[0].hidden_virtual_columns||[]),revision:4,
      primary_label:args.p_primary_label,tabs:args.p_tabs};
   if(name==='wm_board_ui_read')
    return schemaMode==='item_only_v1'?
     {...raw(),tabs:[{...tabs[0],schema_mode:'item_only_v1'},tabs[1]]}:raw();
   throw Error('Unexpected RPC '+name);
  }};
 return {api,auth,calls};
}
test('only primary Title remains mandatory when all ordinary virtual display columns are removed',()=>{
 assert.deepEqual(ORDINARY_VIRTUAL_COLUMNS.map(x=>x.key),['status','owner','due','actions']);
 assert.equal(canConfigureVirtualBoardColumns(board),true);
 const standard=genericBoardColumns(detail,{primaryTitle:'Title',
  hiddenVirtual:['status','owner','due','actions']});
 assert.deepEqual(standard.map(x=>x.key),['record','col:'+colid]);
 assert.equal(standard[0].title,'Title');
 assert.equal(standard[1].title,'Team comment');
 assert.deepEqual(genericBoardColumns(detail,{primaryTitle:'Title',hiddenVirtual:['owner']})
  .map(x=>x.key),['record','status','due','col:'+colid,'actions']);
 assert.deepEqual(genericBoardColumns(detail,{primaryTitle:'Title',minimal:true,
  hiddenVirtual:['status','owner','due','actions']}).map(x=>x.key),['record','col:'+colid]);
});
test('saved Item tab metadata restores virtual-column removals and retains title rename',()=>{
 const ui=normalizeBoardUi(raw(['status','due','actions']),bid);
 assert.deepEqual(ui.hiddenVirtual,['status','due','actions']);
 assert.equal(ui.primaryLabel,'Title');
 assert.deepEqual(normalizeHiddenVirtualColumns(['actions','owner']),['owner','actions']);
 assert.deepEqual(normalizeHiddenVirtualColumns(['status','status']),[]);
 assert.deepEqual(normalizeHiddenVirtualColumns(['invalid']),[]);
 const rpc=[];
 const client=new BoardStructureClient({allowed:async()=>true,rpc:async(name,args)=>{
  rpc.push({name,args});return {...raw(args.p_tabs[0].hidden_virtual_columns),revision:4};
 }});
 await client.save(detail,ui);
 assert.deepEqual(rpc[0].args.p_tabs[0].hidden_virtual_columns,['status','due','actions']);
 assert.equal(rpc[0].args.p_primary_label,'Title');
 assert.equal(rpc[0].args.p_expected_revision,3);
});
test('signed manager can remove and restore optional virtual fields without deleting records',async()=>{
 const h=harness(),structure=new BoardStructureClient(h.api);
 const removed=await setOptionalVirtualColumnVisibility({
  auth:h.auth,api:h.api,structure,boardId:bid,columnKey:'status',visible:false
 });
 assert.deepEqual(removed.hiddenVirtual,['status']);
 assert.equal(h.calls.filter(x=>x.name==='wm_board_ui_save').length,1);
 assert.equal(h.calls.some(x=>x.name==='wm_board_schema_mutate'),false);
 const save=h.calls.find(x=>x.name==='wm_board_ui_save');
 assert.equal(save.args.p_expected_revision,3);
 assert.equal(save.args.p_tabs[0].hidden_virtual_columns[0],'status');
 assert.equal(h.calls.some(x=>x.name==='wm_delete_board_item'),false);
 const restore=await setOptionalVirtualColumnVisibility({
  auth:h.auth,api:h.api,structure,boardId:bid,columnKey:'status',visible:true
 });
 assert.deepEqual(restore.hiddenVirtual,[]);
});
test('foreign workspace, denied manager and protected modules cannot modify optional columns',async()=>{
 for(const config of [{foreign:true},{manage:false},{protectedBoard:true}]){
  const h=harness(config);
  await assert.rejects(()=>setOptionalVirtualColumnVisibility({
   auth:h.auth,api:h.api,structure:new BoardStructureClient(h.api),
   boardId:bid,columnKey:'owner',visible:false
  }),e=>e instanceof ApiError&&e.status===403);
  assert.equal(h.calls.filter(x=>x.name==='wm_board_ui_save').length,0);
 }
 const h=harness({schemaMode:'item_only_v1'});
 await assert.rejects(()=>setOptionalVirtualColumnVisibility({
  auth:h.auth,api:h.api,structure:new BoardStructureClient(h.api),
  boardId:bid,columnKey:'status',visible:false
 }),/already excluded/);
});
test('invalid metadata and deletion of Title are rejected by signed settings API',async()=>{
 const h=harness(),structure=new BoardStructureClient(h.api);
 await assert.rejects(()=>setOptionalVirtualColumnVisibility({
  auth:h.auth,api:h.api,structure,boardId:bid,columnKey:'record',visible:false
 }),/Invalid optional-column/);
 const settings=normalizeBoardUi(raw(),bid);
 await assert.rejects(()=>structure.save(detail,{...settings,hiddenVirtual:['record']}),/Invalid or protected/);
 assert.equal(h.calls.filter(x=>x.name==='wm_board_ui_save').length,0);
});
test('manager-only UI explicitly identifies reversible virtual removals, not physical deletion',()=>{
 const html=renderBoardStructureAdmin(detail,normalizeBoardUi(raw(),bid),
  {canManage:true,availableTabs:[{key:'items',title:'Board items'}]});
 for(const x of ['status','owner','due','actions'])
  assert.match(html,new RegExp('data-structure-virtual-toggle="'+x+'"'));
 assert.match(html,/Remove these virtual columns/);
 assert.doesNotMatch(html,/data-structure-virtual-toggle="record"/);
 const nonManager=renderBoardStructureAdmin(detail,normalizeBoardUi(raw(),bid),
  {canManage:false,availableTabs:[{key:'items',title:'Board items'}]});
 assert.doesNotMatch(nonManager,/data-structure-virtual-toggle/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/setOptionalVirtualColumnVisibility\(/);
 assert.match(app,/hiddenVirtual:state\.boardUi\?\.hiddenVirtual/);
});
test('bulk buttons request on-demand signed verification instead of permanent disabled state',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const b=app.slice(app.indexOf('function canRequestBulk('),app.indexOf('function groupHeading('));
 assert.match(b,/itemSelection\.size>0&&itemSelection\.size<=50/);
 const verify=app.slice(app.indexOf('async function ensureSignedBulkReady('),
  app.indexOf('function canRequestBulk('));
 assert.match(verify,/probeBulk02SignedSession/);
 assert.match(verify,/result\.ready/);
 assert.match(verify,/boardBulkClient\.enabled=true/);
 assert.match(verify,/clearBulkActivation/);
 for(const name of ["bulk-status","bulk-archive"]){
  const match=app.indexOf("case '"+name+"':{");
  assert.ok(match>=0);
  const action=app.slice(match,match+350);
  assert.match(action,/ensureSignedBulkReady/);
 }
 assert.match(app,/data-action="bulk-status" \$\{canRequestBulk\(b\)/);
 assert.match(app,/data-action="bulk-archive" \$\{canRequestBulk\(b\)/);
});
