import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readTimeTrackerViewPreference,saveTimeTrackerViewPreference} from '../apps/TimeTracker/time-tracker-preferences.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';

const scope={
 userId:'a1208d7e-8d27-4f77-947a-9c6fcd742ed0',
 workspaceId:'00000000-0000-4000-8000-000000000001',
 boardId:'46bf4ee7-368a-4c35-842c-8593ea1f6ac3'
};
function storage(){
 const data=new Map();
 return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
}
test('TimeTracker restores Log and OT independently of a fresh view state',()=>{
 const store=storage();
 assert.equal(readTimeTrackerViewPreference(store,scope),'clock');
 for(const view of ['log','ot','overview','reports','calendar','hours','clock']){
  assert.equal(saveTimeTrackerViewPreference(store,scope,view),true);
  assert.equal(readTimeTrackerViewPreference(store,{...scope}),view);
 }
});
test('TimeTracker refresh preference is isolated by signed actor, workspace and board',()=>{
 const store=storage();
 saveTimeTrackerViewPreference(store,scope,'ot');
 const other='ed2ef1bc-50ea-4eea-8b83-2d6ec8434797';
 for(const key of ['userId','workspaceId','boardId'])
  assert.equal(readTimeTrackerViewPreference(store,{...scope,[key]:other}),'clock');
 assert.equal(readTimeTrackerViewPreference(store,{}),'clock');
});
test('Invalid, privileged and unavailable preferences fall back to Clock',()=>{
 const store=storage();
 for(const view of ['employees','team','gps','monitor','invalid']){
  saveTimeTrackerViewPreference(store,scope,view);
  assert.equal(readTimeTrackerViewPreference(store,scope),'clock');
 }
 assert.equal(readTimeTrackerViewPreference({getItem:()=>{throw Error('blocked');}},scope),'clock');
 assert.equal(saveTimeTrackerViewPreference(null,scope,'ot'),false);
});
test('Log and OT are adjacent and retain selected navigation after rendering',()=>{
 const result={status:'VERIFIED_READ',access:{moduleRole:'Employee',name:'Employee'},
  records:[],active:null,otRequests:[]};
 for(const view of ['log','ot']){
  const html=renderTimeTrackerNative({result,view});
  assert.match(html,new RegExp('aria-selected="true" data-action="tt-tab" data-target="'+view+'"'));
  assert.ok(html.indexOf('data-target="log"')<html.indexOf('data-target="ot"'));
  assert.ok(html.indexOf('data-target="ot"')<html.indexOf('data-target="reports"'));
 }
});
test('Initial attendance load restores the view before requesting signed data',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const restore=app.indexOf('if(enteringTimeTracker)state.ttView=readTimeTrackerViewPreference');
 assert.ok(restore>=0);
 assert.ok(app.indexOf('await loadTimeTracker(seq,nativeModuleId',restore)>restore);
 assert.match(app,/saveTimeTrackerViewPreference\(timeTrackerViewStorage\(\),timeTrackerWorkNoteScope\(\)\|\|\{\},next\)/);
});
