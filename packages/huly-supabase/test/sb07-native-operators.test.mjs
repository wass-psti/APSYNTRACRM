import test from 'node:test';
import assert from 'node:assert/strict';
import { applyIssueOperations } from '../dist/src/native-operators.js';
import { Denied } from '../dist/src/sb02.js';
const base={_id:'Issue.1',_class:'tracker:class:Issue',title:'Issue',status:'todo',priority:2,score:5,tags:['x','y'],nested:[{id:'a',score:1},{id:'b',score:2},{id:'a',score:3}],note:'before'};
test('SB07 native embedded $update matches scalar array query',()=>{
 const r=applyIssueOperations(base,{$update:{nested:{$query:{id:'a'},$update:{score:9}}}});
 assert.deepEqual(r.nested,[{id:'a',score:9},{id:'b',score:2},{id:'a',score:9}]);
 assert.equal(base.nested[0].score,1);
});
test('SB07 embedded $update denies field path, metadata and nonobject arrays',()=>{
 for(const op of [{$update:{nested:{$query:{'a.b':1},$update:{score:2}}}},{$update:{nested:{$query:{id:'a'},$update:{_id:'x'}}}},{$update:{nested:{$query:{id:{$ne:'a'}},$update:{score:2}}}},{$update:{tags:{$query:{id:'a'},$update:{score:2}}}}])assert.throws(()=>applyIssueOperations(base,op),Denied);
});
test('SB07 native $rename moves optional field without mutating original',()=>{
 const r=applyIssueOperations(base,{$rename:{note:'details'}});
 assert.equal(r.details,'before');assert.equal('note' in r,false);assert.equal(base.note,'before');
});
test('SB07 native $rename rejects metadata target, overwrite or conflicting changes',()=>{
 for(const op of [{$rename:{title:'status'}},{$rename:{title:'_id'}},{$rename:{title:'title'}},{$rename:{note:'details'},$unset:{details:true}}])assert.throws(()=>applyIssueOperations(base,op),Denied);
});
test('SB07 $push.$each default inserts at zero as native Huly operator does',()=>{
 assert.deepEqual(applyIssueOperations(base,{$push:{tags:{$each:['first']}}}).tags,['first','x','y']);
 assert.deepEqual(applyIssueOperations(base,{$push:{tags:{$each:['last'],$position:2}}}).tags,['x','y','last']);
});
test('SB07 embedded $pull matches record fields',()=>{
 assert.deepEqual(applyIssueOperations(base,{$pull:{nested:{id:'a'}}}).nested,[{id:'b',score:2}]);
});
test('SB07 $inc starts missing numeric field at zero',()=>{
 assert.equal(applyIssueOperations(base,{$inc:{newScore:4}}).newScore,4);
 assert.throws(()=>applyIssueOperations(base,{$inc:{title:2}}),Denied);
});
test('SB07 reject empty embedded queries, nested keys, unknown ops and overlap',()=>{
 for(const op of [{$update:{nested:{$query:{},$update:{score:1}}}},{$update:{nested:{$query:{id:'a'},$update:{}}}},{$update:{nested:{$query:{id:'a'},$update:{'a.b':1}}}},{$invalid:{x:1}},{$update:{nested:{$query:{id:'a'},$update:{score:1}}},$pull:{nested:{id:'a'}}}])assert.throws(()=>applyIssueOperations(base,op),Denied);
});
