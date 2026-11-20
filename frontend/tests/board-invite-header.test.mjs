import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 boardInviteCount,boardInviteControl,renderBoardInviteDialog
} from '../board/collaboration/invite.js';

const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const c='33333333-3333-4333-8333-333333333333';
const people={status:'SIGNED_MEMBERSHIP',people:[
 {id:a,name:'Alex Rivera',role:'owner',avatarPath:null},
 {id:b,name:'Blair Santos',role:'viewer',avatarPath:null}
]};
const directory={status:'VERIFIED_SIGNED_CANDIDATES',members:[
 {id:a,name:'Alex Rivera',email:'alex@example.com',boardRole:'owner'},
 {id:b,name:'Blair Santos',email:'blair@example.com',boardRole:'viewer'},
 {id:c,name:'Jerome Nunez',email:'jerome@example.com',boardRole:null}
]};
test('Invite / N is derived only from a verified direct-board membership snapshot',()=>{
 assert.equal(boardInviteCount(people),2);
 assert.equal(boardInviteCount({status:'UNVERIFIED',people:people.people}),null);
 assert.equal(boardInviteCount({status:'SIGNED_MEMBERSHIP',people:null}),null);
 assert.match(boardInviteControl(people),/data-action="board-share-preview"/);
 assert.match(boardInviteControl(people),/data-board-invite-count>2</);
 assert.match(boardInviteControl(people),/Copy current board link \(does not grant access\)/);
 assert.match(boardInviteControl({status:'UNVERIFIED'}),/data-board-invite-count>—</);
});
test('modal renders named members, protected owner badge and viewer-only revoke',()=>{
 const html=renderBoardInviteDialog({people,directory,workspaceName:'WAO',manage:true,accessEnabled:true});
 assert.match(html,/Invite to this board/);
 assert.match(html,/Search by name, team or email/);
 assert.match(html,/People invited to this board/);
 assert.match(html,/Alex Rivera/);
 assert.match(html,/Blair Santos/);
 assert.match(html,/Board owner/);
 assert.match(html,/aps-invite-role-pill owner/);
 assert.match(html,/data-aps-invite-tab="teams"/);
 assert.match(html,/data-aps-invite-revoke="22222222-/);
 assert.doesNotMatch(html,/data-aps-invite-revoke="11111111-/);
 assert.match(html,/Request to invite a new member by email/);
 assert.match(html,/does not grant permission/);
 assert.doesNotMatch(html,/>Agents<|aria-label="Invite category"/);
});
test('search can find an existing signed candidate, disables previously invited people',()=>{
 const html=renderBoardInviteDialog({people,directory,workspaceName:'WAO',manage:true,
  accessEnabled:true,query:'Jerome'});
 assert.match(html,/role="listbox"/);
 assert.match(html,/Jerome/);
 assert.match(html,/data-aps-invite-assign="33333333-/);
 assert.doesNotMatch(html,/data-aps-invite-assign="33333333-[^>]* disabled/);
 const unsafeDirectory={...directory,members:directory.members.map(p=>p.id===c?
  {...p,protected:true}:p)};
 const protectedHtml=renderBoardInviteDialog({people,directory:unsafeDirectory,manage:true,
  accessEnabled:true,query:'Jerome'});
 assert.match(protectedHtml,/data-aps-invite-assign="33333333-[^>]* disabled/);
 assert.match(protectedHtml,/Protected/);

 const invited=renderBoardInviteDialog({people,directory,manage:true,accessEnabled:true,query:'Alex'});
 assert.match(invited,/data-aps-invite-assign="11111111-[^>]* disabled/);
 assert.match(invited,/Already invited/);
});
test('unverified or nonmanager directory fails closed with no assignable candidates',()=>{
 const unauthorized=renderBoardInviteDialog({people,directory,manage:false,accessEnabled:true,query:'Jerome'});
 assert.match(unauthorized,/Only an authorized board manager/);
 assert.match(unauthorized,/id="aps-invite-search"[^>]* disabled/);
 assert.match(unauthorized,/data-aps-invite-assign="33333333-[^>]* disabled/);
 const unavailable=renderBoardInviteDialog({people,directory:{status:'UNAVAILABLE'},manage:true,
  accessEnabled:true,query:'Jerome'});
 assert.match(unavailable,/authorized workspace member directory is unavailable/);
 assert.doesNotMatch(unavailable,/id="aps-invite-search"[^>]* disabled/);
 assert.doesNotMatch(unavailable,/data-aps-invite-assign=/);
});
test('untrusted names, emails and workspace labels are escaped',()=>{
 const unsafe={...people,people:[
  {id:a,name:'<img src=x onerror=alert(1)>',role:'owner',avatarPath:null}
 ]};
 const html=renderBoardInviteDialog({people:unsafe,directory,workspaceName:'<bad>',manage:true});
 assert.match(html,/&lt;img/);
 assert.match(html,/&lt;bad&gt;/);
 assert.doesNotMatch(html,/<img src=x/);
});
test('board header replaces duplicate toolbar sharing without changing access feature flags',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const index=readFileSync('index.html','utf8');
 assert.match(app,/boardInviteControl\(normalizeBoardPeople\(state\.board/);
 assert.match(app,/case 'board-copy-link':/);
 assert.match(app,/openBoardInviteDialog\(/);
 assert.doesNotMatch(app,/data-action="board-share-preview">Share &amp; access/);
 assert.match(index,/frontend\/board-invite\.css/);
 assert.match(readFileSync('frontend/workspace-board-groups.js','utf8'),/BOARD_GROUP_ACCESS_ENABLED=false/);
 assert.match(readFileSync('frontend/board/columns/col01-readers.js','utf8'),/BOARD_COL01_DIRECTORY_ENABLED=false/);
 assert.doesNotMatch(readFileSync('frontend/board/collaboration/invite.js','utf8'),/wm_add_board_member|\.rpc\(|supabase\.from\(/);
});
