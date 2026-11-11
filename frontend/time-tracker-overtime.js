/** TimeTracker OT: signed read-only presentation until dedicated server RPC acceptance. */
export const TT_OT_WRITES_ACCEPTED=false;
export const TT_OT_DEFAULT_FILTERS=Object.freeze({weekOffset:0,status:'Submitted',search:'',sort:'newest'});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const msDay=86400000;
const validDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const phtDay=(at=new Date())=>{
 const d=new Date(new Date(at).getTime()+8*3600000);
 return d.toISOString().slice(0,10);
};
const fmt=x=>validDay(x)?new Intl.DateTimeFormat('en-US',{
 timeZone:'UTC',month:'short',day:'numeric'
}).format(new Date(x+'T00:00:00Z')):'—';
const minutesLabel=n=>Number.isInteger(n)&&n>=0?
 Math.floor(n/60)+'h '+String(n%60).padStart(2,'0')+'m':'—';
export function timeTrackerOtWeek(offset=0,at=new Date()){
 if(!Number.isInteger(offset)||Math.abs(offset)>104)throw Error('Invalid OT week');
 const today=phtDay(at);
 const startMs=Date.parse(today+'T00:00:00Z')-
  new Date(today+'T00:00:00Z').getUTCDay()*msDay+offset*7*msDay;
 const iso=ms=>new Date(ms).toISOString().slice(0,10);
 const start=iso(startMs),end=iso(startMs+6*msDay);
 return {start,end,today,label:fmt(start)+' – '+fmt(end),
  days:Array.from({length:7},(_,i)=>iso(startMs+i*msDay))};
}
export function overtimeDurationMinutes(start,end){
 if(!/^\d{2}:\d{2}$/.test(start||'')||!/^\d{2}:\d{2}$/.test(end||''))return null;
 const [h,m]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);
 if(h>23||eh>23||m>59||em>59)return null;
 const result=eh*60+em-h*60-m;
 return result>=30&&result<=360?result:null;
}
export function validateOvertimeDraft({date,start,end,reason}={},at=new Date()){
 if(!validDay(date))return {valid:false,message:'Select a valid date.'};
 const gap=(Date.parse(date+'T00:00:00Z')-
  Date.parse(phtDay(at)+'T00:00:00Z'))/msDay;
 if(gap < -30||gap > 7)return {valid:false,message:'Choose a day within the last 30 or next 7 days.'};
 const durationMinutes=overtimeDurationMinutes(start,end);
 if(durationMinutes===null)return {valid:false,message:'Use same-day times for 30 minutes to 6 hours.'};
 const description=String(reason||'').trim();
 if(description.length<10||description.length>500)
  return {valid:false,message:'Reason must be 10–500 characters.'};
 return {valid:true,date,start,end,reason:description,durationMinutes};
}
/** Records must already have been scoped by the signed server. This never grants access. */
export function projectTimeTrackerOtRows(rows=[]){
 if(!Array.isArray(rows)||rows.length>25000)throw Error('Invalid authorized OT records');
 return rows.filter(r=>r&&typeof r.id==='string'&&validDay(r.date)&&
  ['Draft','Submitted','Approved','Rejected'].includes(r.status)).map(r=>Object.freeze({
  id:r.id.slice(0,140),ownerId:String(r.ownerId||'').slice(0,48),
  name:String(r.name||'Signed employee').slice(0,100),
  date:r.date,status:r.status,start:String(r.start||'').slice(0,5),
  end:String(r.end||'').slice(0,5),
  durationMinutes:Number.isInteger(r.durationMinutes)&&r.durationMinutes>=0&&
   r.durationMinutes<=360?r.durationMinutes:null,
  task:String(r.task||'').slice(0,500),
  searchText:[String(r.name||'Signed employee'),String(r.task||''),r.date].join(' ').toLocaleLowerCase()
 }));
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
const row=(r,bootstrap=false,query='')=>'<details class="tt-ot-request" data-search-text="'+esc(r.searchText||[r.name,r.task,r.date].join(' ').toLowerCase())+'"'+
 (query&&!r.searchText.includes(query)?' hidden':'')+'><summary>'+
 '<span>'+esc(r.name)+'</span><span>'+esc(fmt(r.date))+'</span>'+
 '<strong>'+esc(minutesLabel(r.durationMinutes))+'</strong>'+
 '<span class="tt-ot-pill tt-ot-'+r.status.toLowerCase()+'">'+
 esc(r.status==='Submitted'?'Pending':r.status)+'</span><span>⌄</span></summary>'+
 '<div class="tt-ot-detail"><span><b>Start:</b> '+esc(r.start)+'</span>'+
 '<span><b>End:</b> '+esc(r.end)+'</span>'+
 '<p><b>Reason:</b> '+esc(r.task||'Not supplied')+'</p>'+
 '<p>Approval/rejection is restricted to server-verified bootstrap administrators.</p>'+ 
 (bootstrap&&r.status==='Submitted'?'<div class="tt-ot-review-actions">'+
  '<button type="button" data-action="tt-ot-approve" data-id="'+esc(r.id)+'"'+
   (!TT_OT_WRITES_ACCEPTED?' disabled title="Backend acceptance pending"':'')+'>'+
   'Approve</button>'+ 
  '<button type="button" data-action="tt-ot-reject" data-id="'+esc(r.id)+'"'+
   (!TT_OT_WRITES_ACCEPTED?' disabled title="Backend acceptance pending"':'')+'>'+
   'Reject</button>'+ 
  '</div>':'')+'</div></details>';
function requestForm({date,start='18:00',end='20:00',reason=''}={},now=new Date()){
 const amount=overtimeDurationMinutes(start,end);
 return '<div class="tt-ot-backdrop"><section class="tt-ot-modal" role="dialog" aria-modal="true"'+
 ' aria-labelledby="tt-ot-modal-title"><header><div><h3 id="tt-ot-modal-title">'+
 'Submit Overtime Request</h3><p>Request approval for overtime work</p></div>'+
 '<button type="button" data-action="tt-ot-close" aria-label="Close">×</button></header>'+
 '<form id="tt-ot-form"><div class="tt-ot-form-grid">'+
 '<label>DATE<input id="tt-ot-date" type="date" required value="'+esc(date||phtDay(now))+'"></label>'+
 '<div class="tt-ot-duration"><small>DURATION · 6 h maximum</small><strong>'+
 esc(amount===null?'Invalid interval':minutesLabel(amount))+'</strong></div>'+
 '<label>START<input id="tt-ot-start" type="time" required value="'+esc(start)+'"></label>'+
 '<label>END<input id="tt-ot-end" type="time" required value="'+esc(end)+'"></label>'+
 '<label class="tt-ot-reason">REASON<textarea id="tt-ot-reason" maxlength="500" rows="4"'+
 ' required placeholder="Explain why overtime was necessary…">'+esc(reason)+'</textarea>'+
 '<small>'+String(reason).length+'/500</small></label></div>'+
 '<p class="tt-ot-gate">Submission is pending server-side authorization and immutable audit verification.</p>'+
 '<footer><button type="button" data-action="tt-ot-close">Cancel</button>'+
 '<button type="submit"'+(!TT_OT_WRITES_ACCEPTED?' disabled':'')+'>Submit Request</button></footer></form></section></div>';
}
export function renderTimeTrackerOvertime({
 requests=[],access={},filters={},modalOpen=false,form={},now=new Date()
}={}){
 const opts={...TT_OT_DEFAULT_FILTERS,...filters};
 const m=timeTrackerOtMetrics(requests,opts,now);
 const statuses=[['Submitted','Pending',m.submitted],
  ['Approved','Approved',m.approved],['Rejected','Rejected',m.rejected]];
 const high=Math.max(1,...m.byDay);
 return '<section class="tt-overtime tt-overtime-command" aria-label="TimeTracker authorized overtime requests">'+
 '<header class="tt-ot-header tt-ot-command-hero" aria-label="Authorized overtime overview">'+
  '<div class="tt-ot-graphics" aria-hidden="true">'+
   '<div class="tt-pixi-backdrop" data-pixi="fallback"></div>'+
   '<span class="tt-ot-orbit tt-ot-orbit-outer"></span>'+
   '<span class="tt-ot-orbit tt-ot-orbit-inner"></span></div>'+
  '<div class="tt-ot-hero-content">'+
   '<span class="tt-ot-eyebrow"><span class="tt-ot-signal" aria-hidden="true"></span>'+
    'APSYNTRA / OVERTIME INTELLIGENCE</span>'+
   '<h3>Overtime</h3><p>Authorized requests, approvals and weekly outcomes</p>'+
   '<span class="tt-ot-scope">Read-only · '+
    (access?.bootstrapApprover===true?'Bootstrap review scope':'Signed request scope')+
   '</span><span class="tt-ot-hero-week">'+esc(m.week.label)+'</span></div>'+
  '<div class="tt-ot-hero-telemetry" aria-label="Authorized weekly overtime snapshot">'+
   '<span class="tt-ot-telemetry-caption">SIGNED WEEKLY SNAPSHOT</span>'+
   '<div class="tt-ot-telemetry-primary"><strong>'+esc(minutesLabel(m.approvedMinutes))+
    '</strong><span>Approved overtime<br>this week</span></div>'+
   '<div class="tt-ot-telemetry-grid">'+
    '<div><strong>'+m.submitted+'</strong><span>Pending</span></div>'+
    '<div><strong>'+m.approved+'</strong><span>Approved</span></div>'+
    '<div><strong>'+m.rejected+'</strong><span>Rejected</span></div></div>'+
   '<button type="button" class="secondary tt-ot-hero-refresh" data-action="tt-refresh">'+
    'Refresh authorized OT</button>'+
  '</div></header>'+
 '<div class="tt-ot-week"><small>WEEK</small><div>'+
 '<button type="button" data-action="tt-ot-prev" aria-label="Previous week"'+
 (opts.weekOffset<=-104?' disabled':'')+'>‹</button>'+
 '<strong>'+esc(m.week.label)+'</strong>'+
 '<button type="button" data-action="tt-ot-next" aria-label="Next week"'+
 (opts.weekOffset>=104?' disabled':'')+'>›</button>'+
 '<button type="button" data-action="tt-ot-current">This Week</button>'+
 '<button type="button" class="tt-ot-submit" data-action="tt-ot-open">＋ Submit OT</button></div></div>'+
 '<div class="tt-ot-metrics">'+metric('OT HOURS',minutesLabel(m.approvedMinutes))+
 metric('PENDING',m.submitted)+metric('APPROVED',m.approved)+
 metric('RATE',m.approvalRate===null?'—':m.approvalRate+'%')+'</div>'+
 '<p class="tt-ot-subline">'+m.all.length+' authorized request(s) this week</p>'+
 '<div class="tt-ot-section-heading">INSIGHTS <span>'+esc(m.week.label)+'</span></div>'+
 '<div class="tt-ot-insights"><article><h4>OT BY DAY</h4>'+
 '<div class="tt-ot-chart">'+m.byDay.map((v,i)=>
  '<div><progress value="'+v+'" max="'+high+'" aria-label="'+
   ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][i]+
   ' approved overtime minutes"></progress><small>'+
  ['S','M','T','W','T','F','S'][i]+'</small></div>').join('')+
 '</div></article><article><h4>TOP REQUESTORS</h4>'+
 (m.owners.length?m.owners.map(([name,count])=>'<div class="tt-ot-requestor"><b>'+
  esc(name)+'</b><progress value="'+count+'" max="'+m.owners[0][1]+'"></progress>'+
  '<span>'+count+'</span></div>').join(''):
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
 m.statusRows.map(r=>row(r,access?.bootstrapApprover===true,m.search)).join(''):'')+
 '<div class="tt-ot-empty" data-tt-ot-empty'+(m.visible.length?' hidden':'')+'><span>◷</span>'+
 '<strong>No matching requests</strong><p>Try a different week, search or status.</p>'+
 '<button type="button" data-action="tt-ot-open">＋ Submit a request</button></div>'+
 '<p class="tt-ot-note">'+(access?.bootstrapApprover===true?
  'Bootstrap administrator identity verified. ':'')+
 'Only bootstrap administrators may approve or reject. Live writes remain gated until server RPC acceptance.</p>'+
 '</section>'+(modalOpen?requestForm(form,now):'')+'</section>';
}
