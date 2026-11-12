import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceRelationFromCatalog,workspaceRelationLabel} from '../workspace-relation-context.js';
import {workspaceEntryRoleBadge} from '../workspace-ui.js';
const userId='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333';
const context={user_id:userId,workspace_id:workspaceId,profile:{platform_role:'employee'}};
const catalog={status:'SIGNED_MEMBER_DISCOVERY',rows:[
 {id:workspaceId,active:true,relation:'owner',verifiedScope:'SIGNED_MEMBER_RPC'},
 {id:other,active:false,relation:'member',verifiedScope:'SIGNED_MEMBER_RPC'}]};
test('verified workspace owner remains Owner, independent of inherited employee identity',()=>{
 const owner=workspaceRelationFromCatalog(catalog,{userId,workspaceId});
 assert.equal(owner.relation,'owner');
 assert.equal(workspaceRelationLabel(owner,context),'Workspace owner');
});
test('workspace switch or user change cannot retain ownership from another signed scope',()=>{
 const owner=workspaceRelationFromCatalog(catalog,{userId,workspaceId});
 assert.equal(workspaceRelationLabel(owner,{...context,workspace_id:other}),
  'Workspace relationship unverified');
 assert.equal(workspaceRelationLabel(owner,{...context,user_id:other}),
  'Workspace relationship unverified');
});
test('unverified or malformed membership never implies ownership',()=>{
 assert.equal(workspaceRelationFromCatalog({status:'CURRENT_WORKSPACE_ONLY',rows:catalog.rows},
  {userId,workspaceId}),null);
 assert.equal(workspaceRelationFromCatalog({...catalog,rows:[
  {...catalog.rows[0],verifiedScope:'SIGNED_CURRENT_ONLY'}]}, {userId,workspaceId}),null);
 assert.equal(workspaceRelationFromCatalog({...catalog,rows:[catalog.rows[0],catalog.rows[0]]},
  {userId,workspaceId}),null);
});
test('signed workspace picker never labels an owner as Member',()=>{
 const source=readFileSync('frontend/workspace-ui.js','utf8');
 assert.match(source,/escape\(workspaceEntryRoleBadge\(row,options\)\)/);
 assert.doesNotMatch(source, /row\.active\?'Current':'Member'/);
});
test('CRM admin or workspace owner labels do not alter bootstrap permission checks',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/state\.adminVerified===true\?'<div class="side-section sidebar-nav-section">Administration/);
 assert.match(app,/roleConfig\.bootstrapVerified\(\)/);
 assert.match(app,/workspaceRelationSnapshot\?\.relation/);
 assert.match(app,/workspaceRelationReadGeneration/);
 assert.match(app,/auth\.accessToken!==token/);
 assert.match(app,/workspaceRelationLabel\(state\.workspaceRelationSnapshot,state\.context\)/);
});

test('active Work Management Member and CRM Admin remain distinguishable in the picker',()=>{
 const row={id:workspaceId,active:true,relation:'member'};
 const receipt={userId,workspaceId,effectiveRole:'admin'};
 assert.equal(workspaceEntryRoleBadge(row,{signedUserId:userId,activeCrmRole:receipt}),
  'Current · Member · CRM Admin');
 assert.equal(workspaceEntryRoleBadge({...row,id:other,active:false},
  {signedUserId:userId,activeCrmRole:receipt}),'Member');
 assert.equal(workspaceEntryRoleBadge(row,{signedUserId:other,activeCrmRole:receipt}),
  'Current · Member');
 assert.equal(workspaceEntryRoleBadge({...row,relation:'owner'},
  {signedUserId:userId,activeCrmRole:receipt}),'Current · Owner · CRM Admin');
});
