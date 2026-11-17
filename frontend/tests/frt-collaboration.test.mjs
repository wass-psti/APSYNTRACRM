import test from 'node:test';
import assert from 'node:assert/strict';
import {
 loadFRTComments,addFRTComment,loadFRTAuditPage,frtActorLabel,
 frtEventLabel,frtAuditDetailEntries,frtAuditCsv,projectFRTNotifications,loadFRTDeadlineSnapshots,loadFRTAgingSummary
} from '../frt-collaboration.js';
const workspaceId='22222222-2222-4222-8222-222222222222';
const requestId='11111111-1111-4111-8111-111111111111';
const otherId='33333333-3333-4333-8333-333333333333';
const event={id:'7',workspace_id:workspaceId,fund_request_id:requestId,user_id:otherId,
 action:'REQUEST_CREATED',details:{voucher:'DV-WASS-2026-001',company:'WASS',total:430.5},created_at:'2026-11-16T10:00:00Z'};
function authWith(rows){const calls=[];return {calls,auth:{isSignedIn:true,authorized:async(path,options)=>{calls.push({path,options});return rows;}}};}
test('comments read from existing table in chronological order with strict request scope',async()=>{
 const fixture=authWith([{id:requestId,workspace_id:workspaceId,fund_request_id:requestId,user_id:otherId,body:'Please review the receipt.',created_at:'2026-11-16T10:00:00Z'}]);
 const rows=await loadFRTComments({auth:fixture.auth,workspaceId,requestId});
 assert.equal(rows.length,1);assert.equal(rows[0].body,'Please review the receipt.');
 const url=new URL('https://example.test'+fixture.calls[0].path);
 assert.equal(url.pathname,'/rest/v1/frt_comments');assert.equal(url.searchParams.get('workspace_id'),'eq.'+workspaceId);
 assert.equal(url.searchParams.get('fund_request_id'),'eq.'+requestId);assert.equal(url.searchParams.get('order'),'created_at.asc,id.asc');
});
test('comment read rejects rows from another workspace or request',async()=>{
 const fixture=authWith([{...{id:requestId,workspace_id:otherId,fund_request_id:requestId,user_id:otherId,body:'wrong scope',created_at:'2026-11-16T10:00:00Z'}}]);
 await assert.rejects(loadFRTComments({auth:fixture.auth,workspaceId,requestId}),/comment response contract/);
});
test('comment write reuses frt_add_comment exactly once and validates receipt',async()=>{
 const calls=[];const api={rpc:async(...args)=>{calls.push(args);return {ok:true};}};
 assert.deepEqual(await addFRTComment({api,workspaceId,requestId,body:'  Looks good.  '}),{ok:true});
 assert.deepEqual(calls,[['frt_add_comment',{p_workspace_id:workspaceId,p_request_id:requestId,p_body:'Looks good.'}]]);
 await assert.rejects(addFRTComment({api,workspaceId,requestId,body:' '}),/Enter a comment/);
});
test('audit reader uses safe company request list, server filters, and bounded pagination',async()=>{
 const requests=[{id:requestId,workspace_id:workspaceId,company_code:'WASS',title:'Office supplies',voucher_no:'DV-WASS-001',status:'DONE',liquidation_status:'NOT_SUBMITTED',filing_status:'NOT_FILED'}];
 const fixture=authWith([event]);let rpcCalls=0;
 const api={rpc:async(name,args)=>{rpcCalls++;assert.equal(name,'frt_board_list_safe');assert.deepEqual(args,{p_workspace_id:workspaceId,p_company:'WASS',p_search:''});return requests;}};
 const page=await loadFRTAuditPage({auth:fixture.auth,api,workspaceId,companyCode:'WASS',search:'office supplies',offset:50,limit:50});
 assert.equal(rpcCalls,1);assert.equal(page.events.length,1);assert.equal(page.requests[0].voucher,'DV-WASS-001');
 const url=new URL('https://example.test'+fixture.calls[0].path);
 assert.equal(url.searchParams.get('fund_request_id'),'in.('+requestId+')');
 assert.equal(url.searchParams.get('offset'),'50');assert.equal(url.searchParams.get('limit'),'51');
 assert.match(url.searchParams.get('or'),/action\.ilike/);assert.match(url.searchParams.get('or'),/details->>reason/);
});
test('audit filters selected request and action, rejecting a request outside the company',async()=>{
 const fixture=authWith([event]);const api={rpc:async()=>[{id:requestId,workspace_id:workspaceId,company_code:'WASS',title:'Request',voucher_no:null,status:'PENDING_APPROVAL',liquidation_status:'NOT_SUBMITTED',filing_status:'NOT_FILED'}]};
 await loadFRTAuditPage({auth:fixture.auth,api,workspaceId,companyCode:'WASS',requestId,action:'REQUEST_CREATED'});
 const url=new URL('https://example.test'+fixture.calls[0].path);
 assert.equal(url.searchParams.get('fund_request_id'),'in.('+requestId+')');assert.equal(url.searchParams.get('action'),'eq.REQUEST_CREATED');
 await assert.rejects(loadFRTAuditPage({auth:fixture.auth,api,workspaceId,companyCode:'WASS',requestId:otherId}),/not in the current company list/);
});
test('activity labels and actor fallback do not invent other members display names',()=>{
 assert.equal(frtActorLabel(otherId,{currentUserId:requestId,currentUserName:'Current User'}),'Member · 33333333');
 assert.equal(frtActorLabel(requestId,{currentUserId:requestId,currentUserName:'Current User'}),'Current User');
 assert.equal(frtEventLabel('GM_VERIFIED'),'General Manager verification recorded');
 assert.equal(frtEventLabel('UNKNOWN_EVENT'),'Unknown event');
});
test('audit detail projection allowlists relevant workflow fields only',()=>{
 const values=frtAuditDetailEntries({voucher:'DV-1',company:'WASS',total:430.5,reason:'Correction',recipientAccount:'123456',targetUserId:otherId});
 assert.deepEqual(values.map(v=>v.label),['Voucher','Company','Total','Reason']);
});
test('CSV export quotes fields and escapes embedded quotes',()=>{
 const csv=frtAuditCsv([{...event,details:{reason:'Supplier said "ready"'}}],new Map([[requestId,{voucher:'DV-1',title:'Office supplies'}]]));
 assert.ok(csv.startsWith('\uFEFF"Timestamp","Action"'));
 assert.match(csv, /Supplier said ""ready""/);
});
test('notifications are derived only from persisted events and authoritative 72-hour snapshots',()=>{
 const requests=[{requestId,title:'Office supplies',voucher:'DV-WASS-001'}];
 const now=Date.parse('2026-11-16T12:00:00Z');
 const notifications=projectFRTNotifications({events:[{id:'7',action:'REQUEST_CREATED',requestId,createdAt:'2026-11-16T10:00:00Z'}],requests,
  bankSnapshots:[{requestId,snapshot:{recorded:true,eligible:true,source:'STAFF_RECORDED_BANK_EVIDENCE',liquidationStatus:'SUBMITTED',deadlineAt:'2026-11-16T18:00:00Z'}}],now});
 assert.equal(notifications.length,2);assert.equal(notifications[0].type,'due-soon');assert.equal(notifications[0].requestId,requestId);
 const overdue=projectFRTNotifications({requests,bankSnapshots:[{requestId,snapshot:{recorded:true,eligible:true,source:'STAFF_RECORDED_BANK_EVIDENCE',liquidationStatus:'SUBMITTED',deadlineAt:'2026-11-16T11:00:00Z'}}],now});
 assert.equal(overdue[0].type,'overdue');
 const approved=projectFRTNotifications({requests,bankSnapshots:[{requestId,snapshot:{recorded:true,eligible:false,source:'STAFF_RECORDED_BANK_EVIDENCE',liquidationStatus:'APPROVED',deadlineAt:'2026-11-16T11:00:00Z'}}],now});
 assert.equal(approved.length,0);
 const noBank=projectFRTNotifications({requests,bankSnapshots:[{requestId,snapshot:{recorded:false,eligible:true,source:'NO_BANK_EXECUTION',liquidationStatus:'NOT_SUBMITTED',deadlineAt:null}}],now});
 assert.equal(noBank.length,0);
});
test('notifications never invent a request target for unknown audit events',()=>{
 const notifications=projectFRTNotifications({events:[{id:'8',action:'REQUEST_CREATED',requestId:otherId,createdAt:'2026-11-16T10:00:00Z'}],requests:[]});
 assert.deepEqual(notifications,[]);
});


test('deadline snapshots query only finance-approved candidates with bounded concurrency and authoritative 72-hour arithmetic', async()=>{
 const requests=[
  {requestId,status:'DONE',liquidationStatus:'NOT_SUBMITTED'},
  {requestId:otherId,status:'PENDING_APPROVAL',liquidationStatus:'NOT_SUBMITTED'},
  {requestId:'44444444-4444-4444-8444-444444444444',status:'DONE',liquidationStatus:'APPROVED'}
 ];
 const calls=[];let active=0,maxActive=0;
 const api={rpc:async(name,args)=>{
  calls.push({name,args});active++;maxActive=Math.max(maxActive,active);
  await new Promise(resolve=>setTimeout(resolve,5));active--;
  return {workspaceId,requestId:args.p_request_id,recorded:true,eligible:true,liquidationStatus:'SUBMITTED',source:'STAFF_RECORDED_BANK_EVIDENCE',
   executedAt:'2026-11-13T12:00:00Z',deadlineAt:'2026-11-16T12:00:00Z'};
 }};
 const snapshots=await loadFRTDeadlineSnapshots({api,workspaceId,requests,concurrency:2});
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'frt_bank_execution_snapshot');
 assert.equal(calls[0].args.p_request_id,requestId);
 assert.equal(snapshots.length,1);
 assert.equal(snapshots[0].snapshot.deadlineAt,'2026-11-16T12:00:00Z');
 assert.ok(maxActive<=2);
});

test('deadline snapshot failures are surfaced per request without blocking other notifications',async()=>{
 const requests=[
  {requestId,status:'DONE',liquidationStatus:'NOT_SUBMITTED'},
  {requestId:otherId,status:'DONE',liquidationStatus:'NOT_SUBMITTED'}
 ];
 const api={rpc:async(_name,args)=>{
  if(args.p_request_id===requestId)throw new Error('requestor may only read own snapshot');
  return {workspaceId,requestId:otherId,recorded:false,eligible:true,liquidationStatus:'NOT_SUBMITTED',source:'NO_BANK_EXECUTION',executedAt:null,deadlineAt:null};
 }};
 const snapshots=await loadFRTDeadlineSnapshots({api,workspaceId,requests});
 assert.equal(snapshots.length,1);
 assert.equal(snapshots[0].requestId,requestId);
 assert.match(snapshots[0].error.message,/own snapshot/);
});

test('discussion, activity and notification renderers escape persisted text and expose actionable request navigation',async()=>{
 const {renderFRTComments,renderFRTActivityEvents,renderFRTNotifications}=await import('../frt-collaboration-ui.js');
 const malicious={id:requestId,workspaceId,requestId,userId:otherId,body:'<script>alert(1)</script>',createdAt:'2026-11-16T10:00:00Z'};
 const commentHtml=renderFRTComments([malicious]);
 assert.doesNotMatch(commentHtml,/<script>/);
 assert.match(commentHtml,/&lt;script&gt;/);
 const activityHtml=renderFRTActivityEvents([{id:'7',requestId,userId:otherId,action:'REQUEST_CREATED',details:{reason:'<img src=x>'},createdAt:'2026-11-16T10:00:00Z'}],[{requestId,title:'<b>Request</b>',voucher:'DV-1'}]);
 assert.equal(activityHtml.includes('<b>Request</b>'),false);
 assert.match(activityHtml,/&lt;b&gt;Request/);
 const notificationHtml=renderFRTNotifications([{id:'n1',title:'Liquidation overdue',message:'Deadline passed',requestId,createdAt:'2026-11-16T10:00:00Z',type:'overdue'}],[{requestId,voucher:'DV-1'}]);
 assert.match(notificationHtml,/data-frt-notification-request=/);
 assert.match(notificationHtml,/Open DV-1/);
});

test('FRT collaboration UI wiring uses existing comment RPC and no new notification persistence',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const data=readFileSync(new URL('../data.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../frt-finance-ui.js',import.meta.url),'utf8');
 assert.match(app,/openFRTDiscussionDialog/);
 assert.match(app,/openFRTActivityDialog/);
 assert.match(app,/openFRTNotificationsDialog/);
 assert.match(app,/fundTracker\.addComment\(/);
 assert.match(app,/fundTracker\.loadDeadlineSnapshots\(/);
 assert.match(app,/fundTracker\.loadAgingSummary\(/);
 assert.match(app,/renderFRTNotificationSummary/);
 assert.match(data,/frt_add_comment/);
 assert.match(data,/frt_bank_execution_snapshot/);
 assert.match(html,/data-frt-section="notifications"/);
 assert.doesNotMatch(app,/frt_create_notification|frt_notifications/);
 assert.doesNotMatch(app,/frt_get_request|frt_list_requests/);
});

test('liquidation aging summary reuses the existing 72-hour company RPC',async()=>{
 const calls=[];
 const api={rpc:async(name,args)=>{
  calls.push({name,args});
  return {company_code:'WASS',source:'STAFF_RECORDED_BANK_EVIDENCE',deadline_hours:72,
   pending_total:2,awaiting_bank_execution:1,on_track:0,due_soon:1,overdue:0,completed:4};
 }};
 const aging=await loadFRTAgingSummary({api,workspaceId,companyCode:'WASS'});
 assert.deepEqual(calls,[{name:'frt_liquidation_aging_company',args:{p_workspace_id:workspaceId,p_company:'WASS'}}]);
 assert.equal(aging.pending_total,2);assert.equal(aging.due_soon,1);
});

test('liquidation aging summary rejects inconsistent or unverified backend aggregates',async()=>{
 const api={rpc:async()=>({company_code:'WASS',source:'UNKNOWN',deadline_hours:48,
  pending_total:2,awaiting_bank_execution:1,on_track:0,due_soon:1,overdue:0,completed:4})};
 await assert.rejects(loadFRTAgingSummary({api,workspaceId,companyCode:'WASS'}),/summary contract is invalid/);
});

test('notification summary renders authoritative company aging counters',async()=>{
 const {renderFRTNotificationSummary}=await import('../frt-collaboration-ui.js');
 const html=renderFRTNotificationSummary({pending_total:3,awaiting_bank_execution:1,on_track:0,due_soon:1,overdue:1,completed:4});
 assert.match(html,/Pending liquidation: 3/);assert.match(html,/Due within 24 hours: 1/);assert.match(html,/Overdue: 1/);
});
