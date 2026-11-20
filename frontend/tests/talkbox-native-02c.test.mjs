import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TalkBoxNativeClient} from '../talkbox-native.js';

const workspaceId='00000000-0000-4000-8000-000000000001';
const initial={id:'301',name:'Native timer',status:'Working on it',version:1,
 date:null,person:[],subitems:[],updates:[],timeTracking:{hours:0,minutes:0,totalSeconds:0}};

function transport({corruptReadback=false,stopCorruption=false}={}){
 let current=structuredClone(initial);
 const calls=[];
 const api={rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='toolbox_issues_get_issue'){
   const result=structuredClone(current);
   if(corruptReadback&&result.timeTracking?.running)
    result.timeTracking.running.startedAt='2020-01-01T00:00:00.000Z';
   if(stopCorruption&&!result.timeTracking?.running&&result.version>2)
    result.timeTracking.totalSeconds=9999999;
   return result;
  }
  if(name==='toolbox_issues_timer_start'){
   if(args.p_expected_version!==current.version)throw Error('stale issue version');
   current={...current,version:current.version+1,timeTracking:{
    ...current.timeTracking,clockSource:'postgresql',
    running:{startedAt:'2026-11-20T06:00:00.000Z'}}};
   return structuredClone(current);
  }
  if(name==='toolbox_issues_timer_stop'){
   if(args.p_expected_version!==current.version)throw Error('stale issue version');
   current={...current,version:current.version+1,timeTracking:{
    ...current.timeTracking,running:null,clockSource:'postgresql',
    totalSeconds:3600,hours:1,minutes:0}};
   return structuredClone(current);
  }
  if(name==='toolbox_issues_native_v2_capabilities')
   return {threadedReplies:true,attachmentRemoval:true,serverTimer:true};
  throw Error(name);
 }};
 return {client:new TalkBoxNativeClient({api,workspaceId}),calls,read:()=>structuredClone(current)};
}

test('signed native capabilities verify server-authoritative timer readiness',async()=>{
 const {client}=transport();
 assert.deepEqual(await client.nativeV2Capabilities(),{
  threadedReplies:true,attachmentRemoval:true,serverTimer:true
 });
});
test('server timer start and stop use only signed RPCs, ignoring local browser clock',async()=>{
 const {client,calls}=transport();
 const fakeDate=new Date('2040-01-01T00:00:00Z');
 const first=await client.startTimerVerified('301',fakeDate,{serverTimer:true});
 assert.equal(first.timeTracking.running.startedAt,'2026-11-20T06:00:00.000Z');
 const reopened=await client.get('301');
 assert.equal(reopened.timeTracking.running.startedAt,first.timeTracking.running.startedAt);
 const finished=await client.stopTimerVerified('301',fakeDate,{serverTimer:true});
 assert.equal(finished.timeTracking.totalSeconds,3600);
 assert.equal(finished.timeTracking.running,null);
 assert.equal(calls.filter(([name])=>name==='toolbox_issues_timer_start').length,1);
 assert.equal(calls.filter(([name])=>name==='toolbox_issues_timer_stop').length,1);
 assert.equal(calls.filter(([name])=>name==='toolbox_issues_update_issue').length,0);
});
test('a mismatched server timestamp cannot pass signed readback',async()=>{
 const {client}=transport({corruptReadback:true});
 await assert.rejects(()=>client.startTimerVerified('301',new Date(),{serverTimer:true}),
  /server timer start could not be verified/i);
});
test('mismatched final accumulated seconds cannot pass signed readback',async()=>{
 const {client}=transport({stopCorruption:true});
 await client.startTimerVerified('301',new Date(),{serverTimer:true});
 await assert.rejects(()=>client.stopTimerVerified('301',new Date(),{serverTimer:true}),
  /server timer stop could not be verified/i);
});
test('signed browser uses server timer only when the deployed capability reports it',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/serverTimer:talkBoxState\.features\?\.serverTimer===true/);
 const sql=readFileSync('supabase/migration-candidates/cp_tb_independent_native_02c_server_timer.sql','utf8');
 assert.match(sql,/clock_timestamp\(\)/);
 assert.match(sql,/p_expected_version/);
 assert.match(sql,/private\.toolbox_issues_has_access/);
 assert.doesNotMatch(sql,/monday\.com|service_role/);
});
