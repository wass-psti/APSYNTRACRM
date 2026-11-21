/** Native TalkBox meeting ledger using the existing signed, versioned workspace state RPC. */
export const TALKBOX_MEETING_STATE_KEY='talkbox.meetings.v1';
const MAX_MEETINGS=366;
const MAX_ISSUES_PER_MEETING=500;
const MAX_LEDGER_BYTES=120000;
const validIssueId=value=>/^[1-9][0-9]{0,18}$/.test(String(value??''));

export function meetingDay(value){
 const day=String(value??'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new TypeError('Valid meeting date required');
 const parsed=new Date(day+'T00:00:00.000Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==day)
  throw new TypeError('Invalid meeting date');
 return day;
}

function parseLedger(raw){
 if(raw==null)return {schema:1,meetings:[]};
 if(typeof raw!=='string'||raw.length>MAX_LEDGER_BYTES)throw Error('Invalid meeting ledger payload');
 let parsed;
 try{parsed=JSON.parse(raw);}catch{throw Error('Meeting ledger is not valid JSON');}
 if(!parsed||parsed.schema!==1||!Array.isArray(parsed.meetings)||parsed.meetings.length>MAX_MEETINGS)
  throw Error('Unsupported TalkBox meeting ledger');
 const dates=new Set();
 for(const meeting of parsed.meetings){
  meetingDay(meeting.date);
  if(dates.has(meeting.date)||!Array.isArray(meeting.issueIds)||
     meeting.issueIds.length>MAX_ISSUES_PER_MEETING||
     meeting.issueIds.some(id=>!validIssueId(id))||
     new Set(meeting.issueIds.map(String)).size!==meeting.issueIds.length||
     typeof meeting.notes!=='string'||meeting.notes.length>10000||
     !Array.isArray(meeting.issueSnapshots)||meeting.issueSnapshots.length>MAX_ISSUES_PER_MEETING||
     meeting.issueSnapshots.some(s=>!validIssueId(s?.id)||typeof s?.name!=='string'||
       typeof s?.status!=='string'))
   throw Error('Invalid or duplicate meeting record');
  dates.add(meeting.date);
 }
 return parsed;
}
const orderDates=meetings=>meetings.slice().sort((a,b)=>b.date.localeCompare(a.date));
const clone=record=>JSON.parse(JSON.stringify(record));

export class TalkBoxMeetingsClient{
 constructor({api,workspaceId}){
  if(typeof api?.rpc!=='function'||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(workspaceId||''))
   throw new TypeError('Signed TalkBox workspace API required');
  this.api=api;this.workspaceId=workspaceId;
 }
 async read(){
  const result=await this.api.rpc('toolbox_issues_state_get',{
   p_workspace_id:this.workspaceId,p_key:TALKBOX_MEETING_STATE_KEY});
  const version=Number(result?.version);
  if(!Number.isSafeInteger(version)||version<0)throw Error('Invalid meeting ledger version');
  return {version,meetings:orderDates(parseLedger(result.value).meetings)};
 }
 async save(meetings,expectedVersion){
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)throw TypeError('Meeting ledger version required');
  const normalized=orderDates(parseLedger(JSON.stringify({schema:1,meetings})).meetings);
  const value=JSON.stringify({schema:1,meetings:normalized});
  if(value.length>MAX_LEDGER_BYTES)throw Error('Meeting ledger has reached its capacity');
  const receipt=await this.api.rpc('toolbox_issues_state_put',{
   p_workspace_id:this.workspaceId,p_key:TALKBOX_MEETING_STATE_KEY,
   p_value:value,p_previous_version:expectedVersion});
  if(Number(receipt?.version)!==expectedVersion+1||receipt.value!==value)
   throw Error('Meeting persistence acknowledgement did not match');
  const actual=await this.read();
  if(actual.version!==Number(receipt.version)||
     JSON.stringify(actual.meetings)!==JSON.stringify(normalized))
   throw Error('Meeting was submitted but persisted readback differs');
  return actual;
 }
 async openOrCreate(date,issues,now=new Date()){
  const day=meetingDay(date);
  const ledger=await this.read();
  const existing=ledger.meetings.find(meeting=>meeting.date===day);
  if(existing)return {ledger,meeting:clone(existing),created:false};
  if(ledger.meetings.length>=MAX_MEETINGS)throw Error('Meeting history limit reached');
  const previous=ledger.meetings.find(item=>item.date<day);
  const currentIssues=new Map(issues.filter(item=>validIssueId(item.id)).map(item=>[String(item.id),item]));
  const carry=previous?previous.issueIds.filter(id=>{
   const issue=currentIssues.get(String(id));
   return issue&&issue.status!=='Done';
  }):[];
  const active=issues.filter(item=>validIssueId(item.id)&&item.status!=='Done').map(item=>String(item.id));
  const issueIds=[...new Set([...carry,...active])];
  if(issueIds.length>MAX_ISSUES_PER_MEETING)throw Error('Meeting has too many active issues');
  const issueSnapshots=issueIds.map(id=>{const issue=currentIssues.get(id);return {
   id,name:String(issue?.name||''),status:String(issue?.status||''),
   date:issue?.date||null,person:(issue?.person||[]).map(p=>String(p.name||p.id||'')).join('; ')
  };});
  const meeting={date:day,issueIds,issueSnapshots,carriedFrom:previous?.date||null,
   carriedIssueIds:carry,notes:'',createdAt:now.toISOString(),updatedAt:now.toISOString()};
  const updated=await this.save([...ledger.meetings,meeting],ledger.version);
  return {ledger:updated,meeting:clone(updated.meetings.find(item=>item.date===day)),created:true};
 }
 async includeIssue(date,issueId,now=new Date()){
  const day=meetingDay(date),item=String(issueId);
  if(!validIssueId(item))throw TypeError('Invalid meeting issue ID');
  const ledger=await this.read(),meeting=ledger.meetings.find(x=>x.date===day);
  if(!meeting)throw Error('Meeting not found');
  if(meeting.issueIds.includes(item))return ledger;
  if(meeting.issueIds.length>=MAX_ISSUES_PER_MEETING)throw Error('Meeting issue limit reached');
  return this.save(ledger.meetings.map(x=>x.date===day?
   {...x,issueIds:[...x.issueIds,item],issueSnapshots:[...x.issueSnapshots,
    {id:item,name:'Added during meeting',status:'Working on it',date:null,person:''}],
    updatedAt:now.toISOString()}:x),ledger.version);
 }
 async saveNotes(date,notes,now=new Date()){
  const day=meetingDay(date),text=String(notes??'').trim();
  if(text.length>10000)throw TypeError('Meeting notes must not exceed 10,000 characters');
  const ledger=await this.read(),meeting=ledger.meetings.find(item=>item.date===day);
  if(!meeting)throw Error('Meeting not found');
  const next={...meeting,notes:text,updatedAt:now.toISOString()};
  return this.save(ledger.meetings.map(item=>item.date===day?next:item),ledger.version);
 }
}

const cell=value=>{
 const s=String(value??'').replace(/^[\s\x00-\x1f]*[=+@-]/,'\'$&');
 return '"'+s.replace(/"/g,'""')+'"';
};
export function meetingReportCsv(meeting,issues=[]){
 if(!meeting)throw TypeError('Meeting required');
 meetingDay(meeting.date);
 const byId=new Map(issues.map(issue=>[String(issue.id),issue]));
 const snapshots=new Map(meeting.issueSnapshots.map(row=>[String(row.id),row]));
 const lines=[['Meeting date','Issue ID','Issue name at meeting','Status at meeting','Current status','Assigned at meeting','Target date at meeting','Carried over from','Meeting notes']];
 for(const id of meeting.issueIds){
  const issue=byId.get(String(id));
  const snapshot=snapshots.get(String(id));
  lines.push([meeting.date,id,snapshot?.name||issue?.name||'Unavailable issue',
   snapshot?.status||'',issue?.status||'Not available',snapshot?.person||'',
   snapshot?.date||'',meeting.carriedIssueIds?.includes(id)?meeting.carriedFrom||'':'',meeting.notes||'']);
 }
 if(meeting.issueIds.length===0)lines.push([meeting.date,'','','','','','','',meeting.notes||'']);
 return '\uFEFF'+lines.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
