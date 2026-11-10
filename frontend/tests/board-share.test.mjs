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
 assert.match(html,/disabled>Copy guest invitation link/);
 assert.match(html,/restricted operational or personal data/);
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

test('disposable schema is private, explicitly off and does not grant browser execution',()=>{
 const schema=readFileSync('sql/bs01-board-guest-sharing-disposable-candidate.sql','utf8');
 assert.match(schema,/current_database\(\)<>'workspace_disposable'/);
 assert.match(schema,/enabled boolean NOT NULL DEFAULT false/);
 assert.match(schema,/guest_read_enabled boolean NOT NULL DEFAULT false/);
 assert.match(schema,/mode text NOT NULL DEFAULT 'private'/);
 assert.match(schema,/role text NOT NULL DEFAULT 'viewer'/);
 assert.match(schema,/extensions\.digest/);
 assert.match(schema,/FOR UPDATE/);
 assert.match(schema,/workspaceMembershipGranted',false/);
 assert.doesNotMatch(schema,/\bGRANT\s+(?:EXECUTE|SELECT|UPDATE|INSERT|DELETE)\s+ON\s+/i);
 for(const name of ['bs01_issue_link','bs01_redeem_link','bs01_guest_read_allowed',
  'bs01_revoke_link','bs01_signed_actor'])
  assert.match(schema,new RegExp('REVOKE ALL ON FUNCTION private\\.'+name));
 assert.doesNotMatch(schema,/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?public\.workspace_members\b/i);
 assert.doesNotMatch(schema,/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?public\.work_board_members\b/i);
});
