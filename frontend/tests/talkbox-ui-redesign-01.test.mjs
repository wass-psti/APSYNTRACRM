import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderTalkBoxApplication} from '../talkbox-ui.js';

const issue={id:'55',name:'Fueltrans (UNIOIL)',status:'Stuck',version:3,date:'2026-11-24',
 person:[{id:'abc',name:'Operations'}],updates:[{id:'13',text_body:'Follow up with supplier',creator:{name:'Team member'}}],
 subitems:[{id:'41',name:'Confirm fuel release',status:'Working on it'}],
 assets:[{id:'9',name:'sample.txt',size:128}],timeTracking:{hours:1,minutes:20}};

function page(extra={}){
 return renderTalkBoxApplication({page:{items:[issue],total:1},selected:issue,
  canEdit:true,features:{threadedReplies:true,attachmentRemoval:true,serverTimer:true},...extra});
}

test('original meeting-first hierarchy offers date-select and Enter Meeting with native issue data',()=>{
 const html=page();
 assert.match(html,/class="tb-hero"/);
 assert.match(html,/id="tb-meeting-date" type="date"/);
 assert.match(html,/data-action="tb-meeting-enter"/);
 assert.match(html,/Meeting overview/);
 assert.match(html,/Fueltrans \(UNIOIL\)/);
 assert.match(html,/Native APSYNTRA CRM workspace records/);
 assert.match(html,/data-action="tb-open" data-id="55"/);
 assert.doesNotMatch(html,/monday\.com/i);
});

test('Meeting Sheet renders selected presentation date without inventing persistence',()=>{
 const html=page({meetingOpen:true,meetingDate:'2026-11-21'});
 assert.match(html,/class="tb-app tb-meeting-active"/);
 assert.match(html,/Main issues log/);
 assert.match(html,/data-action="tb-meeting-back"/);
 assert.match(html,/class="tb-date-chip">2026-11-21/);
 assert.match(html,/Persisted meeting issues and carried-over actions/);
 assert.doesNotMatch(html,/data-action="tb-meeting-enter"/);
});

test('all original signed native issue detail actions remain accessible in the right drawer',()=>{
 const html=page();
 for(const action of ['tb-edit','tb-assignees','tb-timer-start','tb-time-edit','tb-archive',
  'tb-post','tb-reply','tb-file-upload','tb-file-download','tb-file-remove',
  'tb-subtask-new','tb-subtask-status','tb-subtask-delete'])
  assert.match(html,new RegExp('data-action="'+action+'"'),action);
 assert.match(html,/role="dialog" aria-modal="true"/);
 assert.match(html,/Discussion &amp; updates/);
 assert.match(html,/data-action="tb-filter"/);
});

test('meeting data and issue names are escaped and no unsafe name appears as HTML',()=>{
 const html=renderTalkBoxApplication({page:{items:[{...issue,name:'<img src=x onerror=alert(1)>'}],total:1},
  selected:null,meetingDate:'<script>bad</script>',meetingOpen:true});
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img src=x/);
 assert.doesNotMatch(html,/<script>bad<\/script>/);
});

test('TalkBox meeting view state persists across signed issue refreshes and is scoped to current board',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'tb-meeting-enter':/);
 assert.match(app,/case 'tb-meeting-back':/);
 assert.match(app,/meetingOpen:talkBoxState\.meetingOpen===true,meetingDate:talkBoxState\.meetingDate/);
 assert.match(app,/meetingDate:talkBoxState\.meetingDate\|\|''/);
});


test('meeting sheet exposes version-checked inline status editing only to existing editors',()=>{
 const editor=page({meetingOpen:true,meetingDate:'2026-11-21'});
 assert.match(editor,/data-tb-inline-status="55"/);
 const viewer=renderTalkBoxApplication({page:{items:[issue],total:1},meetingOpen:true,canEdit:false});
 assert.doesNotMatch(viewer,/data-tb-inline-status=/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/updateVerified\(row\.id,\{status:inline\.value\},row\.version\)/);
 assert.match(app,/if\(!talkBoxCurrent\(scope\)\|\|!state\.edit\|\|talkBoxState\.busy\)return/);
});
