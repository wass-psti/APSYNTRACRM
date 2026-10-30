import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRoleSnapshot,isRoleProposalOperation,DEFAULT_ROLE_HIERARCHY,CENTRAL_MODULE_IDS,CONFIGURABLE_ACTIONS} from '../dist/src/apsyntra-role-configuration.js';
test('central Role Configuration contract preserves system hierarchy and all twelve modules',()=>{
 assert.deepEqual(DEFAULT_ROLE_HIERARCHY,['admin','supervisor','employee','viewer']);
 assert.equal(CENTRAL_MODULE_IDS.length,12);assert.equal(CONFIGURABLE_ACTIONS.length,7);
 assert.equal(isRoleProposalOperation('role.create'),true);
 assert.equal(isRoleProposalOperation('bootstrap.grant'),false);
});
test('server-only snapshot must assert explicit bootstrap authority and staged mode',()=>{
 assert.throws(()=>assertRoleSnapshot({bootstrapVerified:false,mode:'staged_only'}));
 assert.throws(()=>assertRoleSnapshot({bootstrapVerified:true,mode:'active'}));
 assert.doesNotThrow(()=>assertRoleSnapshot({bootstrapVerified:true,mode:'staged_only',
 roles:[],users:[],assignments:[],boards:[],proposals:[],audit:[]}));
});
