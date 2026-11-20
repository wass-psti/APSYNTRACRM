import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseNativeEndpoints,assessAdminEmployeePair} from '../../scripts/cp-crm-urm-integrity-03-signed-native.mjs';
const u='11111111-1111-4111-8111-111111111111';
test('native readback accepts one or two independent loopback Chromium endpoints',()=>{
 assert.deepEqual(parseNativeEndpoints('http://127.0.0.1:9224'),['http://127.0.0.1:9224']);
 assert.deepEqual(parseNativeEndpoints('http://127.0.0.1:9224','http://127.0.0.1:9225'),['http://127.0.0.1:9224','http://127.0.0.1:9225']);
});
test('reject duplicate or remote endpoints',()=>{
 for(const endpoints of [[undefined,undefined],['http://localhost:9224',undefined],['https://127.0.0.1:9224',undefined],['http://127.0.0.1:9224','http://127.0.0.1:9224'],['http://127.0.0.1:9224','http://192.168.1.1:9225']]){
  assert.throws(()=>parseNativeEndpoints(...endpoints));
 }
});
test('valid same-workspace dual profile pair never counts as completed mutation',()=>{
 const records=[{signed:true,active:true,tab:1,accountKey:'aaaaaaaaaaaaaaaa',workspaceId:u,access:{effectivePlatformRole:'employee'}},{signed:true,active:true,tab:2,accountKey:'bbbbbbbbbbbbbbbb',workspaceId:u,access:{effectivePlatformRole:'admin'}}];
 assert.equal(assessAdminEmployeePair(records,records.map(x=>x.accountKey)).status,'ELIGIBLE');
 assert.equal(assessAdminEmployeePair([records[0],{...records[1],workspaceId:'22222222-2222-4222-8222-222222222222'}],records.map(x=>x.accountKey)).status,'BLOCKED');
});
test('dual-profile native matrix remains read-only, recovers signed HTTP 200, restores original route',()=>{
 const source=readFileSync('scripts/cp-crm-urm-integrity-03-signed-native.mjs','utf8');
 assert.match(source,/parseNativeEndpoints\(cdp,cdp2\)/);
 assert.match(source,/browsers\.flatMap|browsers\s*\.flatMap/);
 assert.match(source,/r\.name === "apsyntra_crm_my_effective_access" && r\.status === 200/);
 assert.match(source,/goto\(original/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|accessToken|\.post\(|\.rpc\(/);
});
