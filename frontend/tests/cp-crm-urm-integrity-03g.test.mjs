import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assess03G,NATIVE_FOUR} from '../../scripts/cp-crm-urm-integrity-03g-acceptance.mjs';
const admin={accountKey:'aaaaaaaaaaaaaaaa',workspaceKey:'1111111111111111',role:'admin'};
const employee={accountKey:'bbbbbbbbbbbbbbbb',workspaceKey:'1111111111111111',role:'employee'};
const preflight={status:'ELIGIBLE',accounts:[admin,employee]};
const applications=NATIVE_FOUR.map(moduleId=>({moduleId,status:'VERIFIED',nativeBoardMatch:true,domainRpcs:[{name:'read',status:200}],pageErrors:[]}));
const native={accounts:[{accountKey:employee.accountKey,workspaceKey:employee.workspaceKey,signed:true,active:true,applications}]};
test('same-workspace signed admin and employee, four native reads are only ready for actual mutation',()=>{
 const result=assess03G(preflight,native);
 assert.equal(result.status,'READY_FOR_MUTATION');assert.equal(result.verifiedNative,4);
 assert.equal(result.mutationPerformed,false);assert.equal(result.productionPermissionWrites,0);
});
test('different signed workspace blocks even when all four native modules work',()=>{
 const result=assess03G({...preflight,status:'BLOCKED',accounts:[admin,{...employee,workspaceKey:'2222222222222222'}]},native);
 assert.equal(result.status,'BLOCKED');assert.equal(result.gate,'WORKSPACE');
});
test('identity, role, signing and workspace mismatch cannot be promoted to acceptance',()=>{
 const cases=[
 [{...preflight,accounts:[admin,admin]},native],
 [{...preflight,accounts:[{...admin,role:'employee'},employee]},native],
 [preflight,{accounts:[{...native.accounts[0],accountKey:'cccccccccccccccc'}]}],
 [preflight,{accounts:[{...native.accounts[0],workspaceKey:'2222222222222222'}]}],
 [preflight,{accounts:[{...native.accounts[0],signed:false}]}],
 [preflight,{accounts:[{...native.accounts[0],active:false}]}],
 ];
 for(const [a,b] of cases)assert.equal(assess03G(a,b).status,'BLOCKED');
});
test('native missing domain HTTP 200, board match, and page-error failures each block',()=>{
 for(const patch of [{status:'BLOCKED'},{nativeBoardMatch:false},{domainRpcs:[{status:403}]},{pageErrors:['runtime error']}]){
  const failed={...applications[0],...patch};
  const out=assess03G(preflight,{accounts:[{...native.accounts[0],applications:[failed,...applications.slice(1)]}]});
  assert.equal(out.status,'BLOCKED');assert.equal(out.verifiedNative,3);
 }
});
test('role mutation must not be inferred from sanitized acceptance payload alone',()=>{
 const result=assess03G({...preflight,mutationPerformed:true,roleWrites:4}, {...native,mutationPerformed:true});
 assert.equal(result.mutationPerformed,false);assert.notEqual(result.status,'VERIFIED');
 const source=readFileSync('scripts/cp-crm-urm-integrity-03g-acceptance.mjs','utf8');
 assert.doesNotMatch(source,/\.goto\(|\.rpc\(|accessToken|service_role|\.post\(/);
});
