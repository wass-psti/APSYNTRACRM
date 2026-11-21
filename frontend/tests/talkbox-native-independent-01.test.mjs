import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TalkBoxNativeClient} from '../talkbox-native.js';
import {renderTalkBoxApplication} from '../talkbox-ui.js';

const workspaceId='00000000-0000-4000-8000-000000000001';
const base={id:'301',name:'Native issue',status:'Working on it',version:1,
 date:null,person:[],updates:[],subitems:[],timeTracking:{hours:2,minutes:15}};

test('native date update persists through independent signed get and accepts clearing',async()=>{
 let current={...base};const mutations=[];
 const client=new TalkBoxNativeClient({workspaceId,api:{rpc:async(name,args)=>{
  if(name.endsWith('update_issue')){mutations.push(args);current={...current,date:args.p_updates.date,version:2};return {...current};}
  if(name.endsWith('get_issue'))return structuredClone(current);
  throw Error(name);
 }}});
 assert.equal((await client.updateVerified('301',{date:'2026-11-20'},1)).date,'2026-11-20');
 assert.equal(mutations[0].p_updates.date,'2026-11-20');
 assert.equal(Object.hasOwn(mutations[0].p_updates,'timeTracking'),false);
 assert.equal((await client.updateVerified('301',{date:null},2)).date,null);
 await assert.rejects(()=>client.update('301',{date:'2026-02-30'},3),/Invalid target date/);
 await assert.rejects(()=>client.update('301',{date:'not-a-date'},3),/Invalid target date/);
});

test('native subtask rename and status readback with no external source API',async()=>{
 let current={...base,subitems:[{id:'302',name:'Initial',status:'Working on it'}]};
 const calls=[];
 const client=new TalkBoxNativeClient({workspaceId,api:{rpc:async(name,args)=>{
  calls.push(name);
  if(name.endsWith('update_subitem')){
   current={...current,subitems:[{id:'302',...current.subitems[0],...args.p_updates}]};
   return current.subitems[0];
  }
  if(name.endsWith('get_issue'))return structuredClone(current);
  throw Error(name);
 }}});
 const result=await client.updateSubitem('301','302',{name:'Review equipment',status:'Done'});
 assert.equal(result.subitems[0].name,'Review equipment');
 assert.equal(result.subitems[0].status,'Done');
 assert.equal(calls.length,2);
 await assert.rejects(()=>client.updateSubitem('301','302',{name:'  '}),/Subtask name/);
});

test('archiving verifies complete active pagination, not just the first page',async()=>{
 const calls=[];const api={rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name.endsWith('archive_issue'))return {success:true,id:'301'};
  if(name.endsWith('list_issues'))return args.p_cursor?
   {items:[],cursor:null,total:2}:
   {items:[{...base,id:'200'}],cursor:'1',total:2};
  throw Error(name);
 }};
 const client=new TalkBoxNativeClient({api,workspaceId});
 await client.archiveVerified('301');
 assert.equal(calls.filter(([name])=>name.endsWith('list_issues')).length,2);
 assert.equal(calls[1][1].p_workspace_id,workspaceId);
});

test('archiving refuses a still-active item on later pages',async()=>{
 const api={rpc:async(name,args)=>{
  if(name.endsWith('archive_issue'))return {success:true,id:'301'};
  if(name.endsWith('list_issues'))return args.p_cursor?
   {items:[base],cursor:null,total:2}:
   {items:[{...base,id:'200'}],cursor:'1',total:2};
  throw Error(name);
 }};
 await assert.rejects(()=>new TalkBoxNativeClient({api,workspaceId}).archiveVerified('301'),/remains in the active/);
});

test('native UI has no monday runtime dependency and supports date, subtasks and archiving',()=>{
 const html=renderTalkBoxApplication({page:{items:[base],total:1},
  selected:{...base,subitems:[{id:'302',name:'Fix <script>x</script>',status:'Stuck'}]},
  canEdit:true});
 assert.match(html,/Native APSYNTRA CRM workspace records/);
 assert.doesNotMatch(html,/monday\.com|not yet synchronized/i);
 assert.match(html,/data-action="tb-archive"/);
 assert.match(html,/data-action="tb-subtask-status"/);
 assert.match(html,/Tracked time: 2h 15m/);
 assert.doesNotMatch(html,/<script>/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'tb-archive':/);
 assert.match(app,/input\('Target date \(optional\)','date'/);
 assert.match(app,/case 'tb-subtask-status':/);
});

test('native issues filter through workspace-scoped backend and retain pagination filter',async()=>{
 const calls=[];
 const api={rpc:async(name,args)=>{calls.push([name,args]);return {
  items:[base],total:1,cursor:null
 };}};
 const client=new TalkBoxNativeClient({api,workspaceId});
 await client.list(null,{name:'Equipment',status:'Stuck'});
 await client.list('50',{name:'Equipment',status:'Stuck'});
 assert.equal(calls[0][0],'toolbox_issues_list_issues');
 assert.deepEqual(calls[0][1].p_where,{name:'Equipment',status:'Stuck'});
 assert.equal(calls[1][1].p_cursor,'50');
 assert.deepEqual(calls[1][1].p_where,calls[0][1].p_where);
 await assert.rejects(()=>client.list(null,{status:'Rejected'}),/Invalid issue status filter/);
});

test('native manual time tracking is persisted and compared by signed readback',async()=>{
 let current={...base};
 const api={rpc:async(name,args)=>{
  if(name.endsWith('update_issue')){
   current={...current,timeTracking:args.p_updates.timeTracking,version:2};
   return structuredClone(current);
  }
  if(name.endsWith('get_issue'))return structuredClone(current);
  throw Error(name);
 }};
 const client=new TalkBoxNativeClient({api,workspaceId});
 assert.deepEqual((await client.updateVerified('301',{timeTracking:{hours:5,minutes:39}},1)).timeTracking,
  {hours:5,minutes:39});
 await assert.rejects(()=>client.update('301',{timeTracking:{hours:-1,minutes:4}},1),/Tracked hours/);
 await assert.rejects(()=>client.update('301',{timeTracking:{hours:1,minutes:60}},1),/Tracked hours/);
});

test('full frontend native TalkBox search and independent storage controls are wired',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'tb-filter':/);
 assert.match(app,/case 'tb-clear-filter':/);
 assert.match(app,/if\(talkBoxState.scope!==scope\)talkBoxState/);
 assert.match(app,/const openId=selectedId\|\|talkBoxState.selected\?\.id/);
 assert.match(app,/case 'tb-time-edit':/);
 assert.match(app,/input\('Tracked hours'/);
 const html=renderTalkBoxApplication({page:{items:[base],total:1},filter:{
  name:'<img src=x>',status:'Done'
 }});
 assert.match(html,/data-action="tb-filter"/);
 assert.match(html,/&lt;img src=x&gt;/);
 assert.doesNotMatch(html,/<img src=x>/);
});

test('native title mutation trims user input without a false readback failure',async()=>{
 let current={...base};
 const api={rpc:async(name,args)=>{
  if(name.endsWith('update_issue')){
   current={...current,name:args.p_updates.name,version:2};
   return structuredClone(current);
  }
  if(name.endsWith('get_issue'))return structuredClone(current);
  throw Error(name);
 }};
 const record=await new TalkBoxNativeClient({api,workspaceId}).updateVerified('301',{name:'  Equipment issue  '},1);
 assert.equal(record.name,'Equipment issue');
});

test('manual time correction preserves existing backend timer metadata',async()=>{
 let current={...base,timeTracking:{hours:2,minutes:15,legacySegments:[{id:'native-log-1'}]}};
 const api={rpc:async(name,args)=>{
  if(name.endsWith('update_issue')){
   current={...current,timeTracking:args.p_updates.timeTracking,version:2};
   return structuredClone(current);
  }
  if(name.endsWith('get_issue'))return structuredClone(current);
  throw Error(name);
 }};
 const value={...current.timeTracking,hours:3,minutes:7};
 const record=await new TalkBoxNativeClient({api,workspaceId}).updateVerified('301',{timeTracking:value},1);
 assert.deepEqual(record.timeTracking.legacySegments,[{id:'native-log-1'}]);
});


test('refresh retains the valid issue list when an archived selection returns 404',async()=>{
 const calls=[];
 const client=new TalkBoxNativeClient({workspaceId,api:{rpc:async(name,args)=>{
  calls.push(name);
  if(name==='toolbox_issues_list_issues')return {items:[base],total:1,cursor:null};
  if(name==='toolbox_issues_get_issue'){
   assert.equal(args.p_issue_id,'302');
   throw Object.assign(new Error('Issue no longer available'),{status:404});
  }
  throw Error(name);
 }}});
 const list=await client.list();
 const selected=await client.getIfAvailable('302');
 assert.equal(list.items.length,1);
 assert.equal(selected,null);
 assert.deepEqual(calls,['toolbox_issues_list_issues','toolbox_issues_get_issue']);
});

test('selected issue recovery does not conceal permission or transport failures',async()=>{
 for(const status of [0,401,403,409,500]){
  const error=Object.assign(new Error('Cannot read selected issue'),{status});
  const client=new TalkBoxNativeClient({workspaceId,api:{rpc:async()=>{throw error;}}});
  await assert.rejects(()=>client.getIfAvailable('301'),e=>e===error);
 }
 await assert.rejects(()=>new TalkBoxNativeClient({workspaceId,api:{rpc:async()=>base}})
  .getIfAvailable('invalid'),/Invalid issue ID/);
});

test('TalkBox refresh uses missing-selection recovery without weakening signed reads',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/const selected=openId\?await client\.getIfAvailable\(openId\):null/);
 assert.match(app,/const selected=await talkBoxClient\(\)\.getIfAvailable\(issueId\)/);
 assert.match(app,/if\(!talkBoxCurrent\(scope\)\)return/);
});
