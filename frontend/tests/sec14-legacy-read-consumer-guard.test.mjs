import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deprecatedRpcReferences,auditFirstPartyLegacyReads}
 from '../../scripts/sec14-legacy-read-consumer-guard.mjs';

const words=['frt_'+'get_request','frt_'+'list_requests','frt_'+'dashboard'];

test('SEC14 guard rejects all three discontinued broad-read RPC call names',()=>{
 for(const word of words){
  assert.deepEqual(deprecatedRpcReferences("await api.rpc('"+word+"',{});"),
   [{name:word,line:1}]);
 }
 assert.deepEqual(deprecatedRpcReferences(
  "const ok=1;\nawait api.rpc('"+words[0]+"',{});"),
  [{name:words[0],line:2}]);
});

test('SEC14 guard does not confuse restricted RPCs with broad-read names',()=>{
 assert.deepEqual(deprecatedRpcReferences(
  "api.rpc('frt_board_dashboard_safe');"+
  "api.rpc('frt_board_list_safe');"+
  "api.rpc('frt_restricted_request_detail');"+
  "const name='xfrt_dashboard1';"),[]);
});

test('SEC14 checkout first-party runtime has no broad reads and uses safe APIs',()=>{
 const result=auditFirstPartyLegacyReads(process.cwd());
 assert.ok(result.scannedFiles>=20);
 assert.deepEqual(result.legacyReferences,[]);
 assert.deepEqual(result.missingRestrictedReads,[]);
});

test('CI enforces static consumer checks on future main commits',()=>{
 const workflow=readFileSync('.github/workflows/apsyntra-frontend.yml','utf8');
 assert.match(workflow,/node scripts\/sec14-legacy-read-consumer-guard\.mjs/);
 assert.match(workflow,/scripts\/sec14-legacy-read-consumer-guard\.mjs/);
});
