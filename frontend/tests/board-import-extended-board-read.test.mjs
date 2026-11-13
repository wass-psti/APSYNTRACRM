import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DomainApi} from '../data.js';

const board='11111111-1111-4111-8111-111111111111';
const item='22222222-2222-4222-8222-222222222222';
const column='33333333-3333-4333-8333-333333333333';
const shell={board:{id:board,workspace_id:'44444444-4444-4444-8444-444444444444'},
 groups:[],members:[],columns:[{id:column}]};
const page={items:[{id:item,board_id:board,position:0,title:'Imported item'}],
 values:[],has_more:false,next_cursor:null};
function fixture(refs=[]) {
 const calls=[];
 const api=new DomainApi({});
 api.rpc=async(name,args)=>{
  calls.push({name,args});
  if(name==='wm_get_board_shell')return structuredClone(shell);
  if(name==='wm_get_board_items_page')return structuredClone(page);
  if(name==='wm_import_extended_refs_read')return structuredClone(refs);
  throw new Error('Unexpected RPC '+name);
 };
 return {api,calls};
}

test('normal board reads use shell and one bounded page without extended-reference processing',async()=>{
 const {api,calls}=fixture([{item_id:item,column_id:column,value:'https://example.invalid/'+ 'x'.repeat(7200)}]);
 const detail=await api.board(board);
 assert.deepEqual(detail.items,page.items);
 assert.deepEqual(detail.values,[]);
 assert.deepEqual(calls.map(call=>call.name),['wm_get_board_shell','wm_get_board_items_page']);
 assert.equal(api.extendedRefsSupported,null);
});

test('import wizard explicitly opts into extended references and merges them without truncation',async()=>{
 const long='https://example.invalid/'+ 'x'.repeat(7200);
 const {api,calls}=fixture([{item_id:item,column_id:column,value:long}]);
 const detail=await api.board(board,{includeExtendedRefs:true});
 assert.equal(detail.values[0].value,long);
 assert.deepEqual(calls.map(call=>call.name),[
  'wm_get_board_shell','wm_get_board_items_page','wm_import_extended_refs_read'
 ]);
 assert.equal(api.extendedRefsSupported,true);
});

test('import verification explicitly retrieves extended references',async()=>{
 const {api,calls}=fixture([{item_id:item,column_id:column,value:'https://example.invalid/verified'}]);
 const detail=await api.board(board,{importVerification:true});
 assert.equal(detail.values[0].value,'https://example.invalid/verified');
 assert.equal(calls.at(-1).name,'wm_import_extended_refs_read');
});

test('missing optional extended-reference RPC is remembered only after an import-specific read',async()=>{
 const {api,calls}=fixture();
 api.rpc=async(name,args)=>{
  calls.push({name,args});
  if(name==='wm_get_board_shell')return structuredClone(shell);
  if(name==='wm_get_board_items_page')return structuredClone(page);
  const error=new Error('Unknown RPC');error.status=404;error.code='PGRST202';throw error;
 };
 assert.deepEqual((await api.board(board)).values,[]);
 assert.equal(api.extendedRefsSupported,null);
 assert.deepEqual((await api.board(board,{includeExtendedRefs:true})).values,[]);
 assert.deepEqual((await api.board(board,{includeExtendedRefs:true})).values,[]);
 assert.equal(calls.filter(call=>call.name==='wm_import_extended_refs_read').length,1);
 assert.equal(api.extendedRefsSupported,false);
});

test('denied import-specific extended-reference reads never fall back to incomplete board data',async()=>{
 const {api}=fixture();
 api.rpc=async(name)=>{
  if(name==='wm_get_board_shell')return structuredClone(shell);
  if(name==='wm_get_board_items_page')return structuredClone(page);
  throw Object.assign(new Error('Access denied'),{status:403});
 };
 await assert.rejects(()=>api.board(board,{includeExtendedRefs:true}),/Access denied/);
});

test('extended references must match an existing item and column and cannot overwrite a cell',async()=>{
 const {api}=fixture([{item_id:'55555555-5555-4555-8555-555555555555',column_id:column,value:'orphan'}]);
 await assert.rejects(()=>api.board(board,{includeExtendedRefs:true}),/does not match/);
 const duplicate=fixture([{item_id:item,column_id:column,value:'conflict'}]);
 duplicate.api.rpc=async name=>{
  if(name==='wm_get_board_shell')return structuredClone(shell);
  if(name==='wm_get_board_items_page')return {...structuredClone(page),values:[
   {item_id:item,column_id:column,value:'existing'}
  ]};
  return [{item_id:item,column_id:column,value:'conflict'}];
 };
 await assert.rejects(()=>duplicate.api.board(board,{includeExtendedRefs:true}),/conflicts/);
});

test('import wizard explicitly opts into import-only extended-reference retrieval',()=>{
 const source=readFileSync(new URL('../board-import-ui.js',import.meta.url),'utf8');
 assert.match(source,/api\.board\(boardId,\{includeExtendedRefs:true\}\)/);
});
