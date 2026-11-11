import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 BOARD_MENTION_WRITES_ENABLED,normalizeBoardPeople,filterBoardPeople,
 renderBoardPeople,mentionQuery,mentionCandidates,insertMention,
 renderMentionDraft,renderMentionOptions
} from '../board-people.js';

const boardId='11111111-1111-4111-8111-111111111111';
const workspaceId='22222222-2222-4222-8222-222222222222';
const first='33333333-3333-4333-8333-333333333333';
const second='44444444-4444-4444-8444-444444444444';
const detail={
 board:{id:boardId,workspace_id:workspaceId},
 members:[
  {user_id:first,display_name:'Alex Rivera',role:'owner'},
  {user_id:second,display_name:'Blair Santos',role:'viewer'}
 ]
};
const normalize=source=>normalizeBoardPeople(source,{boardId,workspaceId});
test('mentions remain a local text draft: no posts, notifications or network calls',()=>{
 assert.equal(BOARD_MENTION_WRITES_ENABLED,false);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/renderBoardPeople\(people\)\+/);
 assert.match(app,/renderMentionDraft\(people\)\+/);
 assert.match(app,/class="bs02-tools"/);
 assert.match(app,/mountAvatarImages\(view,profileAvatarClient,null,null\)/);
 assert.match(app,/mentionCandidates\(people,editor\.value,editor\.selectionStart\)/);
 assert.match(app,/case 'board-members'/);
 assert.match(app,/data-action="board-members">♙ People/);
 assert.doesNotMatch(readFileSync('frontend/board-people.js','utf8'),
  /wm_add_board_member|fetch\(|\.rpc\(|\.authorized\(|localStorage|sessionStorage/);
});
test('only exact signed-board explicit members are displayed',()=>{
 const result=normalize(detail);
 assert.equal(result.status,'SIGNED_MEMBERSHIP');
 assert.equal(result.isCompleteAccessList,false);
 assert.deepEqual(result.people.map(p=>p.name),['Alex Rivera','Blair Santos']);
 assert.deepEqual(filterBoardPeople(result,'Blair').map(p=>p.id),[second]);
 assert.deepEqual(filterBoardPeople(result,'owner').map(p=>p.id),[first]);
 assert.match(renderBoardPeople(result),/not an exhaustive access audit/);
 assert.match(renderBoardPeople(result),/bs02-avatar-chip/);
 assert.match(renderBoardPeople(result),/Alex Rivera · owner/);
 assert.match(renderBoardPeople(result),/aria-label="Alex Rivera, owner\. Copy @name"/);
 assert.doesNotMatch(renderBoardPeople(result),/id="bs02-people-search"/);
 assert.doesNotMatch(renderBoardPeople(result),/workspace directory/);
});
test('tampered, unauthorized-looking or mismatched member snapshots fail closed',()=>{
 for(const bad of [
  {...detail,board:{...detail.board,id:second}},
  {...detail,board:{...detail.board,workspace_id:first}},
  {...detail,members:null},
  {...detail,members:[{...detail.members[0],id:second,board_id:second}]},
  {...detail,members:[detail.members[0],detail.members[0]]},
  {...detail,members:[{...detail.members[0],active:false}]},
  {...detail,members:[{...detail.members[0],role:'admin'}]},
  {...detail,members:[{...detail.members[0],display_name:''}]},
  {...detail,members:Array(301).fill(detail.members[0])}
 ]){
  const result=normalize(bad);
  assert.equal(result.status,'UNVERIFIED');
  assert.deepEqual(result.people,[]);
  assert.match(renderBoardPeople(result),/No names are displayed/);
  assert.deepEqual(mentionCandidates(result,'@Alex',5),[]);
 }
});
test('member display escapes arbitrary profile names, including mention options',()=>{
 const payload='<img src=x onerror=alert(1)>';
 const name=payload+' & Test';
 const result=normalize({...detail,members:[{
  user_id:first,display_name:name,role:'owner'
 }]});
 const html=renderBoardPeople(result);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/&amp; Test/);
 assert.doesNotMatch(html,/<img src=x|onerror=alert\(1\)/);
 const mentionHtml=renderMentionOptions(result.people);
 assert.match(mentionHtml,/&lt;img/);
 assert.doesNotMatch(mentionHtml,/<img/);
});
test('avatar paths are restricted to a signed member and an exact private path',()=>{
 const good=first.toLowerCase()+'/55555555-5555-4555-8555-555555555555.webp';
 const rows=[
  {...detail.members[0],avatar_path:good},
  {...detail.members[1],avatar_path:'https://attacker.example/avatar.png'}
 ];
 const result=normalize({...detail,members:rows});
 assert.equal(result.people[0].avatarPath,good);
 assert.equal(result.people[1].avatarPath,null);
 const html=renderBoardPeople(result);
 assert.match(html,/data-avatar-path=/);
 assert.match(html,/data-avatar-user-id=/);
 assert.doesNotMatch(html,/attacker\.example/);
 const forged=normalize({...detail,members:[
  {...detail.members[0],avatar_path:second+'/55555555-5555-4555-8555-555555555555.webp'}
 ]});
 assert.equal(forged.people[0].avatarPath,null);
});
test('avatar tray labels and names escape untrusted profiles and search stays bounded',()=>{
 const result=normalize(detail);
 assert.match(renderBoardPeople(result),/aria-label="People assigned to this board"/);
 const many=normalize({...detail,members:Array.from({length:10},(_,i)=>({
  user_id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
  display_name:'Person '+i,role:'viewer'
 }))});
 assert.match(renderBoardPeople(many),/id="bs02-people-search"/);
 assert.match(renderBoardPeople(many,{query:'<img src=x onerror=1>'}),/&lt;img/);
 assert.doesNotMatch(renderBoardPeople(many,{query:'<img src=x onerror=1>'}),/<img src=x/);
});
test('valid @ queries filter exact board membership and insert plain text references',()=>{
 const result=normalize(detail);
 const input='Please review @Al';
 const matches=mentionCandidates(result,input,input.length);
 assert.deepEqual(matches.map(p=>p.id),[first]);
 const output=insertMention(input,input.length,matches[0]);
 assert.deepEqual(output,{text:'Please review @Alex Rivera ',cursor:27,userId:first});
 assert.equal(mentionQuery('no mention',10),null);
 assert.equal(mentionQuery('mail test@example.com',21),null);
 assert.equal(insertMention('plain text',10,matches[0]),null);
 const editor=renderMentionDraft(result);
 assert.match(editor,/Draft an update/);
 assert.match(editor,/does not post/);
 assert.doesNotMatch(editor,/data-action="send"/);
});
test('unknown or nonmember persons can never appear in @ picker',()=>{
 const result=normalize(detail);
 const unknown='55555555-5555-4555-8555-555555555555';
 assert.equal(mentionCandidates(result,'@Charlie',8).length,0);
 assert.equal(result.people.some(p=>p.id===unknown),false);
 assert.equal(mentionCandidates(result,'@',1).length,2);
});
