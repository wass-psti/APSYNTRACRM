import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTimeTrackerWorkNoteDraft} from '../time-tracker-offsite-note.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';
import {renderTimeTrackerOjtClock} from '../apps/TimeTracker/time-tracker-ojt.js';

const scope={userId:'signed-user',workspaceId:'signed-workspace',boardId:'time-board'};
const access={...scope,email:'employee@example.test',employeeDepartment:'Engineering',
 attendanceWritesAccepted:true,moduleRole:'Employee'};
const text='Review material requests & prepare <engineering> work plan.';
const app=readFileSync('frontend/app.js','utf8');

function clock(draft,extra={}){
 return renderTimeTrackerNative({
  result:{status:'VERIFIED_READ',access,active:null,records:[]},
  view:'clock',locationPreference:'Offsite (Home)',workPlanDraft:draft,
  now:new Date('2026-11-23T07:00:00Z'),...extra
 });
}

test('offsite draft is preserved exactly through repeated GPS and verification rerenders',()=>{
 const draft=createTimeTrackerWorkNoteDraft();
 draft.write(scope,text);
 for(const properties of [
  {busy:true,clockStage:'location',geoPromptVisible:true},
  {busy:false,clockStage:'idle',geoPromptVisible:true,geoPermission:'denied',geoMessage:'Permission denied'},
  {busy:false,clockStage:'idle',geoPromptVisible:true,geoPermission:'unavailable',geoMessage:'GPS timeout'},
  {busy:false,error:'Unable to record clock in.'},
  {busy:true,clockStage:'verifying',clockPending:true,clockPendingAction:'clock-in'}
 ]){
  const html=clock(draft.read(scope),properties);
  assert.match(html,/id="tt-note"/);
  assert.match(html,/Review material requests &amp; prepare &lt;engineering&gt; work plan\./);
  assert.equal(draft.read(scope),text);
 }
});

test('office switch does not erase a home draft or accidentally send it as an Office payload',()=>{
 const draft=createTimeTrackerWorkNoteDraft();
 draft.write(scope,'  Keep before switching location  ');
 const html=clock(draft.read(scope),{locationPreference:'Office-Base Duty'});
 assert.match(html,/id="tt-note-wrap" hidden/);
 assert.match(html,/Keep before switching location/);
 assert.match(app,/actionName==='clock-in'&&location==='Offsite \(Home\)'\?/);
 assert.doesNotMatch(app,/if\(!showHomeNote\)note\.value='';/);
 assert.equal(draft.read(scope),'  Keep before switching location  ');
});

test('draft is isolated by user, workspace, board and selected intern',()=>{
 const draft=createTimeTrackerWorkNoteDraft();
 draft.write(scope,text);
 assert.equal(draft.read({...scope,userId:'different-user'}),'');
 assert.equal(draft.read({...scope,workspaceId:'foreign-workspace'}),'');
 assert.equal(draft.read({...scope,boardId:'foreign-board'}),'');
 assert.equal(draft.read({...scope,internId:'intern-A'}),'');
 draft.clear({...scope,userId:'another-user'});
 assert.equal(draft.read(scope),text);
 const internScope={...scope,internId:'intern-A'};
 draft.write(internScope,'Intern A work plan');
 assert.equal(draft.read(scope),'');
 assert.equal(draft.read({...scope,internId:'intern-B'}),'');
 const html=renderTimeTrackerOjtClock({
  roster:{mode:'SHARED_LOGIN',interns:[]},
  selected:{id:'intern-A',name:'Intern A'},
  workPlanDraft:draft.read(internScope)
 });
 assert.match(html,/id="tt-ojt-note"/);
 assert.match(html,/Intern A work plan/);
 draft.clear(internScope);
 assert.equal(draft.read(internScope),'');
});

test('clears only for a confirmed clock-in or explicit identity teardown, not before GPS or uncertain commit',()=>{
 const draft=createTimeTrackerWorkNoteDraft();
 draft.write(scope,text);
 assert.match(app,/if\(action==='clock-in'\)ttWorkNoteDraft\.clear\(timeTrackerWorkNoteScope\(\)\)/);
 assert.match(app,/if\(actionName==='clock-in'\)ttWorkNoteDraft\.clear\(timeTrackerWorkNoteScope\(\)\)/);
 assert.match(app,/if\(action==='clock-in'\)ttWorkNoteDraft\.clear\(timeTrackerWorkNoteScope\(selected\.id\)\)/);
 assert.match(app,/auth\.onExpired=\(\)=>\{ttWorkNoteDraft\.clear\(\)/);
 draft.clear(scope);
 assert.equal(draft.read(scope),'');
 draft.write(scope,text);
 draft.clear();
 assert.equal(draft.read(scope),'');
});

test('volatility and length bounds avoid persisting sensitive work plans',()=>{
 const draft=createTimeTrackerWorkNoteDraft();
 draft.write(scope,'A'.repeat(800));
 assert.equal(draft.read(scope).length,500);
 assert.equal(draft.read(null),'');
 assert.equal(draft.read({userId:'',workspaceId:'',boardId:''}),'');
 const helper=readFileSync('frontend/time-tracker-offsite-note.js','utf8');
 const draftBody=helper.split('export function createTimeTrackerWorkNoteDraft(){')[1];
 assert.doesNotMatch(draftBody,/localStorage|sessionStorage|fetch\(/);
});
