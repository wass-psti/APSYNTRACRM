import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TalkBoxMeetingsClient,meetingDay,meetingReportCsv,TALKBOX_MEETING_STATE_KEY} from '../talkbox-meetings.js';
import {renderTalkBoxApplication} from '../talkbox-ui.js';

const workspaceId='00000000-0000-4000-8000-000000000001';
const issue=(id,status='Working on it')=>({id:String(id),name:'Issue '+id,status,
 date:'2026-11-30',person:[{name:'Operations'}]});
function backend(){
 let value=null,version=0;
 const calls=[];
 const api={rpc:async(name,args)=>{
  calls.push([name,args]);
  assert.equal(args.p_workspace_id,workspaceId);
  assert.equal(args.p_key,TALKBOX_MEETING_STATE_KEY);
  if(name==='toolbox_issues_state_get')return {value,version};
  if(name==='toolbox_issues_state_put'){
   if(args.p_previous_version!==version)throw Object.assign(new Error('Storage version conflict'),{status:409});
   value=args.p_value;version++;
   return {value,version};
  }
  throw Error('Unexpected state RPC '+name);
 }};
 return {client:()=>new TalkBoxMeetingsClient({api,workspaceId}),calls,
  snapshot:()=>({value,version})};
}

test('date-specific meeting sheet persists into signed workspace state and reopens without duplicates',async()=>{
 const db=backend(),first=db.client();
 const result=await first.openOrCreate('2026-11-21',[issue(5),issue(6,'Done')],new Date('2026-11-21T04:00:00Z'));
 assert.equal(result.created,true);
 assert.deepEqual(result.meeting.issueIds,['5']);
 assert.equal(result.meeting.issueSnapshots[0].name,'Issue 5');
 assert.equal(result.ledger.version,1);
 const reopened=await db.client().openOrCreate('2026-11-21',[issue(5)],new Date('2026-11-21T04:03:00Z'));
 assert.equal(reopened.created,false);
 assert.equal(reopened.ledger.version,1);
 assert.equal((await db.client().read()).meetings.length,1);
 assert.equal(db.calls.filter(([name])=>name.endsWith('state_put')).length,1);
});

test('carry-over tracks previous unresolved issues and preserves historical snapshots',async()=>{
 const db=backend();
 await db.client().openOrCreate('2026-11-19',[issue(2),issue(3)],new Date('2026-11-19T08:00:00Z'));
 const second=await db.client().openOrCreate('2026-11-21',[issue(2),issue(3,'Done'),issue(4)],new Date('2026-11-21T08:00:00Z'));
 assert.deepEqual(second.meeting.issueIds,['2','4']);
 assert.deepEqual(second.meeting.carriedIssueIds,['2']);
 assert.equal(second.meeting.carriedFrom,'2026-11-19');
 const history=await db.client().read();
 assert.deepEqual(history.meetings.map(x=>x.date),['2026-11-21','2026-11-19']);
 assert.equal(history.meetings[1].issueSnapshots[0].status,'Working on it');
});

test('meeting notes and newly created issue references survive independent signed readback',async()=>{
 const db=backend();
 await db.client().openOrCreate('2026-11-21',[issue(5)]);
 await db.client().saveNotes('2026-11-21','Follow up on purchase order.');
 await db.client().includeIssue('2026-11-21','7');
 const saved=(await db.client().read()).meetings[0];
 assert.equal(saved.notes,'Follow up on purchase order.');
 assert.deepEqual(saved.issueIds,['5','7']);
 assert.equal(saved.issueSnapshots[1].name,'Added during meeting');
 await db.client().includeIssue('2026-11-21','7');
 assert.equal((await db.client().read()).meetings[0].issueIds.length,2);
});

test('stale version conflicts cannot be silently accepted or overwritten',async()=>{
 const db=backend();
 const first=await db.client().read();
 await db.client().openOrCreate('2026-11-21',[issue(5)]);
 await assert.rejects(()=>db.client().save([{date:'2026-11-22',issueIds:[],issueSnapshots:[],
  carriedFrom:null,carriedIssueIds:[],notes:'',createdAt:'2026-11-22T00:00:00Z',
  updatedAt:'2026-11-22T00:00:00Z'}],first.version),/version conflict/);
 assert.deepEqual((await db.client().read()).meetings.map(x=>x.date),['2026-11-21']);
});

test('invalid dates, oversized notes, malformed persisted data and bad issue IDs are rejected',async()=>{
 for(const day of ['2026-02-30','yesterday','2026-13-01'])
  assert.throws(()=>meetingDay(day),/meeting date/);
 const db=backend();
 await db.client().openOrCreate('2026-11-21',[]);
 await assert.rejects(()=>db.client().saveNotes('2026-11-21','x'.repeat(10001)),/10,000/);
 await assert.rejects(()=>db.client().includeIssue('2026-11-21','-1'),/Invalid meeting issue/);
});

test('report uses saved meeting snapshot and current issue status with spreadsheet-safe escaping',async()=>{
 const db=backend();
 const item={...issue(5),name:'=HYPERLINK("evil")'};
 const meeting=(await db.client().openOrCreate('2026-11-21',[item])).meeting;
 const csv=meetingReportCsv({...meeting,notes:'Action, "follow up"'},[{...item,status:'Done'}]);
 assert.match(csv,/Status at meeting","Current status/);
 assert.match(csv,/Working on it","Done/);
 assert.match(csv,/'=HYPERLINK/);
 assert.match(csv,/Action, ""follow up""/);
 assert.ok(csv.startsWith('\uFEFF'));
});

test('history, notes, carry-over, report and unavailable historical records have real UI controls',()=>{
 const meeting={date:'2026-11-21',issueIds:['5','7'],issueSnapshots:[],carriedFrom:'2026-11-19',
  carriedIssueIds:['5'],notes:'Discuss delivery arrangements'};
 const base={page:{items:[issue(5)],total:1},meetingHistory:[meeting],canEdit:true};
 const overview=renderTalkBoxApplication(base);
 assert.match(overview,/Meeting history/);
 assert.match(overview,/data-action="tb-meeting-history" data-date="2026-11-21"/);
 const sheet=renderTalkBoxApplication({...base,meetingOpen:true,meetingDate:meeting.date,
  meetingRecord:meeting,meetingRows:[issue(5),{...issue(7),unavailable:true}],reportUrl:'blob:https://example.test/fixture-report'});
 assert.match(sheet,/data-action="tb-meeting-notes"/);
 assert.match(sheet,/href="blob:https:\/\/example\.test\/fixture-report"/);
 assert.match(sheet,/download="talkbox-meeting-2026-11-21\.csv"/);
 assert.doesNotMatch(sheet,/data-action="tb-meeting-report"/);
 assert.match(sheet,/Archived \/ unavailable/);
 assert.match(sheet,/1 issues carried over/);
 assert.match(sheet,/Discuss delivery arrangements/);
 const app=readFileSync('frontend/app.js','utf8');
 for(const action of ['tb-meeting-enter','tb-meeting-history','tb-meeting-notes'])
  assert.match(app,new RegExp("case '"+action+"':"));
 assert.match(app,/talkBoxState\.meetingRows:talkBoxState\.page\?\.items/);
});


test('CSV download needs a prepared signed meeting URL, not an async button handler',()=>{
 const meeting={date:'2026-11-21',issueIds:['5'],issueSnapshots:[],carriedFrom:null,
  carriedIssueIds:[],notes:'Meeting notes'};
 const model={page:{items:[issue(5)],total:1},meetingOpen:true,meetingDate:meeting.date,
  meetingRecord:meeting,meetingRows:[issue(5)]};
 const absent=renderTalkBoxApplication(model);
 assert.doesNotMatch(absent,/Download report CSV/);
 const ready=renderTalkBoxApplication({...model,reportUrl:'blob:https://example.test/reports'});
 assert.match(ready,/<a class="secondary tb-report-download"/);
 assert.match(ready,/download="talkbox-meeting-2026-11-21.csv"/);
 const app=readFileSync('frontend/app.js','utf8');
 assert.doesNotMatch(app,/case 'tb-meeting-report':/);
 assert.match(app,/const csv=meetingReportCsv\(meetingRecord,meetingRows\)/);
 assert.match(app,/clearTalkBoxReportUrl\(\)/);
});
