import test from 'node:test';
import assert from 'node:assert/strict';
import {BOARD_ITEM_PAGE_SIZE,DomainApi} from '../data.js';

const board='11111111-1111-4111-8111-111111111111';
const column='33333333-3333-4333-8333-333333333333';
const shell={board:{id:board,workspace_id:'44444444-4444-4444-8444-444444444444'},
 groups:[],members:[],columns:[{id:column}]};
const itemId=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const item=n=>({id:itemId(n),board_id:board,position:n-1,title:'Item '+n});
const emptyPage={items:[],values:[],has_more:false,next_cursor:null};

test('normal board retrieval uses shell plus bounded page and never calls legacy full-board RPC',async()=>{
 const calls=[];
 const api=new DomainApi({});
 api.rpc=async(name,args)=>{calls.push({name,args});return name==='wm_get_board_shell'?
  structuredClone(shell):structuredClone(emptyPage);};
 const detail=await api.board(board);
 assert.deepEqual(detail.board,shell.board);
 assert.deepEqual(detail.items,[]);
 assert.deepEqual(detail.values,[]);
 assert.deepEqual(calls.map(call=>call.name),[
  'wm_get_board_shell','wm_get_board_items_page'
 ]);
 assert.equal(calls[1].args.p_limit,BOARD_ITEM_PAGE_SIZE);
 assert.equal(calls[1].args.p_after_position,null);
 assert.equal(calls[1].args.p_after_id,null);
 assert.equal(calls.some(call=>call.name==='wm_get_board'),false);
});

test('keyset pagination assembles ordered items and matching cell values across pages',async()=>{
 const calls=[];
 const firstItems=Array.from({length:BOARD_ITEM_PAGE_SIZE},(_,index)=>item(index+1));
 const first={
  items:firstItems,
  values:[{item_id:firstItems[0].id,column_id:column,value:'first'}],
  has_more:true,
  next_cursor:{position:firstItems.at(-1).position,id:firstItems.at(-1).id}
 };
 const lastItem=item(BOARD_ITEM_PAGE_SIZE+1);
 const second={items:[lastItem],
  values:[{item_id:lastItem.id,column_id:column,value:'last'}],
  has_more:false,next_cursor:null};
 const api=new DomainApi({});
 api.rpc=async(name,args)=>{
  calls.push({name,args});
  if(name==='wm_get_board_shell')return structuredClone(shell);
  return calls.filter(call=>call.name==='wm_get_board_items_page').length===1?
   structuredClone(first):structuredClone(second);
 };
 const detail=await api.board(board);
 assert.equal(detail.items.length,BOARD_ITEM_PAGE_SIZE+1);
 assert.equal(detail.items[0].id,itemId(1));
 assert.equal(detail.items.at(-1).id,lastItem.id);
 assert.deepEqual(detail.values.map(value=>value.value),['first','last']);
 const pageCalls=calls.filter(call=>call.name==='wm_get_board_items_page');
 assert.equal(pageCalls.length,2);
 assert.equal(pageCalls[0].args.p_limit,BOARD_ITEM_PAGE_SIZE);
 assert.equal(pageCalls[1].args.p_after_position,firstItems.at(-1).position);
 assert.equal(pageCalls[1].args.p_after_id,firstItems.at(-1).id);
 assert.equal(pageCalls[1].args.p_limit,BOARD_ITEM_PAGE_SIZE);
});

test('malformed continuation cursor is rejected rather than silently truncating a board',async()=>{
 const firstItems=Array.from({length:BOARD_ITEM_PAGE_SIZE},(_,index)=>item(index+1));
 const api=new DomainApi({});
 api.rpc=async name=>name==='wm_get_board_shell'?structuredClone(shell):{
  items:firstItems,values:[],has_more:true,
  next_cursor:{position:999,id:itemId(999)}
 };
 await assert.rejects(()=>api.board(board),error=>error.code==='INVALID_BOARD_CURSOR');
});

test('duplicate or out-of-order items are rejected across page boundaries',async()=>{
 const firstItems=Array.from({length:BOARD_ITEM_PAGE_SIZE},(_,index)=>item(index+1));
 const api=new DomainApi({});
 let pageNumber=0;
 api.rpc=async name=>{
  if(name==='wm_get_board_shell')return structuredClone(shell);
  pageNumber++;
  if(pageNumber===1)return {items:firstItems,values:[],has_more:true,
   next_cursor:{position:199,id:firstItems.at(-1).id}};
  return {items:[firstItems.at(-1)],values:[],has_more:false,next_cursor:null};
 };
 await assert.rejects(()=>api.board(board),error=>error.code==='INVALID_BOARD_ITEM');
});

test('board invalidation during a paginated read rejects the mixed snapshot',async()=>{
 const api=new DomainApi({});
 api.rpc=async name=>{
  if(name==='wm_get_board_shell')return structuredClone(shell);
  api.boardReadGeneration++;
  return structuredClone(emptyPage);
 };
 await assert.rejects(()=>api.board(board),error=>error.code==='BOARD_READ_INVALIDATED');
});

test('extended references are not requested unless the import flow explicitly opts in',async()=>{
 const calls=[];
 const api=new DomainApi({});
 api.rpc=async name=>{
  calls.push(name);
  if(name==='wm_get_board_shell')return structuredClone(shell);
  if(name==='wm_get_board_items_page')return structuredClone(emptyPage);
  if(name==='wm_import_extended_refs_read')return [];
  throw new Error('Unexpected RPC '+name);
 };
 await api.board(board);
 assert.equal(calls.includes('wm_import_extended_refs_read'),false);
 await api.board(board,{includeExtendedRefs:true});
 assert.equal(calls.filter(name=>name==='wm_import_extended_refs_read').length,1);
});
