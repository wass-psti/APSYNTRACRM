import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TalkBoxNativeClient} from '../talkbox-native.js';
import {renderTalkBoxApplication} from '../talkbox-ui.js';

const workspaceId='00000000-0000-4000-8000-000000000001';
const alice='00000000-0000-4000-8000-000000000011';
const bob='00000000-0000-4000-8000-000000000012';
const initial={id:'301',name:'Native issue',status:'Working on it',version:1,
 date:null,person:[],subitems:[],updates:[],timeTracking:{hours:1,minutes:20,totalSeconds:4800}};
function fixture(){
 let issue=structuredClone(initial);
 const calls=[];
 const api={rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='toolbox_issues_users')return [
   {id:alice,name:'Alice',enabled:true},
   {id:bob,name:'Bob',enabled:true},
   {id:'00000000-0000-4000-8000-000000000099',name:'Former member',enabled:false}];
  if(name==='toolbox_issues_get_issue')return structuredClone(issue);
  if(name==='toolbox_issues_update_issue'){
   if(issue.version!==args.p_expected_version)throw Error('stale issue version');
   issue={...issue,...args.p_updates,version:issue.version+1};
   return structuredClone(issue);
  }
  if(name==='toolbox_issues_delete_subitem'){
   issue={...issue,subitems:issue.subitems.filter(x=>x.id!==args.p_subitem_id),version:issue.version+1};
   return {success:true};
  }
  throw Error('Unexpected RPC '+name);
 }};
 return {client:new TalkBoxNativeClient({workspaceId,api}),calls,
         setIssue:(v)=>{issue=structuredClone(v);},read:()=>structuredClone(issue)};
}

test('native workspace directory retrieves existing users, excludes disabled, and retains CRM UUIDs',async()=>{
 const {client,calls}=fixture();
 assert.deepEqual((await client.users()).map(x=>x.id),[alice,bob]);
 assert.deepEqual(calls[0],['toolbox_issues_users',{p_workspace_id:workspaceId}]);
});

test('native assignment verifies signed workspace members and version-checked second read',async()=>{
 const {client,read}=fixture();
 const next=await client.saveAssignees('301',[{id:bob},{id:alice}],1);
 assert.deepEqual(next.person,[{id:bob,name:'Bob'},{id:alice,name:'Alice'}]);
 assert.deepEqual(read().person,next.person);
 await assert.rejects(()=>client.saveAssignees('301',[{id:alice},{id:alice}],2),/distinct/);
 await assert.rejects(()=>client.saveAssignees('301',[{id:'00000000-0000-4000-8000-000000000099'}],2),/current/);
 await assert.rejects(()=>client.saveAssignees('301',[{id:'341'}],2),/CRM user identities/);
});

test('running timer persists across get and refresh, then stops using accumulated seconds',async()=>{
 const {client,read}=fixture();
 const started=await client.startTimerVerified('301',new Date('2026-11-20T08:00:00.000Z'));
 assert.equal(started.timeTracking.running.startedAt,'2026-11-20T08:00:00.000Z');
 assert.equal((await client.get('301')).timeTracking.running.startedAt,started.timeTracking.running.startedAt);
 const stopped=await client.stopTimerVerified('301',new Date('2026-11-20T08:13:30.000Z'));
 assert.equal(stopped.timeTracking.totalSeconds,5610);
 assert.equal(stopped.timeTracking.hours,1);
 assert.equal(stopped.timeTracking.minutes,33);
 assert.equal(stopped.timeTracking.running,null);
 assert.equal(read().version,3);
});

test('duplicate start, stop without active timer and clock reversal fail without mutations',async()=>{
 const {client,read}=fixture();
 await assert.rejects(()=>client.stopTimerVerified('301'),/No TalkBox timer/);
 await client.startTimerVerified('301',new Date('2026-11-20T08:00:00.000Z'));
 await assert.rejects(()=>client.startTimerVerified('301'),/already running/);
 await assert.rejects(()=>client.stopTimerVerified('301',new Date('2026-11-20T07:59:59.000Z')),
  /Invalid elapsed/);
 assert.equal(read().version,2);
});

test('cross-session conflicting timer starts are denied by existing version CAS',async()=>{
 let issue=structuredClone(initial);
 const api={rpc:async(name,args)=>{
  if(name==='toolbox_issues_get_issue')return structuredClone(issue);
  if(name==='toolbox_issues_update_issue'){
   if(issue.version!==args.p_expected_version)throw Error('stale issue version');
   issue={...issue,...args.p_updates,version:issue.version+1};
   return structuredClone(issue);
  }
  throw Error(name);
 }};
 const a=new TalkBoxNativeClient({workspaceId,api});
 const b=new TalkBoxNativeClient({workspaceId,api});
 await a.startTimerVerified('301',new Date('2026-11-20T08:00:00.000Z'));
 await assert.rejects(()=>b.startTimerVerified('301'),/already running/);
 assert.equal(issue.version,2);
});

test('native subtask deletion requires existing selected issue and independent readback',async()=>{
 const {client,setIssue,read}=fixture();
 setIssue({...initial,subitems:[{id:'55',name:'Native child',status:'Done'}]});
 const record=await client.deleteSubitemVerified('301','55');
 assert.equal(record.subitems.length,0);
 assert.equal(read().version,2);
 await assert.rejects(()=>client.deleteSubitemVerified('301','55'),/does not belong/);
});

test('native timer, assignee and delete controls are present without monday services',()=>{
 const html=renderTalkBoxApplication({page:{items:[initial],total:1},
  selected:{...initial,subitems:[{id:'55',name:'Review',status:'Done'}]},canEdit:true});
 assert.match(html,/data-action="tb-assignees"/);
 assert.match(html,/data-action="tb-timer-start"/);
 assert.match(html,/data-action="tb-subtask-delete"/);
 const running=renderTalkBoxApplication({page:{items:[],total:0},selected:{
  ...initial,timeTracking:{...initial.timeTracking,running:{startedAt:'2026-11-20T08:00:00.000Z'}}},canEdit:true});
 assert.match(running,/data-action="tb-timer-stop"/);
 assert.doesNotMatch(running,/data-action="tb-timer-start"/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'tb-assignees':/);
 assert.match(app,/case 'tb-timer-start':/);
 assert.match(app,/case 'tb-subtask-delete':/);
 assert.match(app,/filter:talkBoxState.filter/);
});
