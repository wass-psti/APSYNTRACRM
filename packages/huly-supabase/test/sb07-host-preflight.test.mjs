import test from 'node:test';
import assert from 'node:assert/strict';
import {probeHost} from '../scripts/sb07-host-preflight.mjs';
const mk=(status,ct='application/json',marker='')=>new Response('',{status,headers:{'content-type':ct,...(marker?{'x-apsyntra-huly':marker}:{})}});
test('host preflight reports genuine marked API route',async()=>{
 const result=await probeHost({fetchImpl:async url=>url.endsWith('/')?mk(200,'text/html'):mk(401,'application/json','board-api-v1')});
 assert.equal(result.status,'ready');assert.equal(result.code,'HULY_MOUNT_CONFIRMED');assert.equal(result.routeStatus,401);
});
test('host missing is explicit and does not imply failed authentication',async()=>{
 const fetchImpl=async()=>{throw Object.assign(new TypeError('fetch failed'),{cause:{code:'ECONNREFUSED'}})};
 const result=await probeHost({fetchImpl});assert.equal(result.code,'CONNECTION_REFUSED');assert.equal(result.status,'blocked');
});
test('SPA fallback is not mistaken for mounted Huly middleware',async()=>{
 const result=await probeHost({fetchImpl:async()=>mk(200,'text/html')});
 assert.equal(result.code,'SPA_FALLBACK');
});
test('an unmarked HTTP 401 is insufficient to prove route mount',async()=>{
 const result=await probeHost({fetchImpl:async url=>url.endsWith('/')?mk(200):mk(401)});
 assert.equal(result.status,'pending');assert.equal(result.code,'AUTH_GUARD_ONLY');
});
test('unrecognized route and invalid origin both fail closed',async()=>{
 const result=await probeHost({fetchImpl:async url=>url.endsWith('/')?mk(200):mk(404)});
 assert.equal(result.code,'ROUTE_NOT_FOUND');
 await assert.rejects(()=>probeHost({origin:'http://127.0.0.1:5555'}),/approved/);
});
