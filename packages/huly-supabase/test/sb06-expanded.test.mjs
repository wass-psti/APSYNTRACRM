import test from 'node:test';
import assert from 'node:assert/strict';
import {applyIssueOperations} from '../dist/src/native-operators.js';
import {NativeHulyIssueGateway,HULY_TX_REMOVE,HULY_ISSUE} from '../dist/src/native-huly.js';
import {HulyTransactionGateway} from '../dist/src/transactions.js';
import {Denied} from '../dist/src/sb02.js';
const U='11111111-1111-4111-8111-111111111111',W='22222222-2222-4222-8222-222222222222',B='33333333-3333-4333-8333-333333333333';
const snap={_id:'Issue.1',_class:HULY_ISSUE,space:'tracker:space:Project',title:'Test',status:'todo',priority:2,estimation:3,tags:['a','b']};
test('numeric $inc does not mutate source',()=>{assert.equal(applyIssueOperations(snap,{$inc:{estimation:4}}).estimation,7);assert.equal(snap.estimation,3)});
test('$push with position and $pull with $in',()=>{const v=applyIssueOperations(snap,{$push:{tags:{$each:['z'],$position:1}}});assert.deepEqual(v.tags,['a','z','b']);assert.deepEqual(applyIssueOperations(v,{$pull:{tags:{$in:['a','z']}}}).tags,['b'])});
test('$unset removes an optional field',()=>{assert.equal('tags' in applyIssueOperations(snap,{$unset:{tags:true}}),false)});
test('rejects unsafe, unsupported or overflowing updates',()=>{for(const op of [{$unset:{_id:true}},{$inc:{estimation:Number.MAX_SAFE_INTEGER}},{$rename:{title:'status'}},{$inc:{estimation:1},$unset:{estimation:true}},{$pull:{tags:{$in:'x'}}}])assert.throws(()=>applyIssueOperations(snap,op),Denied)});
test('native remove emits CAS-only tombstone mutation',async()=>{
 const writes=[];const existing={id:'huly.issue.Issue.1',boardId:B,workspaceId:W,payload:{kind:'huly.tracker.Issue',format:1,snapshot:snap},revision:4};
 const native=new NativeHulyIssueGateway({async verify(){return{id:U}}},{async read(){return existing}},{async commit(_t,_w,_b,ops){writes.push(...ops);return[{id:existing.id,boardId:B,workspaceId:W,revision:5}]}});
 const tx={_id:'tx.1',_class:HULY_TX_REMOVE,space:'core:space:Tx',modifiedBy:U,modifiedOn:123,objectClass:HULY_ISSUE,objectSpace:snap.space,objectId:'Issue.1'};
 await native.commit('signed',W,B,[tx]);assert.deepEqual(writes,[{action:'remove',documentId:existing.id,expectedRevision:4}]);
});
test('removal requires revision and cannot contain payload',async()=>{
 const g=new HulyTransactionGateway({async verify(){return{id:U}}},{async authorize(){}},{async commit(_t,s,ops){return ops.map(x=>({id:x.documentId,boardId:s.boardId,workspaceId:s.workspaceId,revision:5}))}});
 for(const op of [{action:'remove',documentId:'huly.issue.Issue.1'},{action:'remove',documentId:'huly.issue.Issue.1',expectedRevision:4,payload:{}}])await assert.rejects(()=>g.commit('signed',W,B,[op]),Denied);
});
