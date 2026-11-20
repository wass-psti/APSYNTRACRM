import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePreflightEndpoints,classifySigned03F} from '../../scripts/cp-crm-urm-integrity-03f-signed-preflight.mjs';
const a='aaaaaaaaaaaaaaaa',b='bbbbbbbbbbbbbbbb';
const w='11111111-1111-4111-8111-111111111111';
const record=(accountKey,role,tab,workspaceId=w)=>({signed:true,active:true,tab,accountKey,workspaceId,workspaceMatch:true,access:{effectivePlatformRole:role}});
test('one endpoint remains backward compatible',()=>{
 assert.deepEqual(parsePreflightEndpoints({'cdp-url':'http://127.0.0.1:9222'}),['http://127.0.0.1:9222']);
});
test('two independent loopback endpoints can represent separate authenticated profiles',()=>{
 assert.deepEqual(parsePreflightEndpoints({'cdp-url':'http://127.0.0.1:9224','cdp-url-2':'http://127.0.0.1:9225'}),['http://127.0.0.1:9224','http://127.0.0.1:9225']);
 const outcome=classifySigned03F([record(a,'admin',1),record(b,'employee',2)]);
 assert.equal(outcome.status,'ELIGIBLE');assert.equal(outcome.mutationPerformed,false);
});
test('duplicate endpoints and remote endpoints are rejected before connection',()=>{
 const cases=[{}, {'cdp-url-2':'https://example.com'}, {'cdp-url':'http://localhost:9222'},
 {'cdp-url':'http://127.0.0.1:9224','cdp-url-2':'http://127.0.0.1:9224'},
 {'cdp-url':'http://127.0.0.1:9224','cdp-url-2':'http://192.168.0.1:9225'}];
 for(const args of cases)assert.throws(()=>parsePreflightEndpoints(args));
});
test('different workspace and duplicate signed account never count as independent Employee',()=>{
 assert.equal(classifySigned03F([record(a,'admin',1),record(b,'employee',2,'22222222-2222-4222-8222-222222222222')]).status,'BLOCKED');
 assert.equal(classifySigned03F([record(a,'admin',1),record(a,'employee',2)]).status,'BLOCKED');
});
test('dual-endpoint preflight stays read-only, without script-based credential access',()=>{
 const code=readFileSync('scripts/cp-crm-urm-integrity-03f-signed-preflight.mjs','utf8');
 assert.match(code,/parsePreflightEndpoints\(options\)/);
 assert.match(code,/for\(const url of urls\)/);
 assert.doesNotMatch(code,/\.goto\(|\.rpc\(|\.post\(|accessToken|localStorage|sessionStorage|\.evaluate\(/);
});
