import test from 'node:test';
import assert from 'node:assert/strict';
import {planBoardColumnRemoval} from '../board-column-removal-plan.js';
test('empty columns use existing signed deletion contract',()=>{
 assert.deepEqual(planBoardColumnRemoval({storedCount:0}),
  {kind:'delete-empty',submitLabel:'Delete empty column'});
 assert.deepEqual(planBoardColumnRemoval({storedCount:0,recoveryReady:true}),
  {kind:'delete-empty',submitLabel:'Delete empty column'});
});
test('populated columns use reversible, labeled view hiding while recovery is unavailable',()=>{
 assert.deepEqual(planBoardColumnRemoval({storedCount:1}),
  {kind:'hide-preserve',submitLabel:'Hide column (keep data)'});
 assert.deepEqual(planBoardColumnRemoval({storedCount:400,recoveryReady:false}),
  {kind:'hide-preserve',submitLabel:'Hide column (keep data)'});
});
test('only recovery-ready and populated columns use the recoverable contract',()=>{
 assert.deepEqual(planBoardColumnRemoval({storedCount:2,recoveryReady:true}),
  {kind:'delete-recoverable',submitLabel:'Delete with recovery'});
 for(const count of [undefined,null,-1,1.5,NaN,Infinity])
  assert.throws(()=>planBoardColumnRemoval({storedCount:count}),TypeError);
});
