import test from 'node:test';
import assert from 'node:assert/strict';
import {ROLE_MANAGEMENT_MODULES,assertUserRoleManagementSnapshot} from '../dist/src/apsyntra-user-role-management.js';
test('all twelve canonical module keys are covered with no duplicates',()=>{
 assert.equal(ROLE_MANAGEMENT_MODULES.length,12);
 assert.equal(new Set(ROLE_MANAGEMENT_MODULES).size,12);
});
test('actual role snapshot is never inferred from local role data',()=>{
 assert.throws(()=>assertUserRoleManagementSnapshot({bootstrapVerified:false,workspaceId:'test'}));
 assert.doesNotThrow(()=>assertUserRoleManagementSnapshot({
   bootstrapVerified:true,workspaceId:'test',users:[],modules:[],
   moduleAssignments:[],boards:[],boardAssignments:[]
 }));
});
