import test from 'node:test';
import assert from 'node:assert/strict';
import { HulyTransactionGateway } from '../dist/src/transactions.js';
import { Denied, ServiceUnavailable } from '../dist/src/sb02.js';
import { createHulyRequestHandler } from '../dist/src/http-handler.js';
const U='11111111-1111-4111-8111-111111111111';
const W='22222222-2222-4222-8222-222222222222';
const B='33333333-3333-4333-8333-333333333333';
const issue={action:'create',documentId:'huly.issue.one',payload:{title:'A'}};
function tx(permission=true,override){
  return new HulyTransactionGateway(
    {async verify(){return{id:U}}},
    {async authorize(){if(!permission)throw new Denied()}},
    override??{async commit(_,scope,ops){return ops.map(op=>({id:op.documentId,boardId:scope.boardId,workspaceId:scope.workspaceId,revision:1}))}}
  );
}
test('atomic create returns scoped revision',async()=>{
  const result=await tx().commit('signed',W,B,[issue]);
  assert.deepEqual(result,[{id:issue.documentId,boardId:B,workspaceId:W,revision:1}]);
});
test('rejects duplicate IDs before persistence',async()=>{
  await assert.rejects(()=>tx().commit('signed',W,B,[issue,issue]),Denied);
});
test('rejects missing token and malformed scope',async()=>{
  await assert.rejects(()=>tx().commit('',W,B,[issue]),Denied);
  await assert.rejects(()=>tx().commit('signed','not-a-workspace',B,[issue]),Denied);
});
test('rejects write permission denial',async()=>{
  await assert.rejects(()=>tx(false).commit('signed',W,B,[issue]),Denied);
});
test('fails closed on forged RPC workspace receipts',async()=>{
  await assert.rejects(()=>tx(true,{async commit(){return[{id:issue.documentId,boardId:B,workspaceId:U,revision:1}]}}).commit('signed',W,B,[issue]),ServiceUnavailable);
});
test('rejects invalid optimistic revision',async()=>{
  await assert.rejects(()=>tx().commit('signed',W,B,[{...issue,action:'update',expectedRevision:0}]),Denied);
});
test('rejects excessive batch size',async()=>{
  await assert.rejects(()=>tx().commit('signed',W,B,Array.from({length:26},(_,i)=>({...issue,documentId:`issue.${i}`}))),Denied);
});
test('rejects unsigned HTTP transactions',async()=>{
  const response=await createHulyRequestHandler({})(new Request(`http://127.0.0.1:5173/api/v1/huly/boards/${B}/transactions?workspace_id=${W}`,{method:'POST'}));
  assert.equal(response.status,401);
});
test('rejects invalid HTTP transaction body',async()=>{
  const response=await createHulyRequestHandler({},tx())(new Request(`http://127.0.0.1:5173/api/v1/huly/boards/${B}/transactions?workspace_id=${W}`,{
    method:'POST',headers:{authorization:'Bearer signed','content-type':'application/json'},body:'{"operations":null}'
  }));
  assert.equal(response.status,400);
});
test('executes authorized HTTP transaction with one RPC',async()=>{
  const response=await createHulyRequestHandler({},tx())(new Request(`http://127.0.0.1:5173/api/v1/huly/boards/${B}/transactions?workspace_id=${W}`,{
    method:'POST',headers:{authorization:'Bearer signed','content-type':'application/json'},body:JSON.stringify({operations:[issue]})
  }));
  assert.equal(response.status,200);
  const json=await response.json();assert.equal(json.receipts[0].revision,1);
});
