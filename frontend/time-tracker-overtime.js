/** OT records use the signed PostgreSQL workflow and existing request table. */
export const TT_OT_WRITES_ACCEPTED=true;
export const TT_OT_MAX_WEEK_OFFSET=5200;
export const TT_OT_DEFAULT_FILTERS=Object.freeze({weekOffset:0,status:'All',search:'',sort:'newest'});
/** Signed workflow, not clock state, determines filing readiness. */
export function timeTrackerOtFilingAvailability(access={},busy=false,manual=false){
 const permitted=!manual||access.manualOtManager===true;
 const ready=TT_OT_WRITES_ACCEPTED&&access.otContractActive===true&&
  access.durationOtContractActive===true;
 const reason=busy?'TimeTracker is finishing another operation. Try again when it completes.':
  !permitted?'Manual OT filing is unavailable for this TimeTracker session.':
  !ready?'Duration-only OT filing is not active for this workspace yet. Refresh overtime to check the workflow again.':'';
 return {canOpen:permitted&&!busy,canSubmit:permitted&&ready&&!busy,reason};
}
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
const minutesLabel=minutes=>Number.isInteger(minutes)&&minutes>=0?
 (Math.floor(minutes/60)?Math.floor(minutes/60)+'h':'')+
 (minutes%60?' '+minutes%60+'m':minutes===0?'0h':''):'—';
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
export function validateDurationOvertimeDraft({date,durationMinutes,reason}={},at=new Date()){
 if(!validDay(date))return {valid:false,message:'Select a valid work date.'};
 const gap=(Date.parse(date+'T00:00:00Z')-Date.parse(phtDay(at)+'T00:00:00Z'))/msDay;
 if(gap<0||gap>7)return {valid:false,message:'Choose today or one of the next 7 days.'};
 if(!Number.isInteger(durationMinutes)||durationMinutes<30||durationMinutes>360||durationMinutes%30!==0)
  return {valid:false,message:'Choose 0.5 to 6 hours in 0.5-hour increments.'};
 const reasonResult=validateReason(reason);
 if(!reasonResult.valid)return reasonResult;
 return {valid:true,date,durationMinutes,reason:reasonResult.reason};
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

/** Administrative OT is duration-only and historical; it never fabricates clock times. */
export function validateManualDurationOvertimeDraft({
 employeeId,date,durationMinutes,reason
}={},directory=[],at=new Date()){
 if(typeof employeeId!=='string'||!directory.some(user=>
  user&&user.id===employeeId&&user.status==='active'))
  return {valid:false,message:'Select an active TimeTracker employee.'};
 if(!validDay(date))return {valid:false,message:'Select a valid overtime date.'};
 if(date>=phtDay(at))return {valid:false,message:'Administrative duration entries must use a past date.'};
 if(!Number.isInteger(durationMinutes)||durationMinutes<30||durationMinutes>360||durationMinutes%30!==0)
  return {valid:false,message:'Choose 0.5 to 6 hours in 0.5-hour increments.'};
 const reasonResult=validateReason(reason);
 if(!reasonResult.valid)return reasonResult;
 return {valid:true,employeeId,date,durationMinutes,reason:reasonResult.reason};
}

/** Records must already have been scoped by the signed server. */
export function projectTimeTrackerOtRows(rows=[]){
 if(!Array.isArray(rows)||rows.length>25000)throw Error('Invalid authorized OT records');
 return rows.filter(r=>r&&typeof r.id==='string'&&validDay(r.date)&&
  ['Draft','Submitted','Approved','Rejected'].includes(r.status)).map(r=>{
  const submissionSource=r.submissionSource==='manual_admin'?'manual_admin':'employee';
  const otPolicy=['duration-v1','manual-duration-v1'].includes(r.otPolicy)?r.otPolicy:'legacy-range';
  const durationMinutes=Number.isInteger(r.durationMinutes)&&r.durationMinutes>=0&&
   r.durationMinutes<=360?r.durationMinutes:null;
  const attendanceCredit=otPolicy==='duration-v1'&&r.status==='Approved'&&
   Number.isSafeInteger(r.attendanceCredit?.actualMinutes)&&r.attendanceCredit.actualMinutes>=0&&
   Number.isSafeInteger(r.attendanceCredit?.payableMinutes)&&r.attendanceCredit.payableMinutes>=0&&
   r.attendanceCredit.payableMinutes<=r.attendanceCredit.actualMinutes&&
   r.attendanceCredit.payableMinutes<=durationMinutes?
   Object.freeze({actualMinutes:r.attendanceCredit.actualMinutes,payableMinutes:r.attendanceCredit.payableMinutes}):null;
  return Object.freeze({
   id:r.id.slice(0,140),ownerId:String(r.ownerId||'').slice(0,48),
   name:String(r.name||'Signed employee').slice(0,100),date:r.date,status:r.status,
   canWithdraw:r.status==='Submitted'&&r.canWithdraw===true,
   decidedAt:typeof r.decidedAt==='string'&&Number.isFinite(Date.parse(r.decidedAt))?r.decidedAt:null,
   decidedBy:typeof r.decidedBy==='string'?r.decidedBy:null,
   submittedBy:typeof r.submittedBy==='string'?r.submittedBy:null,
   submittedByName:String(r.submittedByName||'').slice(0,100),
   submissionSource,isManual:submissionSource==='manual_admin',otPolicy,
   attendanceRecordId:typeof r.attendanceRecordId==='string'?r.attendanceRecordId:null,
    attendanceClockInAt:typeof r.attendanceClockInAt==='string'?r.attendanceClockInAt:null,
   canReviewOt:r.canReviewOt===true,
   canReviewDuration:(otPolicy==='duration-v1'||otPolicy==='manual-duration-v1')&&
    (r.canReviewDuration===true||r.canReviewOt===true),
   attendanceCredit,durationMinutes,
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
 const status=['All','Submitted','Approved','Rejected'].includes(opts.status)?opts.status:'All';
 const query=String(opts.search||'').toLowerCase().trim().slice(0,120);
 const statusRows=all.filter(r=>r.status!=='Draft'&&(status==='All'||r.status===status));
 statusRows.sort((a,b)=>opts.sort==='oldest'?a.date.localeCompare(b.date):b.date.localeCompare(a.date));
 const visible=statusRows.filter(r=>!query||r.searchText.includes(query));
 const owners=new Map();
 for(const r of all)owners.set(r.name,(owners.get(r.name)||0)+1);
 return {week,all,statusRows,visible,search:query,approvedMinutes:minutes,submitted:submitted.length,
  approved:approved.length,rejected:rejected.length,
  pendingMinutes:submitted.reduce((n,r)=>n+(r.durationMinutes||0),0),
  rejectedMinutes:rejected.reduce((n,r)=>n+(r.durationMinutes||0),0),
  approvalRate:approved.length+rejected.length?
   Math.round(100*approved.length/(approved.length+rejected.length)):null,
  byDay:week.days.map(day=>approved.filter(r=>r.date===day)
   .reduce((sum,r)=>sum+(r.durationMinutes||0),0)),
  owners:[...owners].sort((a,b)=>b[1]-a[1]).slice(0,5)};
}
const row=(r,access,query='',expandedRequestIds=[],otContractActive=false)=>{
 const initials=r.name.trim().split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase();
 const canReview=r.status==='Submitted'&&r.canReviewOt===true;
 const button=(action,label,primary=false)=>'<button type="button" class="'+(primary?'tt-ot-reference-primary':'tt-ot-reference-secondary')+
  '" data-action="'+action+'" data-id="'+esc(r.id)+'"'+
  (!otContractActive?' disabled title="Signed OT contract unavailable"':'')+'>'+label+'</button>';
 return '<article class="tt-ot-request tt-ot-reference-row" data-request-id="'+esc(r.id)+'" data-search-text="'+esc(r.searchText)+'"'+
  (query&&!r.searchText.includes(query)?' hidden':'')+'>'+
  '<div class="tt-ot-reference-person"><span class="tt-ot-reference-avatar" aria-hidden="true">'+esc(initials)+'</span><strong>'+esc(r.name)+'</strong></div>'+
  '<span class="tt-ot-reference-date">'+esc(fmt(r.date))+'</span>'+
  '<strong class="tt-ot-reference-hours">'+esc(minutesLabel(r.durationMinutes).trim())+'</strong>'+
  '<span class="tt-ot-reference-reason">'+esc(r.task||'Not supplied')+(r.isManual?' <em class="tt-ot-manual-badge">Manual Entry</em>':'')+'</span>'+
  '<span class="tt-ot-pill tt-ot-'+r.status.toLowerCase()+'">'+esc(r.status==='Submitted'?'Pending':r.status)+'</span>'+
  '<div class="tt-ot-reference-actions">'+
  (canReview?'<div class="tt-ot-review-actions">'+button('tt-ot-approve','Approve',true)+button('tt-ot-reject','Reject')+'</div>':'')+
  (r.canWithdraw&&otContractActive?button('tt-ot-withdraw','Remove'):'')+
  '<details class="tt-ot-reference-details"'+(expandedRequestIds.includes(r.id)?' open':'')+'><summary>View</summary>'+
  '<div class="tt-ot-detail">'+
  '<span><b>Requested duration:</b> '+esc(minutesLabel(r.durationMinutes).trim())+'</span>'+
  (r.otPolicy==='duration-v1'?'<span><b>Attendance:</b> '+(r.attendanceRecordId?'Matched':'Awaiting matching record')+'</span>'+
   '<span><b>Actual OT:</b> '+esc(r.attendanceCredit?minutesLabel(r.attendanceCredit.actualMinutes).trim():'Not finalized')+'</span>'+
   '<span><b>Payable OT:</b> '+esc(r.attendanceCredit?minutesLabel(r.attendanceCredit.payableMinutes).trim():'Not finalized')+'</span>':'')+
  '<p><b>Reason:</b> '+esc(r.task||'Not supplied')+'</p>'+
  (r.isManual?'<p><b>Entry type:</b> '+(r.otPolicy==='manual-duration-v1'?'Manual duration OT':'Manual OT')+
   (access?.manualOtManager===true&&r.submittedByName?' · Entered by '+esc(r.submittedByName):'')+'</p>':'')+
  '</div></details></div></article>';
};
const shiftPhtDay=(day,offset)=>new Date(Date.parse(day+'T00:00:00Z')+offset*msDay).toISOString().slice(0,10);
export function timeTrackerOtDurationLabel(minutes){
 if(!Number.isInteger(minutes)||minutes<0||minutes>360)return '—';
 const hours=Math.floor(minutes/60),remaining=minutes%60;
 return hours?hours+' hr '+String(remaining).padStart(2,'0')+' min':remaining+' min';
}
export function updateTimeTrackerOvertimePreview(form){
 if(!form||form.id!=='tt-ot-form')return false;
 const durationInput=form.querySelector('#tt-ot-duration-hours');
 const raw=durationInput?.value??'';
 const rawMinutes=Number(raw)*60;
 const minutes=raw!==''&&Number.isInteger(rawMinutes)&&rawMinutes>=30&&rawMinutes<=360&&rawMinutes%30===0?rawMinutes:null;
 const duration=form.querySelector('[data-tt-ot-duration-value]');
 const progress=form.querySelector('[data-tt-ot-duration-progress]');
 const message=form.querySelector('[data-tt-ot-duration-message]');
 if(duration)duration.textContent=minutes===null?'—':timeTrackerOtDurationLabel(minutes);
 if(progress){
  progress.value=minutes===null?0:minutes;
  progress.setAttribute('aria-valuetext',minutes===null?'Duration not selected':timeTrackerOtDurationLabel(minutes)+' of 6 hours');
 }
 if(message)message.textContent=minutes===null?
  'Choose 0.5 to 6 hours in 0.5-hour increments.':
  timeTrackerOtDurationLabel(360-minutes)+' remaining within the 6-hour maximum.';
 if(durationInput){
  const invalid=raw!==''&&minutes===null;
  durationInput.setCustomValidity(invalid?'Choose 0.5 to 6 hours in 0.5-hour increments.':'');
  if(invalid)durationInput.setAttribute('aria-invalid','true');
  else durationInput.removeAttribute('aria-invalid');
 }
 const reasonInput=form.querySelector('#tt-ot-reason');
 const reason=reasonInput?.value||'';
 if(reasonInput){
  const invalid=reason.length>0&&reason.trim().length<10;
  reasonInput.setCustomValidity(invalid?'Enter at least 10 characters for the overtime reason.':'');
  if(invalid)reasonInput.setAttribute('aria-invalid','true');
  else reasonInput.removeAttribute('aria-invalid');
 }
 const count=form.querySelector('[data-tt-ot-reason-count]');
 if(count)count.textContent=reason.length+' / 500';
 return true;
}
function requestForm({date='',reason='',durationMinutes=120}={},now=new Date(),otContractActive=false,busy=false,durationMode=false){
 const selectedDate=date||phtDay(now);
 const amount=Number.isInteger(durationMinutes)&&durationMinutes>=30&&durationMinutes<=360&&durationMinutes%30===0?durationMinutes:null;
 const durationHours=amount===null?'':amount/60;
 const filing=timeTrackerOtFilingAvailability({otContractActive,durationOtContractActive:durationMode},busy);
 const disabled=!filing.canSubmit;
 return '<div class="tt-ot-backdrop" data-tt-ot-backdrop>'+
  '<section class="tt-ot-modal" role="dialog" aria-modal="true" tabindex="-1"'+(busy?' aria-busy="true"':'')+' aria-labelledby="tt-ot-modal-title" aria-describedby="tt-ot-modal-description">'+
   '<header class="tt-ot-modal-header"><div><span class="tt-ot-modal-eyebrow">TIME TRACKER · OVERTIME</span>'+
    '<h3 id="tt-ot-modal-title">File Overtime</h3>'+
    '<p id="tt-ot-modal-description">Enter the total additional hours you are requesting. No start or end time is required.</p></div>'+
    '<button type="button" data-action="tt-ot-close" aria-label="Close overtime request"'+(busy?' disabled':'')+'>×</button></header>'+
   '<form id="tt-ot-form"><div class="tt-ot-form-grid">'+
    '<label class="tt-ot-date-field" for="tt-ot-date"><span>Overtime date</span>'+
     '<input id="tt-ot-date" name="date" type="date" required'+(busy?' disabled':'')+' min="'+esc(shiftPhtDay(phtDay(now),0))+
     '" max="'+esc(shiftPhtDay(phtDay(now),7))+'" value="'+esc(selectedDate)+'" aria-describedby="tt-ot-date-help">'+
     '<small id="tt-ot-date-help">Choose the Philippine work date: today or one of the next 7 days.</small></label>'+
    '<section class="tt-ot-schedule" aria-labelledby="tt-ot-schedule-title">'+
     '<div class="tt-ot-schedule-heading"><div><h4 id="tt-ot-schedule-title">Overtime duration</h4>'+
      '<p>Choose the total number of additional working hours.</p></div><span>Hours only</span></div>'+
     '<label for="tt-ot-duration-hours"><span>Requested overtime (hours)</span>'+
      '<input id="tt-ot-duration-hours" name="durationHours" type="number" min="0.5" max="6" step="0.5" required'+(busy?' disabled':'')+' value="'+esc(durationHours)+'" aria-label="Requested overtime hours"></label>'+
     '<div class="tt-ot-duration" aria-label="Requested overtime duration">'+
      '<div class="tt-ot-duration-top"><span>Total overtime</span><strong data-tt-ot-duration-value>'+
       esc(amount===null?'—':timeTrackerOtDurationLabel(amount))+'</strong></div>'+
      '<progress data-tt-ot-duration-progress max="360" value="'+(amount===null?0:amount)+
       '" aria-label="Requested overtime against the six-hour maximum" aria-valuetext="'+
       esc(amount===null?'Duration not selected':timeTrackerOtDurationLabel(amount)+' of 6 hours')+'"></progress>'+
      '<div class="tt-ot-duration-foot"><small>30-minute minimum · 6-hour maximum</small><small data-tt-ot-duration-message aria-live="polite">'+
       esc(amount===null?'Choose 0.5 to 6 hours in 0.5-hour increments.':timeTrackerOtDurationLabel(360-amount)+' remaining within the 6-hour maximum.')+
       '</small></div></div></section>'+
    '<label class="tt-ot-reason" for="tt-ot-reason"><span>Reason for overtime</span>'+
     '<textarea id="tt-ot-reason" name="reason" maxlength="500" rows="3" required'+(busy?' disabled':'')+' placeholder="Briefly explain the work that needs to be completed…" aria-describedby="tt-ot-reason-help tt-ot-reason-count">'+esc(reason)+'</textarea>'+
     '<span class="tt-ot-reason-meta"><small id="tt-ot-reason-help">Provide at least 10 characters, up to 500.</small>'+
      '<small data-tt-ot-reason-count aria-live="polite">'+String(reason).length+' / 500</small></span></label></div>'+
   '<p class="tt-ot-gate" role="status">'+esc(filing.reason||
     'Your request will be sent to the authorized OT approval queue for System Admin, Admin, or HR review.')+'</p>'+
    (!busy&&!filing.canSubmit?'<button type="button" data-action="tt-refresh">Refresh overtime</button>':'')+
   '<footer class="tt-ot-modal-footer"><button type="button" data-action="tt-ot-close"'+(busy?' disabled':'')+'>Cancel</button>'+
    '<button type="submit"'+(disabled?' disabled':'')+'>'+(busy?'Submitting…':'File Overtime')+'</button></footer></form>'+
  '</section></div>';
}
function manualRequestForm({employeeId='',date='',durationMinutes=120,reason=''}={},access={},now=new Date(),busy=false){
 const directory=Array.isArray(access.overviewDirectory)?access.overviewDirectory:[];
 const canManage=access.manualOtManager===true;
 if(!canManage)return '';
 const filing=timeTrackerOtFilingAvailability(access,busy,true);
 const enabled=filing.canSubmit;
 const options=directory.filter(user=>user&&user.status==='active'&&typeof user.id==='string')
  .map(user=>'<option value="'+esc(user.id)+'"'+(employeeId===user.id?' selected':'')+'>'+esc(user.display_name||'Workforce member')+'</option>').join('');
 const amount=Number.isInteger(durationMinutes)&&durationMinutes>=30&&durationMinutes<=360&&durationMinutes%30===0?durationMinutes:null;
 const hours=amount===null?'':amount/60;
 const maxDate=shiftPhtDay(phtDay(now),-1);
 return '<div class="tt-ot-backdrop" data-tt-ot-backdrop><section class="tt-ot-modal tt-ot-manual-section" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="tt-ot-modal-title">'+
  '<header class="tt-ot-modal-header"><div><span class="tt-ot-modal-eyebrow">ADMINISTRATIVE ENTRY · System Admin / Admin</span><h3 id="tt-ot-modal-title">File Overtime</h3><p>Enter historical overtime for an employee using total hours only.</p></div>'+
  '<button type="button" data-action="tt-ot-close" aria-label="Close overtime request"'+(busy?' disabled':'')+'>×</button></header>'+
  '<form id="tt-ot-manual-form"><div class="tt-ot-form-grid">'+
  '<label>Employee<select id="tt-ot-manual-employee" required'+(busy?' disabled':'')+'><option value="">Select employee</option>'+options+'</select></label>'+
  '<label>Overtime date<input id="tt-ot-manual-date" type="date" required max="'+esc(maxDate)+'" value="'+esc(date)+'"'+(busy?' disabled':'')+'><small>Historical dates only. Current and future dates use employee filing.</small></label>'+
  '<label for="tt-ot-manual-duration-hours"><span>Requested overtime (hours)</span><input id="tt-ot-manual-duration-hours" type="number" min="0.5" max="6" step="0.5" required value="'+esc(hours)+'"'+(busy?' disabled':'')+'></label>'+
  '<div class="tt-ot-reference-duration"><span>Total overtime</span><strong data-tt-ot-manual-duration aria-live="polite">'+esc(amount===null?'—':minutesLabel(amount).trim())+'</strong></div>'+
  '<label>Reason<textarea id="tt-ot-manual-reason" maxlength="500" rows="3" required'+(busy?' disabled':'')+'>'+esc(reason)+'</textarea></label>'+
  '<div class="tt-ot-reason-chips">'+['Client support','Month-end reporting','Maintenance work'].map(v=>'<button type="button" data-action="tt-ot-reason" data-reason="'+esc(v)+'"'+(busy?' disabled':'')+'>'+esc(v)+'</button>').join('')+'</div>'+
  '<p class="tt-ot-gate" role="status">'+esc(filing.reason||
    'Historical manual entries are submitted for the normal approval workflow. Start and end times are not collected.')+'</p>'+
   (!busy&&!enabled?'<button type="button" data-action="tt-refresh">Refresh overtime</button>':'')+'</div>'+
  '<footer class="tt-ot-modal-footer"><button type="button" data-action="tt-ot-close"'+(busy?' disabled':'')+'>Cancel</button><button type="submit"'+(enabled?'':' disabled')+'>File Overtime</button></footer></form></section></div>';
}
export function updateTimeTrackerManualOtPreview(form){
 if(!form||form.id!=='tt-ot-manual-form')return false;
 const raw=form.querySelector('#tt-ot-manual-duration-hours')?.value??'';
 const rawMinutes=Number(raw)*60;
 const minutes=raw!==''&&Number.isInteger(rawMinutes)&&rawMinutes>=30&&rawMinutes<=360&&rawMinutes%30===0?rawMinutes:null;
 const label=form.querySelector('[data-tt-ot-manual-duration]');
 if(label)label.textContent=minutes===null?'—':minutesLabel(minutes).trim();
 const input=form.querySelector('#tt-ot-manual-duration-hours');
 if(input)input.setCustomValidity(raw!==''&&minutes===null?'Choose 0.5 to 6 hours in 0.5-hour increments.':'');
 return true;
}
export function renderTimeTrackerOvertime({
 requests=[],access={},filters={},expandedRequestIds=[],modalOpen=false,form={},now=new Date(),busy=false
}={}){
 const opts={...TT_OT_DEFAULT_FILTERS,...filters},m=timeTrackerOtMetrics(requests,opts,now);
 const statuses=[['All','All',m.submitted+m.approved+m.rejected],['Submitted','Pending',m.submitted],['Approved','Approved',m.approved],['Rejected','Rejected',m.rejected]];
 const canManage=access.manualOtManager===true;
 const filing=timeTrackerOtFilingAvailability(access,busy);
 const manualFiling=timeTrackerOtFilingAvailability(access,busy,true);
 const disabled=availability=>availability.canOpen?'':' disabled title="'+esc(availability.reason)+'"';
 const metric=(label,value,detail,cls='')=>'<article class="tt-ot-reference-metric '+cls+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small></article>';
 return '<section class="tt-overtime tt-overtime-command tt-ot-reference" aria-label="TimeTracker overtime requests">'+
 '<header class="tt-ot-reference-header"><div><h3>Overtime</h3><p>Review overtime requests and their current workflow state.</p></div><div class="tt-ot-reference-header-actions">'+
 '<button type="button" class="tt-ot-reference-secondary" data-action="tt-refresh" aria-label="Refresh overtime"'+disabled(filing)+'>↻</button>'+
 '<button type="button" class="'+(canManage?'tt-ot-reference-secondary':'tt-ot-reference-primary')+'" data-action="tt-ot-open"'+disabled(filing)+'>'+(canManage?'File my overtime':'+ File Overtime')+'</button>'+
 (canManage?'<button type="button" class="tt-ot-reference-primary" data-action="tt-ot-manual-open"'+disabled(manualFiling)+'>+ File Overtime</button>':'')+'</div></header>'+
 (busy?'<p class="tt-ot-gate" role="status">'+esc(filing.reason)+'</p>':'')+
 '<div class="tt-ot-reference-metrics">'+metric('Approved overtime this week',minutesLabel(m.approvedMinutes).trim(),m.approved+' requests approved')+
 metric('Awaiting approval',m.submitted,minutesLabel(m.pendingMinutes).trim()+' total · Review below',m.submitted?'tt-ot-reference-pending':'')+
 metric('Rejected',m.rejected,minutesLabel(m.rejectedMinutes).trim())+'</div>'+
 '<section class="tt-ot-reference-table" aria-label="Weekly overtime records"><div class="tt-ot-reference-week">'+
 '<div class="tt-ot-reference-week-nav"><button type="button" data-action="tt-ot-prev" aria-label="Previous week"'+(opts.weekOffset<=-TT_OT_MAX_WEEK_OFFSET?' disabled':'')+'>‹</button>'+
 '<strong>'+esc(m.week.label)+'</strong><button type="button" data-action="tt-ot-next" aria-label="Next week"'+(opts.weekOffset>=TT_OT_MAX_WEEK_OFFSET?' disabled':'')+'>›</button>'+
 '<button type="button" data-action="tt-ot-current">This Week</button></div>'+
 '<form id="tt-ot-week-jump-form"><label for="tt-ot-week-jump">Jump to date</label><input id="tt-ot-week-jump" type="date" required value="'+esc(m.week.start)+'"><button type="submit">View week</button></form></div>'+
 '<div class="tt-ot-reference-filters"><div class="tt-ot-tabs">'+statuses.map(([status,label,count])=>
 '<button type="button" data-action="tt-ot-status" data-status="'+status+'" aria-pressed="'+(opts.status===status)+'"'+(opts.status===status?' class="is-active"':'')+'>'+label+' <span>'+count+'</span></button>').join('')+'</div>'+
 '<span class="tt-ot-reference-workflow">'+(access.otContractActive===true?'● Workflow verified':'Read-only workflow')+'</span></div>'+
 '<div class="tt-ot-reference-search"><label for="tt-ot-search">Search requests</label><input id="tt-ot-search" type="search" maxlength="120" placeholder="Search employee or reason…" value="'+esc(opts.search)+'"><button type="button" data-action="tt-ot-sort">Date '+(opts.sort==='oldest'?'↑':'↓')+'</button></div>'+
 '<div class="tt-ot-reference-row tt-ot-reference-labels" aria-hidden="true"><span>Employee</span><span>Date</span><span>Requested Hours</span><span>Reason</span><span>Status</span><span>Actions</span></div>'+
 m.statusRows.map(r=>row(r,access,m.search,expandedRequestIds,access.otContractActive===true)).join('')+
 '<div class="tt-ot-empty" data-tt-ot-empty'+(m.visible.length?' hidden':'')+'><span class="tt-ot-reference-empty-icon" aria-hidden="true">◷</span>'+
 (m.submitted+m.approved+m.rejected===0?'<strong>No overtime this week</strong><p>Overtime requests for this week will appear here.</p><button type="button" class="tt-ot-reference-primary" data-action="'+(canManage?'tt-ot-manual-open':'tt-ot-open')+'"'+disabled(canManage?manualFiling:filing)+'>+ File Overtime</button>':'<strong>No matching requests</strong><p>Try a different week, search or status.</p>')+'</div>'+
 '<footer class="tt-ot-reference-footer"><span>Manual entries are tagged</span><strong>'+m.visible.length+' of '+m.statusRows.length+' total</strong></footer></section>'+
 (modalOpen==='manual'?manualRequestForm(form,access,now,busy):modalOpen?requestForm(form,now,access.otContractActive===true,busy,access.durationOtContractActive===true):'')+'</section>';
}
