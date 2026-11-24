import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync('frontend/app.js','utf8');
const nativeUi=readFileSync('frontend/talkbox-ui.js','utf8');
const applicationCss=readFileSync('frontend/talkbox-application.css','utf8');

test('TalkBox route enters its native application view directly',()=>{
 assert.match(app,/if\(parts\[0\]==='talkbox'\)\{/);
 assert.match(app,/await loadBoard\(board\.id,'talkbox'\)/);
 assert.ok(app.includes("if(tab==='talkbox')state.view='talkbox';else state.view='board'"));
 assert.match(app,/else if\(state\.view==='talkbox'\)shell\(renderTalkBoxNativeApplication\(\)\)/);
 assert.match(app,/function talkBoxCurrent\(scope\)\{return auth\.isSignedIn&&state\.view==='talkbox'&&state\.tab==='talkbox'/);
 assert.match(app,/function renderTalkBoxNativeApplication\(\)/);
});

test('TalkBox does not expose generic board tabs or duplicate board-level application views',()=>{
 assert.match(app,/const tabSpecs=moduleKey==='toolbox'\?\[\]:\[/);
 assert.doesNotMatch(app,/key:'talkbox',href:TALKBOX_APPLICATION_ROUTE,label:'TalkBox application'/);
 assert.doesNotMatch(app,/state\.tab==='talkbox'&&moduleKey==='toolbox'\?renderTalkBoxApplication/);
 assert.match(app,/const legacyTalkBox=state\.boards\.find\(b=>b\.id===parts\[1\]&&moduleByBoardName\(b\.name\)\?\.key==='toolbox'\)/);
 assert.match(app,/history\.replaceState\(null,'',location\.pathname\+location\.search\+target\)/);
});

test('TalkBox native shell keeps the existing CRM shell and direct route breadcrumb',()=>{
 assert.match(app,/classList\.toggle\('aps-talkbox-shell',state\.view==='talkbox'\)/);
 assert.match(app,/currentSidebarNavigation\(\)==='talkbox'\?'TalkBox'/);
 assert.match(app,/workspaceApplicationsForNavigation\(state\.context\?\.workspace_id,state\.boards\)/);
});

test('TalkBox native UI and feature controls remain intact after route restructuring',()=>{
 assert.match(nativeUi,/Every issue\. One clear conversation\./);
 assert.match(nativeUi,/tb-meeting-enter/);
 assert.match(nativeUi,/data-action="tb-meeting-history"/);
 assert.match(nativeUi,/data-action="tb-open"/);
 assert.match(nativeUi,/data-action="tb-post"/);
 assert.match(nativeUi,/data-action="tb-subtask-new"/);
 assert.match(nativeUi,/data-action="tb-file-upload"/);
 assert.match(nativeUi,/data-action="tb-timer-start"/);
 assert.match(nativeUi,/data-action="tb-archive"/);
 assert.match(applicationCss,/\.tb-app/);
});
