import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchTradeLinkBoardItems} from '../tradelink-application.js';
import {boardGrid,boardGridColumns,prepareBoardGrid} from '../board-grid.js';
import {
 TRADELINK_BOARD_ID,TRADELINK_WORKFLOW_STATUS,TRADELINK_QUOTE_STATUS,
 TRADELINK_FIELDS,TRADELINK_FILES_KEY,isTradeLinkBoard,tradeLinkSetupStatus,
 tradeLinkGridColumns,tradeLinkDisplayValue,configureTradeLinkColumns
} from '../tradelink-board-items.js';
const ws='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const board={id:TRADELINK_BOARD_ID,workspace_id:ws,name:'TradeLink',status:'active',
 description:'[APSYNTRA:MODULE:tradelink:v1] Trading and procurement',
 updated_at:'2026-11-04T11:00:00Z'};
const legacy={id:'33333333-3333-4333-8333-333333333333',column_key:'col_v1',
 system_key:null,name:'Source Record ID',data_type:'text',visible:true};
const fixture=()=>({board:{...board},columns:[{...legacy}],items:[],values:[]});
const names=['Item','Person','Workflow Status','Quote Status','Date','Files','Amount'];
function column(spec,id){
 return {id,column_key:'custom:'+id,system_key:null,visible:true,
  name:spec.name,data_type:spec.type,
  config:spec.options?{labels:spec.options.map((name,i)=>({
   id:'status_'+i,name,active:true,position:i}))}:{}};
}
test('TradeLink is a single verified board, not a global board-table override',()=>{
 assert.equal(isTradeLinkBoard(board),true);
 assert.equal(isTradeLinkBoard({...board,id:ws}),false);
 assert.equal(isTradeLinkBoard({...board,description:'unmanaged'}),false);
 assert.equal(isTradeLinkBoard({...board,status:'archived'}),false);
 assert.equal(tradeLinkGridColumns({board:{...board,id:ws}}),null);
 assert.deepEqual(boardGridColumns({board:{name:'Other'},columns:[]}).map(c=>c.title),
  ['Record','Status']);
});
test('seven requested labels are ordered; legacy fields stay out of the trade view',()=>{
 const detail=fixture(),cols=boardGridColumns(detail);
 assert.deepEqual(cols.map(c=>c.title),names);
 assert.equal(cols[5].key,TRADELINK_FILES_KEY);
 assert.ok(cols.slice(1,5).every(c=>c.key.startsWith('tradelink:pending-')));
 assert.deepEqual(prepareBoardGrid(detail).visibleColumns,[]);
 const html=boardGrid(detail);
 assert.match(html,/Workflow Status/);
 assert.match(html,/Quote Status/);
 assert.match(html,/Files/);
 assert.doesNotMatch(html,/Source Record ID|Source Revision|Sync State|Trade Ref/);
 assert.doesNotMatch(html,/type="file"|data-action="upload"/);
});
test('status vocabularies are exact and human labels never print internal identifiers',()=>{
 assert.deepEqual(TRADELINK_WORKFLOW_STATUS,['For Approval','Submitted','Approved','Draft']);
 assert.deepEqual(TRADELINK_QUOTE_STATUS,['Submitted','Won','Expired','Closed',
  'Under Negotiation','Delivered','Canceled','On-Hold','Lost','Working on it','Approved']);
 const c=column(TRADELINK_FIELDS[1],'44444444-4444-4444-8444-444444444444');
 assert.equal(tradeLinkDisplayValue(c,'status_2'),'Approved');
 assert.equal(tradeLinkDisplayValue(c,'unknown'),'—');
 assert.equal(tradeLinkDisplayValue({...c,data_type:'people'},user),'Assigned user');
 assert.equal(tradeLinkDisplayValue({...c,data_type:'number'},127.5),'127.5');
 assert.equal(tradeLinkDisplayValue({...c,data_type:'number'},'127.5'),'—');
 assert.equal(tradeLinkDisplayValue({...c,data_type:'date'},'2026-11-04'),'2026-11-04');
});
test('only signed board managers may add five typed fields; setup is restart-safe',async()=>{
 const detail=fixture(),calls=[];
 let index=0;
 const auth={userId:user,getVerifiedUser:async()=>({id:user})};
 const api={context:async()=>({user_id:user,workspace_id:ws,profile:{status:'active'}}),
  allowed:async(id,p)=>{calls.push(['allowed',id,p]);return true;},
  board:async()=>structuredClone(detail)};
 const structure={mutate:async(d,req)=>{
  calls.push(['mutate',req.name,req.type,req.config]);
  assert.equal(d.board.id,TRADELINK_BOARD_ID);
  const id='aaaaaaaa-aaaa-4aaa-8aaa-'+(++index).toString(16).padStart(12,'0');
  detail.columns.push(column(TRADELINK_FIELDS.find(s=>s.name===req.name),id));
  return {board_id:TRADELINK_BOARD_ID,column_id:id,action:'create'};
 }};
 const r=await configureTradeLinkColumns({auth,api,structure});
 assert.equal(r.ready,true);
 assert.equal(r.attachmentReady,false);
 assert.equal(index,5);
 assert.deepEqual(calls.filter(c=>c[0]==='mutate').map(c=>c[1]),
  ['Person','Workflow Status','Quote Status','Date','Amount']);
 assert.equal(tradeLinkSetupStatus(detail).ready,true);
 assert.deepEqual(boardGridColumns(detail).map(c=>c.title),names);
 assert.equal(boardGridColumns(detail)[5].key,TRADELINK_FILES_KEY);
 await configureTradeLinkColumns({auth,api,structure});
 assert.equal(index,5,'second setup must not duplicate columns');
 assert.equal(detail.columns.find(c=>c.name==='Source Record ID').id,legacy.id);
});
test('denied, changed workspace, nonempty board and incompatible status options fail closed',async()=>{
 const auth={userId:user,getVerifiedUser:async()=>({id:user})};
 const detail=fixture();
 let mutations=0;
 const structure={mutate:async()=>{mutations++;}};
 const api={context:async()=>({user_id:user,workspace_id:ws,profile:{status:'active'}}),
  allowed:async()=>false,board:async()=>structuredClone(detail)};
 await assert.rejects(()=>configureTradeLinkColumns({auth,api,structure}),/permission/);
 api.allowed=async()=>true;
 api.context=async()=>({user_id:user,workspace_id:'99999999-9999-4999-8999-999999999999',
  profile:{status:'active'}});
 await assert.rejects(()=>configureTradeLinkColumns({auth,api,structure}),/workspace/);
 api.context=async()=>({user_id:user,workspace_id:ws,profile:{status:'active'}});
 detail.items.push({id:ws});
 await assert.rejects(()=>configureTradeLinkColumns({auth,api,structure}),/empty-board/);
 detail.items=[];
 detail.columns.push(column(TRADELINK_FIELDS[1],ws));
 detail.columns.at(-1).config.labels[0].name='Different';
 await assert.rejects(()=>configureTradeLinkColumns({auth,api,structure}),/manual reconciliation/);
 assert.equal(mutations,1,'Person may be created before an incompatible later field is rejected');
});
test('source integration uses the existing signed CAS schema mutation, not SQL or fake uploads',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const structure=readFileSync('frontend/board-structure-admin.js','utf8');
 const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
 assert.match(app,/case 'tradelink-configure'/);
 assert.match(app,/configureTradeLinkColumns\(\{auth,api:db,structure:boardStructureClient\}\)/);
 assert.match(structure,/wm_board_schema_mutate/);
 assert.match(smoke,/frontend\/tradelink-board-items\.js/);
 assert.doesNotMatch(readFileSync('frontend/tradelink-board-items.js','utf8'),
  /storage\.from\(|deleteBoardItem\(|wm_delete_board_column/);
});

test('archived TradeLink document-linked items are hidden only from active Board presentation',()=>{
 const active={id:'99999999-9999-4999-8999-999999999999',title:'Active QA document',archived_at:null};
 const archived={id:'88888888-8888-4888-8888-888888888888',title:'CP-TL-06-QA-ESI-20261112',archived_at:'2026-11-12T07:00:00Z'};
 const detail={...fixture(),items:[archived,active]};
 assert.deepEqual(searchTradeLinkBoardItems(detail),[active]);
 assert.equal(detail.items.length,2,'server signed archived item and audit context are not removed');
 const app=readFileSync('frontend/app.js','utf8');
 const page=app.slice(app.indexOf('function boardPage(){'),app.indexOf('function settingsPage(){'));
 assert.match(page,/const items=isTradeLinkBoard\(b\)\?searchTradeLinkBoardItems\(state\.board\):/);
 assert.match(page,/Array\.isArray\(state\.board\.items\)\?state\.board\.items:\[\]/);
 assert.equal(searchTradeLinkBoardItems({...detail,board:{...board,id:ws}}).length,0,
  'helper is scoped to the exact managed TradeLink board');
});
