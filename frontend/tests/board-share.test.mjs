import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 BOARD_SHARE_LINKS_ENABLED,BOARD_PRIVACY_MODES,SENSITIVE_MODULE_DEFAULTS,
 normalizeBoardSharePolicy,boardShareReadiness,renderBoardSharePreview
} from '../board-share.js';

const boardId='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const board=Object.freeze({
 id:boardId,workspace_id:workspaceId,name:'Order Intake',
 status:'active',archived_at:null,trashed_at:null
});
const approved={schemaVersion:1,boardId,workspaceId,
 externalSharing:'guest_shareable',guestLinksEnabled:true,mayIssue:true};

test('external sharing is always off until an explicit reviewed deployment',()=>{
 assert.equal(BOARD_SHARE_LINKS_ENABLED,false);
 assert.deepEqual(BOARD_PRIVACY_MODES.map(x=>x.value),
  ['private','workspace_restricted','guest_shareable']);
 assert.equal(SENSITIVE_MODULE_DEFAULTS.has('frt'),true);
 assert.equal(SENSITIVE_MODULE_DEFAULTS.has('evaluation'),true);
 assert.equal(SENSITIVE_MODULE_DEFAULTS.has('timetracker'),true);
});

test('forged, missing and cross-workspace policy receipts fail closed',()=>{
 const bad=[
  null,{}, {...approved,boardId:'33333333-3333-4333-8333-333333333333'},
  {...approved,workspaceId:'33333333-3333-4333-8333-333333333333'},
  {...approved,externalSharing:'public'},
  {...approved,mayIssue:'true'},
  {...approved,schemaVersion:2}
 ];
 for(const source of bad){
  const receipt=normalizeBoardSharePolicy(source,{boardId,workspaceId});
  assert.equal(receipt.state,'UNAVAILABLE');
  assert.equal(receipt.mayIssue,false);
 }
});

test('even a forged signed-sounding approved policy cannot enable live issue',()=>{
 const policy=normalizeBoardSharePolicy(approved,{boardId,workspaceId});
 assert.equal(policy.state,'VERIFIED_POLICY');
 assert.equal(policy.mayIssue,false);
 const readiness=boardShareReadiness({board,workspaceId,manage:true,policy});
 assert.equal(readiness.allowed,false);
 assert.match(readiness.reason,/not activated/i);
});

test('board mismatch, archive and nonmanager are denied even before activation',()=>{
 const denied=[
  {board:{...board,workspace_id:'33333333-3333-4333-8333-333333333333'},workspaceId,manage:true},
  {board:{...board,status:'trashed'},workspaceId,manage:true},
  {board:{...board,archived_at:'2026-11-10T00:00:00Z'},workspaceId,manage:true},
  {board,workspaceId:'33333333-3333-4333-8333-333333333333',manage:true},
  {board,workspaceId,manage:false}
 ];
 for(const input of denied)
  assert.equal(boardShareReadiness(input).allowed,false);
});

test('share preview escapes untrusted board names and creates no link',()=>{
 const html=renderBoardSharePreview({
  board:{...board,name:'<img src=x onerror=alert(1)>'},
  moduleKey:'frt',workspaceId,manage:true,
  policy:normalizeBoardSharePolicy(approved,{boardId,workspaceId})
 });
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<img|href=|data-action=".*issue"/);
 assert.match(html,/disabled>Send invitation/);
 assert.match(html,/type="email"/);
 assert.match(html,/Invite by email/);
 assert.doesNotMatch(html,/Copy invitation link|data-board-share-lab[^>]*href/);
 assert.match(html,/requires separate security review/);
 assert.match(html,/data-board-share-people/);
 assert.match(html,/People with access/);
 assert.match(html,/Board privacy/);
 assert.doesNotMatch(html,/data-action=".*issue"|data-action=".*enable"/);
 assert.doesNotMatch(html,/<select/);
});

test('integration preserves existing Work Management backend, auth and invite flags',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/import \{openBoardSharePreview,closeBoardSharePreview\} from '\.\/board-share\.js'/);
 assert.match(source,/data-action="board-share-preview"/);
 assert.match(source,/case 'board-share-preview':/);
 assert.match(source,/state\.boardManage===true/);
 assert.match(source,/case 'ws02-open-invites':/);
 assert.match(readFileSync(new URL('../workspace-invitation-client.js',import.meta.url),'utf8'),
  /WS02D_INVITE_CLIENT_ENABLED=false/);
 assert.match(readFileSync(new URL('../auth-account-flows.js',import.meta.url),'utf8'),
  /REGISTRATION_ADMISSION_ENABLED=false/);
});

test('main-based integration does not activate or import disposable invitation SQL',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const ui=readFileSync('frontend/board-share.js','utf8');
 assert.match(ui,/data-board-share-email-form/);
 assert.doesNotMatch(ui,/functions\/v1\/resource-email-invite/);
 assert.doesNotMatch(app,/wm_add_board_member\(/);
 assert.match(app,/renderBoardPeople\(people\)/);
 assert.match(app,/closeBoardSharePreview\(\)/);
});
