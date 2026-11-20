import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APPS,classifyApp} from '../../scripts/cp-crm-native-access-final02-signed-matrix.mjs';
const app=APPS.find(row=>row.moduleId==='tradelink');
const sample=(rpc,status=200)=>({moduleId:app.moduleId,boardId:app.boardId,state:'PENDING',signed:true,uiReady:true,
 native:{status:200,moduleId:app.moduleId,boardId:app.boardId},
 domainRpcs:[{rpc,status}],httpErrors:[],pageErrors:[]});
test('TradeLink native signed readback recognizes employee assigned, administrator search, and legacy list read endpoints',()=>{
 assert.deepEqual(app.domain,['tl03_assigned_documents','tl03_documents_page','tl03_documents_list']);
 for(const rpc of app.domain){
  const result=sample(rpc);
  assert.ok(app.domain.includes(result.domainRpcs[0].rpc));
  assert.equal(classifyApp(result),'VERIFIED');
 }
});
test('signed native readback never accepts missing or denied TradeLink RPC or mismatched native Board',()=>{
 assert.equal(classifyApp({...sample('tl03_documents_page'),domainRpcs:[]}), 'FAILED');
 assert.equal(classifyApp(sample('tl03_documents_page',403)), 'FAILED');
 assert.equal(classifyApp({...sample('tl03_documents_page'),httpErrors:[{rpc:'tl03_documents_page',status:403}]}), 'FAILED');
 assert.equal(classifyApp({...sample('tl03_assigned_documents'),native:{status:200,moduleId:'tradelink',boardId:'wrong'}}),'FAILED');
});
test('only TradeLink domain endpoints are extended; other three native application contracts are unchanged',()=>{
 for(const moduleId of ['time-tracker','fund-released-tracker','fueltrack-plus']){
  const entry=APPS.find(a=>a.moduleId===moduleId);
  assert.ok(entry.domain.length>0);
  assert.ok(entry.domain.every(x=>!x.startsWith('tl03_')));
 }
 const source=readFileSync('scripts/cp-crm-native-access-final02-signed-matrix.mjs','utf8');
 assert.doesNotMatch(source,/\.signIn\(|\.fill\(|\.click\(|\.post\(|\.rpc\(|localStorage|sessionStorage|document\.cookie/);
});
