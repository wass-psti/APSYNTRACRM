import test from 'node:test';
import assert from 'node:assert/strict';
import {DomainApi} from '../data.js';
import {boardPaginationStatus} from '../board/presentation/pagination-ui.js';

const USER='11111111-1111-4111-8111-111111111111';
const WORKSPACE='22222222-2222-4222-8222-222222222222';
const BOARD='33333333-3333-4333-8333-333333333333';
const GROUP='44444444-4444-4444-8444-444444444444';
const itemId=index=>'50000000-0000-4000-8000-'+String(index+1).padStart(12,'0');
const makeItems=(count)=>Array.from({length:count},(_,index)=>({
 id:itemId(index),board_id:BOARD,group_id:GROUP,title:'Record '+(index+1),
 position:index,archived_at:null
}));
const shell=(groups=[{id:GROUP,board_id:BOARD,title:'Main Group',position:0}])=>({
 board:{id:BOARD,workspace_id:WORKSPACE,name:'Count QA',
 status:'active',updated_at:'2026-11-15T00:00:00Z'},
 groups,members:[],columns:[]});
const countPayload=(total,active=total,archived=total-active)=>({
 total_count:total,active_count:active,archived_count:archived,
 groups:total?[{group_id:GROUP,total_count:total,active_count:active,archived_count:archived}]:[]
});
function apiFor({items=makeItems(320),counts=countPayload(items.length),secondPageItems=null,
 groups=[{id:GROUP,board_id:BOARD,title:'Main Group',position:0}]}={}){
 const auth={userId:USER,accessToken:'signed-test-token'};
 const api=new DomainApi(auth);let nextCalls=0;
 api.rpc=async(name,args={})=>{
  if(name==='wm_get_board_shell')return shell(groups);
  if(name!=='wm_get_board_items_page')throw Error('Unexpected RPC '+name);
  if(args.p_after_position==null)return {
   items:items.slice(0,200),values:[],has_more:items.length>200,
   next_cursor:items.length>200?{position:199,id:items[199].id}:null,counts
  };
  nextCalls++;
  const remaining=secondPageItems??items.slice(200);
  return {items:remaining,values:[],has_more:false,next_cursor:null,counts:null};
 };
 return {api,auth,nextCalls:()=>nextCalls};
}

test('first page exposes authoritative total and distinct loaded/remaining counts',async()=>{
 const f=apiFor();
 const detail=await f.api.boardCached(BOARD,{userId:USER,workspaceId:WORKSPACE});
 assert.equal(detail.items.length,200);
 assert.equal(detail.pagination.loaded_count,200);
 assert.equal(detail.pagination.total_count,320);
 assert.equal(detail.pagination.remaining_count,120);
 assert.equal(detail.pagination.active_count,320);
 assert.equal(detail.pagination.archived_count,0);
 assert.equal(detail.board.item_count,320);
 assert.equal(detail.board.total_item_count,320);
 assert.equal(detail.groups[0].total_item_count,320);
 assert.equal(detail.groups[0].active_item_count,320);
 assert.equal(detail.groups[0].archived_item_count,0);
});

test('next page reconciles to total and preserves one stable ordered dataset',async()=>{
 const f=apiFor();
 await f.api.boardCached(BOARD,{userId:USER,workspaceId:WORKSPACE});
 const detail=await f.api.boardNextPage(BOARD,{userId:USER,workspaceId:WORKSPACE});
 assert.equal(f.nextCalls(),1);
 assert.equal(detail.items.length,320);
 assert.equal(new Set(detail.items.map(item=>item.id)).size,320);
 assert.equal(detail.pagination.loaded_count,320);
 assert.equal(detail.pagination.remaining_count,0);
 assert.equal(detail.pagination.has_more,false);
 assert.equal(detail.pagination.total_count,320);
});

test('complete hydration reconciles every page to the same authoritative total',async()=>{
 const f=apiFor();
 const detail=await f.api.board(BOARD);
 assert.equal(detail.items.length,320);
 assert.equal(detail.pagination.total_count,320);
 assert.equal(detail.pagination.remaining_count,0);
});

test('board and group counts include archived records without mixing active counts',async()=>{
 const items=makeItems(200);items[199].archived_at='2026-11-01T00:00:00Z';
 const f=apiFor({items,counts:countPayload(200,199,1)});
 const detail=await f.api.board(BOARD,{complete:false});
 assert.equal(detail.pagination.total_count,200);
 assert.equal(detail.pagination.active_count,199);
 assert.equal(detail.pagination.archived_count,1);
 assert.equal(detail.pagination.loaded_active_count,199);
 assert.equal(detail.pagination.loaded_archived_count,1);
 assert.equal(detail.board.item_count,199);
 assert.equal(detail.board.archived_item_count,1);
 assert.equal(detail.groups[0].total_item_count,200);
 assert.equal(detail.groups[0].active_item_count,199);
 assert.equal(detail.groups[0].archived_item_count,1);
});

test('inconsistent group aggregates are rejected instead of displaying a false total',async()=>{
 const f=apiFor({items:makeItems(200),counts:{...countPayload(200),groups:[{
  group_id:GROUP,total_count:199,active_count:199,archived_count:0
 }]}});
 await assert.rejects(()=>f.api.board(BOARD,{complete:false}),error=>error.code==='BOARD_COUNT_MISMATCH');
});

test('a terminal page that cannot reconcile with the initial total is rejected',async()=>{
 const f=apiFor({items:makeItems(201),counts:countPayload(201),secondPageItems:[]});
 await f.api.boardCached(BOARD,{userId:USER,workspaceId:WORKSPACE});
 await assert.rejects(()=>f.api.boardNextPage(BOARD,{userId:USER,workspaceId:WORKSPACE}),
  error=>error.code==='BOARD_COUNT_MISMATCH');
});

test('terminal pages reject active/archive drift even when the total row count is unchanged',async()=>{
 const items=makeItems(201);
 const expected=countPayload(201,200,1);
 const changedSecondPage=items.slice(200).map(item=>({...item,archived_at:null}));
 const f=apiFor({items,counts:expected,secondPageItems:changedSecondPage});
 await f.api.boardCached(BOARD,{userId:USER,workspaceId:WORKSPACE});
 await assert.rejects(()=>f.api.boardNextPage(BOARD,{userId:USER,workspaceId:WORKSPACE}),
  error=>error.code==='BOARD_COUNT_MISMATCH');
});

test('complete hydration rejects group redistribution despite an unchanged board total',async()=>{
 const items=makeItems(201);
 const otherGroup='55555555-5555-4555-8555-555555555555';
 const counts=countPayload(201);
 const changedSecondPage=items.slice(200).map(item=>({...item,group_id:otherGroup}));
 const f=apiFor({items,counts,secondPageItems:changedSecondPage,groups:[
  {id:GROUP,board_id:BOARD,title:'Main Group',position:0},
  {id:otherGroup,board_id:BOARD,title:'Second Group',position:1}
 ]});
 await assert.rejects(()=>f.api.board(BOARD),error=>error.code==='BOARD_COUNT_MISMATCH');
});

test('pagination status distinguishes visible, loaded, remaining and total records',()=>{
 assert.equal(boardPaginationStatus({loaded_count:200,total_count:320,remaining_count:120,
  active_count:319,archived_count:1}),
  'Showing 200 of 320 items · 120 more available (319 active, 1 archived)');
 assert.equal(boardPaginationStatus({loaded_count:200,has_more:true}),
  'Showing 200 items · More available');
});
