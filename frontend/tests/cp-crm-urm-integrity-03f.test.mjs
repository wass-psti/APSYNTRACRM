import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifySigned03F} from '../../scripts/cp-crm-urm-integrity-03f-signed-preflight.mjs';
const a='aaaaaaaaaaaaaaaa',b='bbbbbbbbbbbbbbbb';
const w='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const item=(accountKey,workspaceId,role,tab)=>({signed:true,active:true,tab,accountKey,workspaceId,workspaceMatch:true,access:{effectivePlatformRole:role}});
test('genuine distinct admin and employee in same workspace are only eligible, never accepted as mutation',()=>{
 const result=classifySigned03F([item(a,w,'admin',1),item(b,w,'employee',2)]);
 assert.equal(result.status,'ELIGIBLE');assert.equal(result.mutationPerformed,false);assert.equal(result.permissionWrites,0);
});
test('different workspaces, employee-only, identity mismatch, stale and duplicate tabs all block',()=>{
 const scenarios=[
 [item(a,w,'admin',1),item(b,other,'employee',2)],
 [item(a,w,'employee',1),item(b,w,'employee',2)],
 [item(a,w,'admin',1),{...item(b,w,'employee',2),workspaceMatch:false}],
 [{...item(a,w,'admin',1),active:false},item(b,w,'employee',2)],
 [item(a,w,'admin',1),item(a,w,'employee',2)],
 [item(a,w,'admin',1),item(b,w,'employee',1)]
 ];
 for(const entries of scenarios)assert.equal(classifySigned03F(entries).status,'BLOCKED');
});
test('preflight never issues mutation RPCs, captures tokens, or visits native routes',()=>{
 const source=readFileSync('scripts/cp-crm-urm-integrity-03f-signed-preflight.mjs','utf8');
 assert.match(source,/wm_auth_access_context\|apsyntra_crm_my_effective_access/);
 assert.doesNotMatch(source,/\.goto\(|\.rpc\(|\.post\(|accessToken|localStorage|sessionStorage|\.evaluate\(/);
});
