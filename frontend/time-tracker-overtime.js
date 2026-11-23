import {formatTimeTrackerDurationMinutes} from './time-tracker-duration-format.js';
import {formatTimeTrackerWallClock} from './time-tracker-time-format.js';
/** OT records use the signed PostgreSQL workflow and existing request table. */
export const TT_OT_WRITES_ACCEPTED=true;
export const TT_OT_MAX_WEEK_OFFSET=5200;
export const TT_OT_DEFAULT_FILTERS=Object.freeze({weekOffset:0,status:'Submitted',search:'',sort:'newest'});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const msDay=86400000;
const validDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const phtDate=at=>{
 const d=new Date(new Date(at).getTime()+8*3600000);
 return {day:d.toISOString().slice(0,10),minutes:d.getUTCHours()*60+d.getUTCMinutes()};
};
const phtDay=(at=new Date())=>phtDate(at).day;
const fmt=x=>validDay(x)?new Intl.DateTimeFormat('en-US',{
 timeZone:'UTC',month:'short',day:'numeric',year:'numeric'
}).format(new Date(x+'T00:00:00Z')):'—';
const minutesLabel=formatTimeTrackerDurationMinutes;
export function timeTrackerOtWeek(offset=0,at=new Date()){
 if(!Number.isInteger(offset)||Math.abs(offset)>TT_OT_MAX_WEEK_OFFSET)throw Error('Invalid OT week');
 const today=phtDay(at);
 const startMs=Date.parse(today+'T00:00:00Z')-
  new Date(today+'T00:00:00Z').getUTCDay()*msDay+offset*7*msDay;
 const iso=ms=>new Date(ms).toISOString().slice(0,10);
 const start=iso(startMs),end=iso(startMs+6*msDay);
 return {start,end,today,label:fmt(start)+' – '+fmt(end),
  days:Array.from({length:7},(_,i)=>iso(startMs+i*msDay))};
}
export function timeTrackerOtWeekOffsetForDate(date,at=new Date()){
 if(!validDay(date))throw Error('Select a valid OT date');
 const target=Date.parse(date+'T00:00:00Z');
 const targetStart=target-new Date(target).getUTCDay()*msDay;
 const currentStart=Date.parse(timeTrackerOtWeek(0,at).start+'T00:00:00Z');
 const offset=(targetStart-currentStart)/(7*msDay);
 if(!Number.isInteger(offset)||Math.abs(offset)>TT_OT_MAX_WEEK_OFFSET)
  throw Error('OT date is outside the supported history range');
 return offset;
}
export function overtimeDurationMinutes(start,end){
 if(!/^\d{2}:\d{2}$/.test(start||'')||!/^\d{2}:\d{2}$/.test(end||''))return null;
 const [h,m]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
 if(h>23||eh>23||m>59||em>59)return null;
 const result=eh*60+em-h*60-m;
 return result>=30&&result<=360?result:null;
}
function validateReason(reason){
 const description=String(reason||'').trim();
 if(description.length<10||description.length>500)
  return {valid:false,message:'Reason must be 10–500 characters.'};
 return {valid:true,reason:description};
}
export function validateOvertimeDraft({date,start,end,reason}={},at=new Date()){
 if(!validDay(date))return {valid:false,message:'Select a valid date.'};
 const gap=(Date.parse(date+'T00:00:00Z')-
  Date.parse(phtDay(at)+'T00:00:00Z'))/msDay;
 if(gap < -30||gap > 7)return {valid:false,message:'Choose a day within the last 30 or next 7 days.'};
 const durationMinutes=overtimeDurationMinutes(start,end);
 if(durationMinutes===null)return {valid:false,message:'Use same-day times for 30 minutes to 6 hours.'};
 const reasonResult=validateReason(reason);
 if(!reasonResult.valid)return reasonResult;
 return {valid:true,date,start,end,reason:reasonResult.reason,durationMinutes};
}
/** Manual OT must be for an active directory employee and elapsed work only. */
export function validateManualOvertimeDraft({
 employeeId,date,start,end,reason
}={},directory=[],at=new Date()){
 if(typeof employeeId!=='string'||!directory.some(user=>
  user&&user.id===employeeId&&user.status==='active'))
  return {valid:false,message:'Select an active TimeTracker employee.'};
 if(!validDay(date))return {valid:false,message:'Select a valid overtime date.'};
 const now=phtDate(at);
 if(date>now.day)return {valid:false,message:'Manual OT cannot be entered for a future date.'};
 const durationMinutes=overtimeDurationMinutes(start,end);
 if(durationMinutes===null)return {valid:false,message:'Use same-day times for 30 minutes to 6 hours.'};
 const endMinutes=Number(end.slice(0,2))*60+Number(end.slice(3,5));
 if(date===now.day&&endMinutes>now.minutes)
  return {valid:false,message:'The overtime end time must already have elapsed.'};
 const reasonResult=validateReason(reason);
 if(!reasonResult.valid)return reasonResult;
 return {valid:true,employeeId,date,start,end,reason:reasonResult.reason,durationMinutes};
}
/** Records must already have been scoped by the signed server. */
export function projectTimeTrackerOtRows(rows=[]){
 if(!Array.isArray(rows)||rows.length>25000)throw Error('Invalid authorized OT records');
 return rows.filter(r=>r&&typeof r.id==='string'&&validDay(r.date)&&
  ['Draft','Submitted','Approved','Rejected'].includes(r.status)).map(r=>{
  const submissionSource=r.submissionSource==='manual_admin'?'manual_admin':'employee';
  return Object.freeze({
   id:r.id.slice(0,140),ownerId:String(r.ownerId||'').slice(0,48),
   name:String(r.name||'Signed employee').slice(0,100),
   date:r.date,status:r.status,
   decidedAt:typeof r.decidedAt==='string'&&Number.isFinite(Date.parse(r.decidedAt))?r.decidedAt:null,
   decidedBy:typeof r.decidedBy==='string'?r.decidedBy:null,
   submittedBy:typeof r.submittedBy==='string'?r.submittedBy:null,
   submittedByName:String(r.submittedByName||'').slice(0,100),
   submissionSource,isManual:submissionSource==='manual_admin',
   start:String(r.start||'').slice(0,5),end:String(r.end||'').slice(0,5),
   durationMinutes:Number.isInteger(r.durationMinutes)&&r.durationMinutes>=0&&
    r.durationMinutes<=360?r.durationMinutes:null,
   task:String(r.task||'').slice(0,500),
   searchText:[String(r.name||'Signed employee'),String(r.task||''),r.date].join(' ').toLocaleLowerCase()
  });
 });
}
export function timeTrackerOtMetrics(rows=[],filters={},at=new Date()){
 const opts={...TT_OT_DEFAULT_FILTERS,...filters},week=timeTrackerOtWeek(opts.weekOffset,at);
 const all=projectTimeTrackerOtRows(rows).filter(r=>r.date>=week.start&&r.date<=week.end);
 const approved=all.filter(r=>r.status==='Approved');
 const rejected=all.filter(r=>r.status==='Rejected');
 const submitted=all.filter(r=>r.status==='Submitted');
 const minutes=approved.reduce((n,r)=>n+(r.durationMinutes||0),0);
 const status=['Submitted','Approved','Rejected'].includes(opts.status)?opts.status:'Submitted';
 const query=String(opts.search||'').toLowerCase().trim().slice(0,120);
 const statusRows=all.filter(r=>r.status===status);
 statusRows.sort((a,b)=>opts.sort==='oldest'?a.date.localeCompare(b.date):b.date.localeCompare(a.date));
 const visible=statusRows.filter(r=>!query||r.searchText.includes(query));
 const owners=new Map();
 for(const r of all)owners.set(r.name,(owners.get(r.name)||0)+1);
 return {week,all,statusRows,visible,search:query,approvedMinutes:minutes,submitted:submitted.length,
  approved:approved.length,rejected:rejected.length,
  approvalRate:approved.length+rejected.length?
   Math.round(100*approved.length/(approved.length+rejected.length)):null,
  byDay:week.days.map(day=>approved.filter(r=>r.date===day)
   .reduce((sum,r)=>sum+(r.durationMinutes||0),0)),
  owners:[...owners].sort((a,b)=>b[1]-a[1]).slice(0,5)};
}
const metric=(name,value)=>'<div><strong>'+esc(value)+'</strong><span>'+esc(name)+'</span></div>';
const row=(r,access,query='',expandedRequestIds=[],otContractActive=false)=>'<details class="tt-ot-request" data-request-id="'+esc(r.id)+'" data-search-text="'+esc(r.searchText||[r.name,r.task,r.date].join(' ').toLowerCase())+'"'+
 (expandedRequestIds.includes(r.id)?' open':'')+
 (query&&!r.searchText.includes(query)?' hidden':'')+'><summary>'+
 '<span>'+esc(r.name)+(r.isManual?' <em class="tt-ot-manual-badge">Manual Entry</em>':'')+'</span><span>'+esc(fmt(r.date))+'</span>'+
 '<strong>'+esc(minutesLabel(r.durationMinutes))+'</strong>'+
 '<span class="tt-ot-pill tt-ot-'+r.status.toLowerCase()+'">'+
 esc(r.status==='Submitted'?'Pending':r.status)+'</span><span>⌄</span></summary>'+
 '<div class="tt-ot-detail"><span><b>Start:</b> '+esc(formatTimeTrackerWallClock(r.start))+'</span>'+
 '<span><b>End:</b> '+esc(formatTimeTrackerWallClock(r.end))+'</span>'+
 '<p><b>Reason:</b> '+esc(r.task||'Not supplied')+'</p>'+
 (r.isManual?'<p><b>Entry type:</b> Manual OT'+
  (access?.manualOtManager===true&&r.submittedByName?' · Entered by '+esc(r.submittedByName):'')+'</p>':'')+
 (r.status==='Submitted'&&r.ownerId!=='cloud:'+access?.userId&&
  (access?.bootstrapApprover===true||(access?.manualOtManager===true&&r.isManual))?
  '<div class="tt-ot-review-actions">'+
   '<button type="button" data-action="tt-ot-approve" data-id="'+esc(r.id)+'"'+
    (!(TT_OT_WRITES_ACCEPTED&&otContractActive)?' disabled title="Signed OT contract unavailable"':'')+'>Approve</button>'+
   '<button type="button" data-action="tt-ot-reject" data-id="'+esc(r.id)+'"'+
    (!(TT_OT_WRITES_ACCEPTED&&otContractActive)?' disabled title="Signed OT contract unavailable"':'')+'>Reject</button>'+
  '</div>':'')+'</div></details>';
function requestForm({date,start='18:00',end='20:00',reason=''}={},now=new Date(),otContractActive=false){
 const amount=overtimeDurationMinutes(start,end);
 return '<div class="tt-ot-backdrop"><section class="tt-ot-modal" role="dialog" aria-modal="true"'+
 ' aria-labelledby="tt-ot-modal-title"><header><div><h3 id="tt-ot-modal-title">'+
 'Submit Overtime Request</h3><p>Request approval for overtime work</p></div>'+
 '<button type="button" data-action="tt-ot-close" aria-label="Close">×</button></header>'+
 '<form id="tt-ot-form"><div class="tt-ot-form-grid">'+
 '<label>DATE<input id="tt-ot-date" type="date" required value="'+esc(date||phtDay(now))+'"></label>'+
 '<div class="tt-ot-duration"><small>DURATION · 6 h maximum</small><strong>'+
 esc(amount===null?'Invalid interval':minutesLabel(amount))+'</strong></div>'+
 '<label>START (12-hour)<input id="tt-ot-start" type="text" required inputmode="text"'+
 ' placeholder="07:00 PM" aria-label="Overtime start, 12-hour AM or PM"'+
 ' value="'+esc(formatTimeTrackerWallClock(start))+'"></label>'+
 '<label>END (12-hour)<input id="tt-ot-end" type="text" required inputmode="text"'+
 ' placeholder="09:00 PM" aria-label="Overtime end, 12-hour AM or PM"'+
 ' value="'+esc(formatTimeTrackerWallClock(end))+'"></label>'+
 '<label class="tt-ot-reason">REASON<textarea id="tt-ot-reason" maxlength="500" rows="4"'+
 ' required placeholder="Explain why overtime was necessary…">'+esc(reason)+'</textarea>'+
 '<small>'+String(reason).length+'/500</small></label></div>'+
 '<p class="tt-ot-gate">'+(otContractActive?'Submission uses the signed OT RPC and existing audit workflow.':'Signed OT write contract is currently unavailable.')+'</p>'+
 '<footer><button type="button" data-action="tt-ot-close">Cancel</button>'+
 '<button type="submit"'+(!(TT_OT_WRITES_ACCEPTED&&otContractActive)?' disabled':'')+'>Submit Request</button></footer></form></section></div>';
}
function manualOtForm({employeeId='',date='',start='',end='',reason=''}={},access={},now=new Date(),busy=false,manualRows=[],manualVisibleCount=50){
 const directory=Array.isArray(access.overviewDirectory)?access.overviewDirectory:[];
 const canManage=access.manualOtManager===true&&access.moduleRole==='System Admin';
 const enabled=TT_OT_WRITES_ACCEPTED&&canManage&&access.otContractActive===true&&!busy;
 const visibleLimit=Number.isSafeInteger(manualVisibleCount)&&manualVisibleCount>0?
  Math.min(manualVisibleCount,25000):50;
 const visibleRows=manualRows.slice(0,visibleLimit);
 const options=directory.filter(user=>user&&user.status==='active'&&typeof user.id==='string')
  .map(user=>'<option value="'+esc(user.id)+'"'+(employeeId===user.id?' selected':'')+'>'+
   esc(user.display_name||'Workforce member')+'</option>').join('');
 const entry=canManage?(directory.length?'<form id="tt-ot-manual-form"><div class="tt-ot-manual-grid">'+
   '<label>EMPLOYEE<select id="tt-ot-manual-employee" required><option value="">Select employee</option>'+options+'</select></label>'+
   '<label>OVERTIME DATE<input id="tt-ot-manual-date" type="date" required max="'+esc(phtDay(now))+'" value="'+esc(date)+'"></label>'+
   '<label>START (12-hour)<input id="tt-ot-manual-start" type="text" required inputmode="text" placeholder="06:00 PM" aria-label="Manual overtime start, 12-hour AM or PM" value="'+esc(start?formatTimeTrackerWallClock(start):'')+'"></label>'+
   '<label>END (12-hour)<input id="tt-ot-manual-end" type="text" required inputmode="text" placeholder="08:00 PM" aria-label="Manual overtime end, 12-hour AM or PM" value="'+esc(end?formatTimeTrackerWallClock(end):'')+'"></label>'+
   '<label class="tt-ot-manual-reason">REASON<textarea id="tt-ot-manual-reason" maxlength="500" rows="3" required placeholder="Explain the overtime work performed…">'+esc(reason)+'</textarea></label></div>'+
   '<div class="tt-ot-manual-footer"><p>Historical dates are supported. Same-day entries require an elapsed end time. Manual requests enter the normal approval workflow.</p>'+
   '<button type="submit"'+(enabled?'':' disabled')+'>＋ Submit Manual OT</button></div></form>':
   '<p class="tt-ot-manual-empty">No active TimeTracker employees are available in this workspace.</p>'):
   '<p class="tt-ot-manual-readonly-note">Read-only view. Manual overtime entry and review actions are available to System Admins only.</p>';
 const records=visibleRows.length?visibleRows.map(r=>'<article class="tt-ot-manual-record">'+
  '<div class="tt-ot-manual-record-heading"><strong>'+esc(r.name)+'</strong>'+
   '<span class="tt-ot-pill tt-ot-'+r.status.toLowerCase()+'">'+esc(r.status==='Submitted'?'Pending':r.status)+'</span></div>'+
  '<div class="tt-ot-manual-record-meta"><span>'+esc(fmt(r.date))+'</span><span>'+esc(formatTimeTrackerWallClock(r.start))+' – '+esc(formatTimeTrackerWallClock(r.end))+'</span><strong>'+esc(minutesLabel(r.durationMinutes))+'</strong></div>'+
  '<p>'+esc(r.task||'No reason supplied')+'</p>'+
  (canManage&&r.submittedByName?'<small>Entered by '+esc(r.submittedByName)+'</small>':'')+
 '</article>').join(''):'<p class="tt-ot-manual-empty">No manual OT entries recorded.</p>';
 const loadMore=visibleRows.length<manualRows.length?
  '<button type="button" class="tt-ot-manual-more" data-action="tt-ot-manual-more" aria-label="Show more manual OT records">Show next 50 records</button>':'';
 return '<section class="tt-ot-manual-section" aria-labelledby="tt-ot-manual-title">'+
  '<div class="tt-ot-manual-heading"><div><span>'+(canManage?'ADMINISTRATIVE ENTRY':'READ-ONLY RECORDS')+'</span>'+
   '<h3 id="tt-ot-manual-title">Manual OT Submission</h3>'+
   '<p>Historical overtime records entered for employees.</p></div>'+
   '<span class="tt-ot-manual-chip">'+(canManage?'System Admin':'Read only')+'</span></div>'+
  entry+'<div class="tt-ot-manual-records"><div class="tt-ot-manual-records-heading"><strong>Manual OT records</strong><span>'+visibleRows.length+' of '+manualRows.length+' total</span></div>'+records+loadMore+'</div>'+
 '</section>';
}
export function renderTimeTrackerOvertime({
 requests=[],access={},filters={},expandedRequestIds=[],modalOpen=false,form={},manualForm={},now=new Date(),busy=false,manualVisibleCount=50
}={}){
 const opts={...TT_OT_DEFAULT_FILTERS,...filters};
 const m=timeTrackerOtMetrics(requests,opts,now);
 const manualRows=projectTimeTrackerOtRows(requests).filter(row=>row.isManual);
 const statuses=[['Submitted','Pending',m.submitted],
  ['Approved','Approved',m.approved],['Rejected','Rejected',m.rejected]];
 const high=Math.max(1,...m.byDay);
 const canManageManualOt=access?.moduleRole==='System Admin'&&access?.manualOtManager===true;
 const scopeLabel=access?.bootstrapApprover===true?'Bootstrap review scope':
  canManageManualOt?'System Admin · Manual OT management':'Employee OT visibility';
 return '<section class="tt-overtime tt-overtime-command" aria-label="TimeTracker overtime requests">'+
 '<header class="tt-ot-header tt-ot-command-hero" aria-label="Authorized overtime overview">'+
  '<div class="tt-ot-graphics" aria-hidden="true"><div class="tt-pixi-backdrop" data-pixi="fallback"></div>'+
   '<span class="tt-ot-orbit tt-ot-orbit-outer"></span><span class="tt-ot-orbit tt-ot-orbit-inner"></span></div>'+
  '<div class="tt-ot-hero-content"><span class="tt-ot-eyebrow"><span class="tt-ot-signal" aria-hidden="true"></span>'+
    'APSYNTRA / OVERTIME INTELLIGENCE</span><h3>Overtime</h3>'+
   '<p>Authorized requests, approvals and weekly outcomes</p>'+
   '<span class="tt-ot-scope">'+(TT_OT_WRITES_ACCEPTED&&access?.otContractActive===true?'Signed OT workflow · ':'Read-only · ')+
    esc(scopeLabel)+'</span><span class="tt-ot-hero-week">'+esc(m.week.label)+'</span></div>'+
  '<div class="tt-ot-hero-telemetry" aria-label="Authorized weekly overtime snapshot">'+
   '<span class="tt-ot-telemetry-caption">SIGNED WEEKLY SNAPSHOT</span>'+
   '<div class="tt-ot-telemetry-primary"><strong>'+esc(minutesLabel(m.approvedMinutes))+
    '</strong><span>Approved overtime<br>this week</span></div>'+
   '<div class="tt-ot-telemetry-grid"><div><strong>'+m.submitted+'</strong><span>Pending</span></div>'+
    '<div><strong>'+m.approved+'</strong><span>Approved</span></div>'+
    '<div><strong>'+m.rejected+'</strong><span>Rejected</span></div></div>'+
   '<button type="button" class="secondary tt-ot-hero-refresh" data-action="tt-refresh">Refresh authorized OT</button>'+
  '</div></header>'+
 '<div class="tt-ot-week"><small>WEEK</small><div>'+
 '<button type="button" data-action="tt-ot-prev" aria-label="Previous week"'+
 (opts.weekOffset<=-TT_OT_MAX_WEEK_OFFSET?' disabled':'')+'>‹</button>'+
 '<strong>'+esc(m.week.label)+'</strong>'+
 '<button type="button" data-action="tt-ot-next" aria-label="Next week"'+
 (opts.weekOffset>=TT_OT_MAX_WEEK_OFFSET?' disabled':'')+'>›</button>'+
 '<button type="button" data-action="tt-ot-current">This Week</button>'+
 '<form id="tt-ot-week-jump-form"><label for="tt-ot-week-jump">Jump to date</label>'+
  '<input id="tt-ot-week-jump" type="date" required max="'+esc(m.week.today)+'" value="'+esc(m.week.start)+'">'+
  '<button type="submit">View week</button></form>'+
 '<button type="button" class="tt-ot-submit" data-action="tt-ot-open">＋ Submit OT</button></div></div>'+
 manualOtForm(manualForm,access,now,busy,manualRows,manualVisibleCount)+
 '<div class="tt-ot-metrics">'+metric('OT HOURS',minutesLabel(m.approvedMinutes))+
 metric('PENDING',m.submitted)+metric('APPROVED',m.approved)+
 metric('RATE',m.approvalRate===null?'—':m.approvalRate+'%')+'</div>'+
 '<p class="tt-ot-subline">'+m.all.length+' authorized request(s) this week</p>'+
 '<div class="tt-ot-section-heading">INSIGHTS <span>'+esc(m.week.label)+'</span></div>'+
 '<div class="tt-ot-insights"><article><h4>OT BY DAY</h4><div class="tt-ot-chart">'+
 m.byDay.map((v,i)=>'<div><progress value="'+v+'" max="'+high+'" aria-label="'+
  ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][i]+
  ' approved overtime minutes"></progress><small>'+['S','M','T','W','T','F','S'][i]+'</small></div>').join('')+
 '</div></article><article><h4>TOP REQUESTORS</h4>'+
 (m.owners.length?m.owners.map(([name,count])=>'<div class="tt-ot-requestor"><b>'+
  esc(name)+'</b><progress value="'+count+'" max="'+m.owners[0][1]+'"></progress><span>'+count+'</span></div>').join(''):
  '<p>No authorized requests this week.</p>')+'</article></div>'+
 '<div class="tt-ot-section-heading">REQUESTS <span>'+esc(m.week.label)+'</span></div>'+
 '<section class="tt-ot-list"><div class="tt-ot-tabs">'+statuses.map(([status,label,count])=>
  '<button type="button" data-action="tt-ot-status" data-status="'+status+'" aria-pressed="'+
   (opts.status===status)+'"'+(opts.status===status?' class="is-active"':'')+'>'+
   label+' <span>('+count+')</span></button>').join('')+'</div>'+
 '<div class="tt-ot-search"><label for="tt-ot-search">Search requests</label>'+
 '<input id="tt-ot-search" type="search" maxlength="120" placeholder="Search employee or reason…" value="'+esc(opts.search)+'">'+
 '<button type="button" data-action="tt-ot-sort">Date '+(opts.sort==='oldest'?'↑':'↓')+'</button></div>'+
 (m.statusRows.length?'<div class="tt-ot-row-head"><span>Employee</span><span>Date</span>'+
 '<span>Duration</span><span>Status</span><span>Details</span></div>'+
 m.statusRows.map(r=>row(r,access,m.search,expandedRequestIds,access?.otContractActive===true)).join(''):'')+
 '<div class="tt-ot-empty" data-tt-ot-empty'+(m.visible.length?' hidden':'')+'><span>◷</span>'+
 '<strong>No matching requests</strong><p>Try a different week, search or status.</p>'+
 '<button type="button" data-action="tt-ot-open">＋ Submit a request</button></div>'+
 '<p class="tt-ot-note">'+(access?.bootstrapApprover===true?
  'Bootstrap administrators can review all workspace OT requests. ':
  canManageManualOt?'System Admins can review manually submitted OT only. ':
  'Employees have read-only access to their visible OT records. ')+
  'Manual entries are identified separately and use the existing approval workflow.</p>'+
 '</section>'+(modalOpen?requestForm(form,now,access?.otContractActive===true):'')+'</section>';
}
