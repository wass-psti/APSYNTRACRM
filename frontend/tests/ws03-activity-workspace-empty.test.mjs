import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderBoardActivityResults,renderBoardActivityActorAvatar,normalizeBoardActivity}
 from '../board-activity-ui.js';

const actor='33333333-3333-4333-8333-333333333333';
test('signed activity view reuses existing actors and shows safe initials',()=>{
 const rows=normalizeBoardActivity([{
  id:1,event_type:'item.created',actor_id:actor,
  actor_name:'Jamie Rivera',message:'Task added',
  created_at:'2026-11-11T00:00:00Z'
 }]);
 const plain=renderBoardActivityResults(rows).html;
 assert.match(plain,/board-activity-event/);
 assert.match(plain,/board-activity-actor-avatar/);
 assert.match(plain,/Jamie Rivera/);
 assert.match(plain,/Task added/);
 assert.doesNotMatch(plain,/data-avatar-path=/);
 const path=actor+'/44444444-4444-4444-8444-444444444444.webp';
 const approved=renderBoardActivityResults(rows,{avatarPaths:new Map([[actor,path]])}).html;
 assert.match(approved,/data-avatar-path=/);
 const wrong='55555555-5555-4555-8555-555555555555';
 const denied=renderBoardActivityResults(rows,{avatarPaths:new Map([
  [actor,wrong+'/44444444-4444-4444-8444-444444444444.webp']
 ])}).html;
 assert.doesNotMatch(denied,/data-avatar-path=/);
});
test('activity actor markup is escaped and cannot inject an image origin',()=>{
 const html=renderBoardActivityActorAvatar('invalid','<svg onload=x>');
 assert.match(html,/aria-hidden="true"/);
 assert.doesNotMatch(html,/<svg|onload="/);
 assert.doesNotMatch(html,/https?:\/\//);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/mountAvatarImages\(host,profileAvatarClient,null,null\)/);
 assert.match(app,/const signedPeople=normalizeBoardPeople\(state\.board/);
});
test('creation receipt navigates only through signed selection, not local scope',()=>{
 const ui=readFileSync('frontend/workspace-ui.js','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(ui,/Open new workspace/);
 assert.match(ui,/const catalog=await lifecycle\.discover\(\)/);
 assert.match(ui,/requestSignedWorkspaceSwitch\(\{/);
 assert.match(ui,/options\.onWorkspaceSwitched\(\)/);
 assert.match(app,/location\.reload\(\)/);
 assert.doesNotMatch(ui,/localStorage\.setItem\(['"]currentWorkspace/);
 assert.match(app,/state\.boards\.length/);
 assert.match(app,/Start with your first board/);
});

test('ownership UI requires verified target, typed confirmation and ledger verification',()=>{
 const ui=readFileSync('frontend/workspace-ui.js','utf8');
 for(const expr of [
  /Transfer workspace ownership/,
  /verified member of/,
  /data-ws01-action="transfer-owner"/,
  /WS03_OWNERSHIP_TRANSFER_ENABLED&&row\.active/,
  /confirmation!=='TRANSFER'/,
  /authorityClient\.readTransferCandidates\(workspaceId\)/,
  /authorityClient\.verifyOwnershipTransfer\(\{/,
  /after\?\.verified!==true/,
  /requestId=globalThis\.crypto\?\.randomUUID/,
  /signedItAdmin/
 ])assert.match(ui,expr);
 assert.doesNotMatch(ui,/localStorage\.setItem\(['"]workspaceOwner/);
});
