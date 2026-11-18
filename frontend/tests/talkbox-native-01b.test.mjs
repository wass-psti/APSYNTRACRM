import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileTalkBoxIssueIdentities,reconcileTalkBoxSubitemIdentities,TALKBOX_SOURCE_BOARD_ID,TALKBOX_SOURCE_SUBITEM_BOARD_ID} from '../talkbox-reconciliation.js';
import {TalkBoxNativeClient} from '../talkbox-native.js';
import {renderTalkBoxApplication} from '../talkbox-ui.js';

const workspaceId='00000000-0000-4000-8000-000000000001';
const issue={id:'101',name:'Operational issue',status:'Working on it',
 version:1,person:[],updates:[],subitems:[]};
test('reconciliation remains blocked on partial evidence and never pairs by title',()=>{
 const partial=reconcileTalkBoxIssueIdentities({
  sourceIssues:[{id:'65764141',name:'Fueltrans (UNIOIL)',boardId:TALKBOX_SOURCE_BOARD_ID}],
  crmIssues:[{id:'1',name:'Fueltrans (UNIOIL)'}]});
 assert.equal(partial.status,'BLOCKED');
 assert.equal(partial.counts.matched,0);
 assert.equal(partial.counts.unmapped,1);
 assert.equal(partial.writesAuthorized,false);
 assert.equal(partial.subitemBoardId,TALKBOX_SOURCE_SUBITEM_BOARD_ID);
});
test('reconciliation matches only persistent source identity and detects duplicates',()=>{
 const plan=reconcileTalkBoxIssueIdentities({
  sourceComplete:true,crmComplete:true,
  sourceIssues:[{id:'65764141',name:'Fueltrans (UNIOIL)'}],
  crmIssues:[{id:'101',mondayItemId:'65764141'}]});
 assert.equal(plan.status,'MATCHED');assert.equal(plan.counts.matched,1);
 assert.deepEqual(plan.matched,[{sourceId:'65764141',crmId:'101'}]);
 const duplicate=reconcileTalkBoxIssueIdentities({
  sourceComplete:true,crmComplete:true,sourceIssues:[{id:'65764141'}],
  crmIssues:[{id:'101',mondayItemId:'65764141'},{id:'102',mondayItemId:'65764141'}]});
 assert.equal(duplicate.status,'BLOCKED');
 assert.match(duplicate.violations.join(' '),/duplicate CRM source reference/);
 assert.throws(()=>reconcileTalkBoxIssueIdentities({sourceIssues:[],crmIssues:[],sourceBoardId:'wrong'}),/Unexpected/);
});
test('signed issue creation, status edits, updates and subtasks verify second read',async()=>{
 let state={...issue};
 let nextSub=20;
 const calls=[];
 const api={rpc:async(name,args)=>{
  calls.push(name);
  if(name.endsWith('create_issue')){state={...issue,id:'101',name:args.p_fields.name};return state;}
  if(name.endsWith('update_issue')){state={...state,...args.p_updates,version:state.version+1};return state;}
  if(name.endsWith('add_update')){
   state={...state,version:state.version+1,updates:[...state.updates,{id:'7',text_body:args.p_text}]};
   return {id:'7',text_body:args.p_text};
  }
  if(name.endsWith('create_subitem')){
   const sub={id:String(nextSub++),name:args.p_fields.name,status:'Working on it'};
   state={...state,version:state.version+1,subitems:[...state.subitems,sub]};
   return sub;
  }
  if(name.endsWith('update_subitem')){
   const sub=state.subitems.find(x=>x.id===args.p_subitem_id);
   sub.status=args.p_updates.status;state={...state,version:state.version+1};
   return sub;
  }
  if(name.endsWith('get_issue'))return structuredClone(state);
  throw Error('Unexpected '+name);
 }};
 const client=new TalkBoxNativeClient({api,workspaceId});
 assert.equal((await client.createVerified('New issue')).name,'New issue');
 assert.equal((await client.updateVerified('101',{status:'Done'},1)).status,'Done');
 assert.equal((await client.postVerified('101','Progress')).record.updates.length,1);
 let detail=await client.createSubitem('101','Review notes');
 assert.equal(detail.subitems[0].name,'Review notes');
 detail=await client.updateSubitem('101','20','Done');
 assert.equal(detail.subitems[0].status,'Done');
 assert.equal(calls.filter(n=>n.endsWith('get_issue')).length,5);
});
test('a signed write receipt without corresponding readback is not reported as accepted',async()=>{
 const api={rpc:async(name,args)=>{
  if(name.endsWith('create_issue'))return {...issue,name:args.p_fields.name};
  if(name.endsWith('get_issue'))return {...issue,name:'Old value'};
  throw Error('unexpected');
 }};
 await assert.rejects(()=>new TalkBoxNativeClient({api,workspaceId}).createVerified('New value'),/readback did not match/);
});
test('subtask controls use delegated actions and never expose unescaped task titles',()=>{
 const html=renderTalkBoxApplication({page:{items:[issue],total:1},selected:{
  ...issue,subitems:[{id:'20',name:'<script>attack</script>',status:'Stuck'}]},canEdit:true});
 assert.match(html,/data-action="tb-subtask-new"/);
 assert.match(html,/data-action="tb-subtask-status"/);
 assert.doesNotMatch(html,/<script>/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'tb-subtask-new':/);
 assert.match(app,/case 'tb-subtask-status':/);
 assert.match(app,/createVerified/);
 assert.match(app,/updateVerified/);
 assert.match(app,/postVerified/);
});

test('subitem reconciliation rejects incorrect board provenance despite matching titles',()=>{
 const source={id:'88',boardId:TALKBOX_SOURCE_SUBITEM_BOARD_ID,parentId:'65764141',name:'Check installation'};
 const mismatched=reconcileTalkBoxSubitemIdentities({sourceSubitems:[{...source,boardId:'18370784141'}],crmSubitems:[],sourceComplete:true,crmComplete:true});
 assert.equal(mismatched.status,'BLOCKED');
 assert.match(mismatched.violations.join(' '),/board identity mismatch/);
 const matching=reconcileTalkBoxSubitemIdentities({
  sourceSubitems:[source],crmSubitems:[{id:'20',mondayItemId:'88',name:'Different title'}],
  sourceComplete:true,crmComplete:true});
 assert.equal(matching.status,'MATCHED');
 assert.equal(matching.counts.matched,1);
 assert.equal(matching.writesAuthorized,false);
});

test('issue drawer follows canonical browser navigation and cached board refresh',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'tb-open':\{location\.hash=talkBoxIssueHref\(button\.dataset\.id\)/);
 assert.match(app,/case 'tb-close':\{talkBoxState\.selected=null;location\.hash=TALKBOX_APPLICATION_ROUTE/);
 assert.match(app,/if\(tab==='talkbox'\)await loadTalkBox\(\)/);
 assert.match(app,/return refreshVisibleBoard\(boardId,tab\)/);
 assert.match(app,/if\(!issueId\)talkBoxState\.selected=null/);
});

test('subitem reconciliation refuses duplicate destination record identities',()=>{
 const plan=reconcileTalkBoxSubitemIdentities({
  sourceSubitems:[{id:'88',boardId:TALKBOX_SOURCE_SUBITEM_BOARD_ID,parentId:'65764141'}],
  crmSubitems:[
   {id:'20',mondayItemId:'88'},
   {id:'20',mondayItemId:'89'}
  ],
  sourceComplete:true,crmComplete:true
 });
 assert.equal(plan.status,'BLOCKED');
 assert.match(plan.violations.join(' '),/duplicate CRM subitem ID/);
});
