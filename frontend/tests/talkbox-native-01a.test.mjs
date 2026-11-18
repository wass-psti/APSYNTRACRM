import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findTalkBoxBoard,TALKBOX_APPLICATION_ROUTE,talkBoxIssueHref} from '../talkbox-application.js';
import {TalkBoxNativeClient,projectTalkBoxIssue,talkBoxMetrics} from '../talkbox-native.js';
import {renderTalkBoxApplication} from '../talkbox-ui.js';
import {sidebarActiveRoute} from '../sidebar-active-route.js';

const workspaceId='00000000-0000-4000-8000-000000000001';
const source={id:'12',name:'Fueltrans (UNIOIL)',status:'Working on it',version:3,updates:[],subitems:[]};
test('route binds to existing Toolbox module, no provisioning',()=>{
 const board={id:'abc',name:'Toolbox Issues',status:'active'};
 assert.equal(findTalkBoxBoard([board],name=>name==='Toolbox Issues'?{key:'toolbox'}:null),board);
 assert.equal(findTalkBoxBoard([],()=>({key:'toolbox'})),null);
 assert.equal(talkBoxIssueHref('12'),'#/talkbox/issue/12');
 assert.equal(talkBoxIssueHref('../x'),TALKBOX_APPLICATION_ROUTE);
 assert.equal(sidebarActiveRoute('#/talkbox/issue/12'),'talkbox');
});
test('signed RPC contract reads, creates, updates and posts without side stores',async()=>{
 const calls=[];
 const api={rpc:async(name,args)=>{calls.push([name,args]);
  if(name.endsWith('list_issues'))return {items:[source],cursor:null,total:1};
  if(name.endsWith('get_issue'))return source;
  if(name.endsWith('create_issue'))return source;
  if(name.endsWith('update_issue'))return {...source,...args.p_updates,version:4};
  return {id:'13'};
 }};
 const client=new TalkBoxNativeClient({api,workspaceId});
 const list=await client.list();
 assert.equal(list.total,1);
 assert.equal((await client.get('12')).id,'12');
 await client.create('New issue');
 assert.equal((await client.update('12',{status:'Done'},3)).version,4);
 await client.post('12','Progress recorded');
 assert.deepEqual(calls.map(([n])=>n),[
 'toolbox_issues_list_issues','toolbox_issues_get_issue','toolbox_issues_create_issue',
 'toolbox_issues_update_issue','toolbox_issues_add_update'
 ]);
 assert(calls.every(([,args])=>args.p_workspace_id===workspaceId));
 assert.equal(calls[3][1].p_expected_version,3);
 await assert.rejects(()=>client.post('bad','comment'),/Invalid issue ID/);
 await assert.rejects(()=>client.update('12',{status:'Invalid'},3),/Invalid status/);
});
test('projection, counters and drawer escape untrusted issue content',()=>{
 assert.deepEqual(talkBoxMetrics([{status:'Done'},{status:'Stuck'},{status:'Working on it'}]),{total:3,open:2,done:1,stuck:1});
 const issue=projectTalkBoxIssue({...source,name:'<img src=x onerror=alert(1)>',updates:[{text_body:'<script>alert(1)</script>',creator:{name:'Tester'}}]});
 const html=renderTalkBoxApplication({page:{items:[issue],total:1,cursor:null},selected:issue,canEdit:true});
 assert.match(html,/data-action="tb-open"/);
 assert.match(html,/data-action="tb-post"/);
 assert.match(html,/role="dialog"/);
 assert.doesNotMatch(html,/<script>|<img src=x/);
 assert.match(html,/&lt;script&gt;/);
});
test('host integrates route, signed read and delegated actions without new authorization rules',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const entry=readFileSync('index.html','utf8');
 assert.match(app,/if\(parts\[0\]==='talkbox'\)/);
 assert.match(app,/await loadBoard\(board.id,'talkbox'\)/);
 assert.match(app,/if\(tab==='talkbox'&&moduleByBoardName/);
 assert.match(app,/case 'tb-new':/);
 assert.match(app,/case 'tb-edit':/);
 assert.match(app,/case 'tb-post':/);
 assert.match(readFileSync('frontend/talkbox-application.css','utf8'),/\.tb-app/);
});
