/** FuelTrack signed operation views. All figures are derived exclusively from
 * verified workspace-scoped domain RPCs. Board items never substitute for RPCs.
 */
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=new Intl.NumberFormat('en-PH',{maximumFractionDigits:2});
const money=v=>v!=null&&Number.isFinite(Number(v))&&Number(v)>=0?new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(v)):'—';
const when=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
const dayFormat=new Intl.DateTimeFormat('en-PH',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'});
const labels={submitted:'Pending Approval',approved:'Awaiting Refueling',rejected:'Rejected',refueling_done:'Refueling Done',completed:'Completed'};
const order=['submitted','approved','refueling_done','completed','rejected'];
const ref=r=>r.kind==='vehicle'?String(r.details.plate||'Not recorded').slice(0,100):
 'Container × '+String(Number(r.details.containerCount)||0);
const fmtDate=v=>Number.isFinite(Date.parse(v))?when.format(new Date(v)):'—';
const card=(title,value,note,tone)=>'<article class="ft3-metric ft3-tone-'+tone+'"><div class="ft3-metric-label"><span>'+esc(title)+'</span></div><strong>'+esc(value)+'</strong><p>'+esc(note)+'</p></article>';
const section=(title,note,body,extra='')=>'<section class="ft3-panel"><header class="ft3-panel-head"><div><h3>'+esc(title)+'</h3><p>'+esc(note)+'</p></div>'+extra+'</header>'+body+'</section>';
const header=(title,subtitle)=>'<header class="ft3-dashboard-head"><div><span class="ft3-eyebrow">FUEL CONTROL / VERIFIED OPERATIONS</span><h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div><div class="ft3-dashboard-actions"><button type="button" class="ft3-soft-action" data-action="refresh-board">↻ Refresh</button></div></header>';
function dashboardHero(s){
 const total=Number(s.total||0),completed=Number(s.completed||0);
 const active=Number(s.submitted||0)+Number(s.approved||0)+Number(s.refuelingDone||0);
 const rejected=Number(s.rejected||0);
 const completion=total?Math.min(100,Math.round(completed/total*100)):0;
 const dash=(251.2*completion/100).toFixed(1);
 const volume=s.totalLiters!=null&&Number.isFinite(Number(s.totalLiters))?
  num.format(s.totalLiters)+' L':'—';
 return '<section class="ft3-dashboard-hero" aria-label="Fuel operations summary">'+
  '<div class="ft3-dashboard-hero-top"><div>'+
   '<span class="ft3-dashboard-kicker">FUEL CONTROL / VERIFIED OPERATIONS</span>'+
   '<h2>Fuel operations at a glance</h2>'+
   '<p>Signed workspace fuel requests and operational performance</p></div>'+
   '<span class="ft3-dashboard-live"><span aria-hidden="true"></span>Verified signed data</span></div>'+
  '<div class="ft3-dashboard-hero-main"><div class="ft3-dashboard-financials">'+
   '<article class="ft3-dashboard-financial-card"><span class="ft3-dashboard-financial-label">Total spent</span>'+
    '<strong class="ft3-dashboard-financial-value">'+esc(money(s.totalAmount))+'</strong>'+
    '<small class="ft3-dashboard-financial-note">Completed fuel transactions</small></article>'+
   '<article class="ft3-dashboard-financial-card"><span class="ft3-dashboard-financial-label">Fuel volume</span>'+
    '<strong class="ft3-dashboard-financial-value">'+esc(volume)+'</strong>'+
    '<small class="ft3-dashboard-financial-note">Completed refueling volume</small></article>'+
  '</div><aside class="ft3-dashboard-completion" aria-label="Request completion">'+
   '<div class="ft3-dashboard-progress-wrap"><svg class="ft3-dashboard-progress" viewBox="0 0 96 96" role="img" aria-label="Completion rate '+completion+' percent">'+
    '<circle class="ft3-dashboard-progress-track" cx="48" cy="48" r="40"></circle>'+
    '<circle class="ft3-dashboard-progress-value" cx="48" cy="48" r="40" stroke-dasharray="'+dash+' 251.2" transform="rotate(-90 48 48)"></circle>'+
   '</svg><div class="ft3-dashboard-progress-copy"><strong>'+completion+'%</strong><span>Completed</span></div></div>'+
   '<p>'+num.format(completed)+' of '+num.format(total)+' requests completed</p>'+
  '</aside></div><div class="ft3-dashboard-hero-footer">'+
   '<div><span>Total requests</span><strong>'+num.format(total)+'</strong></div>'+
   '<div><span>In workflow</span><strong>'+num.format(active)+'</strong></div>'+
   '<div><span>Rejected</span><strong>'+num.format(rejected)+'</strong></div>'+
  '</div></section>';
}
function statusPanel(s){
 const parts=order.map(key=>({
  key,label:labels[key],count:Number(s[key==='refueling_done'?'refuelingDone':key]||0)
 }));
 const total=parts.reduce((sum,part)=>sum+part.count,0);
 let offset=0;
 const segments=parts.map(part=>{
  const width=total?1000*part.count/total:0,x=offset;offset+=width;
  return '<rect class="ft3-dashboard-status-segment ft3-dashboard-status-'+part.key+
   '" x="'+x.toFixed(3)+'" y="0" width="'+width.toFixed(3)+'" height="14">'+
   '<title>'+esc(part.label)+': '+part.count+'</title></rect>';
 }).join('');
 const accessible=parts.map(part=>part.label+': '+part.count).join(', ');
 const stages=parts.map(part=>{
  const percent=total?Math.round(part.count*100/total):0;
  return '<article class="ft3-dashboard-stage ft3-dashboard-stage-'+part.key+
   '" role="listitem" data-status="'+part.key+'">'+
   '<span class="ft3-dashboard-stage-dot" aria-hidden="true"></span>'+
   '<div class="ft3-dashboard-stage-copy"><span class="ft3-dashboard-stage-label">'+
   esc(part.label)+'</span><strong class="ft3-dashboard-stage-count">'+
   num.format(part.count)+'</strong></div>'+
   '<small class="ft3-dashboard-stage-percent">'+percent+'%</small></article>';
 }).join('');
 return '<section class="ft3-panel ft3-dashboard-pipeline"><header class="ft3-panel-head"><div>'+
  '<h3>Request pipeline</h3><p>Every request across its current signed workflow status</p>'+
  '</div><span class="ft3-dashboard-pipeline-total">'+num.format(total)+' classified</span></header>'+
  '<div class="ft3-dashboard-pipeline-body">'+
   '<svg class="ft3-dashboard-status-track" role="img" aria-label="Request status distribution: '+esc(accessible)+
   '" viewBox="0 0 1000 14" preserveAspectRatio="none">'+
   '<rect class="ft3-dashboard-status-track-base" x="0" y="0" width="1000" height="14" rx="7"></rect>'+
   segments+'</svg>'+
   '<div class="ft3-dashboard-stage-grid" role="list">'+stages+'</div>'+
  '</div></section>';
}
function dashboardRecent(snapshot){
 return '<section class="ft3-panel ft3-dashboard-recent"><header class="ft3-panel-head"><div>'+
  '<h3>Recent Fuel Requests</h3><p>Latest verified requests · up to 8 shown</p></div>'+
  '<a class="ft3-text-link" href="#/boards/'+esc(snapshot.boardId)+'/fueltrack/requests">View all requests</a>'+
  '</header>'+historyTable(snapshot.rows,true)+'</section>';
}
function historyTable(rows,compact=false){
 return rows.length?'<div class="ft3-recent-scroll"><table class="ft3-recent-table ft3-signed-table"><thead><tr><th scope="col">Requestor</th><th scope="col">Reference</th><th scope="col">Status</th><th scope="col">Submitted</th></tr></thead><tbody>'+
 rows.slice(0,compact?8:200).map(r=>'<tr><td><strong class="ft3-request-title">'+esc(r.requestor_name)+'</strong></td><td>'+esc(ref(r))+'</td><td><span class="ft3-status-pill ft3-signed-status-'+esc(r.state)+'">'+esc(labels[r.state])+'</span></td><td><time datetime="'+esc(r.created_at)+'">'+esc(fmtDate(r.created_at))+'</time></td></tr>').join('')+'</tbody></table></div>':
 '<div class="ft3-empty"><strong>No fuel requests in this signed response</strong><p>Submitted requests will appear after they are saved.</p></div>';
}
export function renderFuelTrackSignedDashboardRich(snapshot){
 if(!snapshot)return '<p class="ft3-approval-unavailable">Signed FuelTrack data unavailable.</p>';
 const s=snapshot.summary;
 return '<div class="ft3-dashboard ft3-signed-rich ft3-dashboard-view">'+
  dashboardHero(s)+statusPanel(s)+dashboardRecent(snapshot)+'</div>';
}
const statuses=[['all','All'],['submitted','Pending'],['approved','Approved'],['refueling_done','Refueling Done'],['completed','Completed'],['rejected','Rejected']];
function safeFilter(f={}){
 f=f||{};
 return {search:typeof f.search==='string'?f.search.slice(0,120):'',
  status:statuses.some(x=>x[0]===f.status)?f.status:'all',
  sort:f.sort==='oldest'?'oldest':'newest',
  limit:Number.isSafeInteger(f.limit)?Math.max(25,Math.min(200,f.limit)):25,
  expandedId:typeof f.expandedId==='string'?f.expandedId:null};
}
export function modelFuelTrackSignedRequests(snapshot,filters={}){
 if(!snapshot)return null;
 const f=safeFilter(filters),needle=f.search.trim().toLocaleLowerCase();
 const rows=snapshot.rows.filter(r=>
  (f.status==='all'||r.state===f.status)&&
  (!needle||[r.requestor_name,ref(r),r.kind,labels[r.state],r.details?.purpose]
   .some(v=>String(v||'').toLocaleLowerCase().includes(needle))));
 rows.sort((a,b)=>{
  const delta=a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id);
  return f.sort==='oldest'?delta:-delta;
 });
 return {filters:f,rows:rows.slice(0,f.limit),count:rows.length,hasMore:rows.length>f.limit};
}
export function renderFuelTrackSignedRequestsRich(snapshot,filters={}){
 if(!snapshot)return '<p class="ft3-approval-unavailable">Signed requests unavailable.</p>';
 const m=modelFuelTrackSignedRequests(snapshot,filters),s=snapshot.summary;
 return '<section class="ft3-requests ft3-signed-rich">'+header('All Requests','Verified fuel request history · '+num.format(s.total)+' total')+
 '<div class="ft3-request-stats">'+
 [['Pending',s.submitted,'Awaiting approval','◷'],['Approved',s.approved,'Awaiting refueling','✓'],['Completed',s.completed,'Finalized transactions','◆'],['Total',s.total,'Authorized requests','▣']]
 .map(([title,value,note,icon])=>'<article class="ft3-request-stat"><span class="ft3-request-stat-icon" aria-hidden="true">'+icon+'</span><div><strong>'+num.format(value)+'</strong><small>'+esc(title)+'</small><span class="ft3-request-stat-detail">'+esc(note)+'</span></div></article>').join('')+'</div>'+
 '<div class="ft3-request-filters" aria-label="Request status filters">'+statuses.map(([key,label])=>
  '<button type="button" class="ft3-request-filter'+(m.filters.status===key?' is-active':'')+
  '" data-action="ft3-signed-request-status" data-status="'+key+'" aria-pressed="'+(m.filters.status===key?'true':'false')+'">'+label+'</button>').join('')+'</div>'+
 '<div class="ft3-signed-controls"><label for="ft3-signed-request-search">Search verified requests</label>'+
 '<input id="ft3-signed-request-search" type="search" maxlength="120" value="'+esc(m.filters.search)+'" placeholder="Requestor, plate, status or purpose">'+
 '<button type="button" class="ft3-soft-action" data-action="ft3-signed-request-sort">'+(m.filters.sort==='newest'?'↓ Newest first':'↑ Oldest first')+'</button>'+
 '<button type="button" class="ft3-soft-action" data-action="ft3-signed-request-clear">Clear filters</button></div>'+
 section('Request Log',m.count+' matching records · '+m.rows.length+' shown',
 m.rows.length?'<div class="ft3-request-table-scroll"><table class="ft3-request-table"><thead><tr><th scope="col">Request</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Submitted</th><th scope="col">Details</th></tr></thead><tbody>'+
 m.rows.map(r=>{
  const expanded=r.id===m.filters.expandedId;
  return '<tr class="ft3-request-row"><td><strong>'+esc(r.requestor_name)+'</strong><small class="ft3-signed-subtitle">'+esc(ref(r))+'</small></td><td>'+esc(r.kind==='vehicle'?'Vehicle':'Container')+'</td><td><span class="ft3-status-pill ft3-signed-status-'+esc(r.state)+'">'+esc(labels[r.state])+'</span></td><td><time datetime="'+esc(r.created_at)+'">'+esc(fmtDate(r.created_at))+'</time></td><td><button class="ft3-request-chevron" type="button" data-action="ft3-signed-request-expand" data-id="'+esc(r.id)+'" aria-expanded="'+expanded+'" aria-label="'+(expanded?'Collapse':'Expand')+' request details">'+(expanded?'⌃':'⌄')+'</button></td></tr>'+
  (expanded?'<tr class="ft3-request-detail-row"><td colspan="5"><section class="ft3-request-detail"><h4>Verified request details</h4><div class="ft3-request-detail-grid">'+
  [['Requestor',r.requestor_name],['Reference',ref(r)],['Status',labels[r.state]],['Submitted',fmtDate(r.created_at)],['Purpose',r.details?.purpose||'Not specified'],['Request type',r.kind==='vehicle'?'Vehicle':'Container']]
  .map(([k,v])=>'<div class="ft3-request-field"><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>').join('')+'</div></section></td></tr>':'');
 }).join('')+'</tbody></table></div>':
 '<div class="ft3-empty"><strong>No matching requests</strong><p>Change the search or status filter.</p></div>',
 m.hasMore?'<button type="button" class="ft3-soft-action" data-action="ft3-signed-request-more">Load more ('+(m.count-m.rows.length)+' remaining)</button>':'')+
 (snapshot.rows.length>=200?'<p class="ft3-analytics-footnote">Only the latest 200 authorized records were returned. Older records need server pagination.</p>':'')+
 '</section>';
}
const validDaily=r=>{
 if(!r||typeof r.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.day))return false;
 const date=new Date(r.day+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===r.day&&
  Number.isSafeInteger(r.transactions)&&r.transactions>=0&&
  typeof r.liters==='number'&&Number.isFinite(r.liters)&&r.liters>=0&&
  typeof r.amount==='number'&&Number.isFinite(r.amount)&&r.amount>=0;
};
const analyticsViews=[['fuel-price','Fuel Price'],['efficiency','Efficiency'],['frequency','Frequency'],['requestors','Requestors'],['odometer','Odometer']];
const analyticsRanges=[['all','Last 365 days',365],['six-months','Last 180 days',180],['month','Last 30 days',30],['week','Last 7 days',7]];
function analyticsHref(snapshot,view,range,metric){
 return '#/boards/'+esc(snapshot.boardId)+'/fueltrack/analytics/'+view+'/'+range+'/'+metric;
}
function analyticsDateKey(now){
 const current=now instanceof Date?now:new Date(now);
 const date=Number.isFinite(current.getTime())?current:new Date();
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
function analyticsDateFloor(days,now){
 const [year,month,day]=analyticsDateKey(now).split('-').map(Number);
 return new Date(Date.UTC(year,month-1,day-(days-1))).toISOString().slice(0,10);
}
function dailyValue(key,value){
 if(key==='amount')return money(value);
 if(key==='liters')return num.format(value)+' L';
 return num.format(value);
}
function dailyBars(rows,metric){
 if(!rows.length)return '<div class="ft3-empty"><strong>No completed transactions in this period</strong><p>Verified daily charts will appear after completed refueling transactions are recorded.</p></div>';
 const keys=metric==='both'?['amount','liters']:[metric==='spend'?'amount':metric==='volume'?'liters':'transactions'];
 const labels={amount:'Daily spending',liters:'Daily fuel volume',transactions:'Daily transactions'};
 const series=keys.map(key=>{
  const visible=rows.slice(-14);
  const max=Math.max(1,...visible.map(row=>Number(row[key])));
  const total=rows.reduce((sum,row)=>sum+Number(row[key]),0);
  const bars=visible.map(row=>{
   const value=Number(row[key]);
   const height=value>0?Math.max(1,Math.min(20,Math.ceil(value/max*20))):0;
   const formatted=dailyValue(key,value);
   const accessible=row.day+' · '+labels[key]+': '+formatted;
   return '<div class="ft3-signed-bar" tabindex="0" role="group" aria-label="'+esc(accessible)+'" title="'+esc(accessible)+'">'+
    '<div class="ft3-signed-bar-track"><div class="ft3-signed-bar-fill ft3-signed-bar-height-'+height+'"></div></div>'+
    '<small>'+esc(row.day.slice(5))+'</small><span class="ft3-signed-bar-tip">'+esc(formatted)+'</span></div>';
  }).join('');
  return '<section class="ft3-analytics-series" data-metric="'+key+'">'+
   '<header class="ft3-analytics-series-head"><div><strong>'+labels[key]+'</strong>'+
   '<small>Daily · latest 14 active days</small></div><strong class="ft3-analytics-series-total">'+
   esc(dailyValue(key,total))+'</strong></header>'+
   '<div class="ft3-signed-bars" role="group" aria-label="'+esc(labels[key]+' chart')+'">'+bars+'</div></section>';
 }).join('');
 return '<div class="ft3-analytics-trend-grid'+(keys.length===1?' is-single':'')+'">'+series+'</div>';
}
function analyticsDailyTable(rows,mode='summary'){
 if(!rows.length)return '<div class="ft3-empty"><strong>No daily records available</strong><p>Completed transaction records will appear here when available.</p></div>';
 const price=mode==='price';
 const frequency=mode==='frequency';
 const headers=price?['Completion date','Spent','Liters','Effective cost / L']:
  frequency?['Completion date','Completed transactions']:
  ['Completion date','Transactions','Fuel volume','Total spent','Effective cost / L'];
 const body=rows.slice().reverse().map(row=>{
  const date=dayFormat.format(new Date(row.day+'T00:00:00Z'));
  if(price)return '<tr><td>'+esc(date)+'</td><td>'+esc(money(row.amount))+'</td><td>'+esc(num.format(row.liters))+' L</td><td>'+esc(row.liters>0?money(row.amount/row.liters):'—')+'</td></tr>';
  if(frequency)return '<tr><td>'+esc(date)+'</td><td>'+esc(num.format(row.transactions))+'</td></tr>';
  return '<tr><td>'+esc(date)+'</td><td>'+esc(num.format(row.transactions))+'</td><td>'+esc(num.format(row.liters))+' L</td><td>'+esc(money(row.amount))+'</td><td>'+esc(row.liters>0?money(row.amount/row.liters):'—')+'</td></tr>';
 }).join('');
 return '<div class="ft3-analytics-table-scroll"><table class="ft3-analytics-table"><thead><tr>'+
  headers.map(label=>'<th scope="col">'+label+'</th>').join('')+
  '</tr></thead><tbody>'+body+'</tbody></table></div>';
}
function analyticsStatus(snapshot){
 const statuses=[
  ['submitted','Pending approval',snapshot.summary.submitted],
  ['approved','Awaiting refueling',snapshot.summary.approved],
  ['refueling_done','Refueling done',snapshot.summary.refuelingDone],
  ['completed','Completed',snapshot.summary.completed],
  ['rejected','Rejected',snapshot.summary.rejected]
 ];
 return '<div class="ft3-analytics-status-grid" role="list">'+statuses.map(([key,label,value])=>
  '<article class="ft3-analytics-status-item" role="listitem"><span class="ft3-dot ft3-dot-'+key+
  '" aria-hidden="true"></span><span>'+label+'</span><strong>'+esc(num.format(Number(value||0)))+'</strong></article>'
 ).join('')+'</div>';
}
function fuelPriceInsights(rows,totals){
 const valid=rows.filter(row=>Number(row.liters)>0);
 if(!valid.length)return '<div class="ft3-analytics-insight-empty"><strong>Effective cost per liter unavailable</strong><p>At least one completed transaction with a positive recorded fuel volume is required. A posted pump price is not present in the signed analytics contract.</p></div>';
 return '<div class="ft3-analytics-price-highlight"><div><span>Weighted effective cost per liter</span>'+
  '<strong>'+esc(totals.liters>0?money(totals.amount/totals.liters):'—')+'</strong>'+
  '<small>Total recorded amount ÷ total recorded liters</small></div>'+
  '<p>This is the realized cost across completed refueling transactions, not a posted station price.</p></div>'+
  analyticsDailyTable(valid,'price');
}
function frequencyInsights(rows){
 return '<div class="ft3-analytics-frequency-chart">'+dailyBars(rows,'transactions')+'</div>'+
  analyticsDailyTable(rows,'frequency');
}
function analyticsDetail(snapshot,rows,totals,view){
 if(view==='fuel-price')return section('Effective Fuel Cost','Daily realized cost per liter from signed completed transactions',fuelPriceInsights(rows,totals));
 if(view==='frequency')return section('Completed Transaction Frequency','Daily completed refueling count · Manila-local dates',frequencyInsights(rows));
 const details={
  efficiency:['Efficiency Insights','The current signed analytics response does not include distance travelled, vehicle mileage, or efficiency targets. Vehicle-level km/L and benchmark comparisons cannot yet be calculated.'],
  requestors:['Requestor Insights','The current signed analytics response is aggregated by completion date and does not expose requestor-level totals. A leaderboard would require a signed requestor breakdown.'],
  odometer:['Odometer Insights','Verified odometer readings and vehicle-level mileage are not included in the current signed analytics response. No distance or km/L values are inferred.']
 };
 const [title,description]=details[view];
 return section(title,'Data availability', '<div class="ft3-analytics-insight-empty"><strong>Additional signed data required</strong><p>'+esc(description)+'</p></div>');
}
export function renderFuelTrackSignedAnalyticsRich(snapshot,analytics,{view='fuel-price',range='all',metric='both',now=new Date()}={}){
 if(!snapshot||!analytics||analytics.status!=='VERIFIED_READ'||analytics.boardId!==snapshot.boardId||
 analytics.workspaceId!==snapshot.workspaceId||!Array.isArray(analytics.daily)||
 analytics.daily.length>365||!analytics.daily.every(validDaily))
 return '<p class="ft3-approval-unavailable">Signed analytics unavailable.</p>';
 const chosen=analyticsViews.some(item=>item[0]===view)?view:'fuel-price';
 const selected=analyticsRanges.some(item=>item[0]===range)?range:'all';
 const trendMetric=['spend','volume','both'].includes(metric)?metric:'both';
 const requestedDays=analyticsRanges.find(item=>item[0]===selected)[2];
 const reportedDays=Number(analytics.days);
 const responseDays=Number.isSafeInteger(reportedDays)&&reportedDays>=1&&reportedDays<=365?reportedDays:365;
 const days=Math.min(requestedDays,responseDays);
 const dateFloor=analyticsDateFloor(days,now);
 const dateCeiling=analyticsDateKey(now);
 const daily=analytics.daily.filter(row=>row.day>=dateFloor&&row.day<=dateCeiling).sort((a,b)=>a.day.localeCompare(b.day));
 const totals=daily.reduce((result,row)=>({
  count:result.count+Number(row.transactions),
  liters:result.liters+Number(row.liters),
  amount:result.amount+Number(row.amount)
 }),{count:0,liters:0,amount:0});
 const filters=analyticsRanges.map(([key,label])=>
  '<a class="ft3-analytics-chip'+(key===selected?' is-active':'')+'" href="'+
  analyticsHref(snapshot,chosen,key,trendMetric)+'"'+
  (key===selected?' aria-current="true"':'')+'>'+label+'</a>').join('');
 const metrics=[['spend','Spend'],['volume','Volume'],['both','Both']].map(([key,label])=>
  '<a class="ft3-analytics-chip'+(key===trendMetric?' is-active':'')+'" href="'+
  analyticsHref(snapshot,chosen,selected,key)+'"'+
  (key===trendMetric?' aria-current="true"':'')+'>'+label+'</a>').join('');
 const tabs=analyticsViews.map(([key,label])=>
  '<a class="ft3-analytics-section-tab'+(key===chosen?' is-active':'')+'" href="'+
  analyticsHref(snapshot,key,selected,trendMetric)+'"'+
  (key===chosen?' aria-current="page"':'')+'>'+label+'</a>').join('');
 const effectiveCost=totals.liters>0?money(totals.amount/totals.liters):'—';
 const avgTransaction=totals.count>0?money(totals.amount/totals.count):'—';
 return '<section class="ft3-analytics ft3-signed-rich ft3-analytics-v2">'+
  '<header class="ft3-analytics-hero"><div class="ft3-analytics-hero-copy">'+
   '<span class="ft3-analytics-kicker">FUEL INTELLIGENCE / ANALYTICS</span>'+
   '<h2>Fuel Analytics</h2><p>Completed refueling performance · Manila-local calendar</p>'+
  '</div><div class="ft3-analytics-hero-actions"><span class="ft3-analytics-live"><span aria-hidden="true"></span>Verified signed data</span>'+
   '<button type="button" class="ft3-soft-action ft3-analytics-export" data-action="ft3-analytics-export" aria-label="Export verified analytics as CSV"'+(!daily.length?' disabled':'')+'>↓ Export CSV</button>'+
   '<button type="button" class="ft3-soft-action" data-action="refresh-board">↻ Refresh</button></div></header>'+
  '<div class="ft3-analytics-toolbar"><div class="ft3-analytics-control-group">'+
   '<span class="ft3-analytics-control-label">Reporting window</span><div class="ft3-analytics-range" aria-label="Date filters">'+filters+'</div></div>'+
   '<div class="ft3-analytics-control-group ft3-analytics-metric-group">'+
   '<span class="ft3-analytics-control-label">Trend metric</span><div class="ft3-analytics-metric-filter" aria-label="Trend metric">'+metrics+'</div></div></div>'+
  '<div class="ft3-metric-grid ft3-analytics-summary">'+
   '<article class="ft3-analytics-kpi ft3-analytics-kpi-spend"><div class="ft3-analytics-kpi-top"><span>Total spent</span><span aria-hidden="true">₱</span></div><strong>'+esc(money(totals.amount))+'</strong><small>Completed transactions in period</small></article>'+
   '<article class="ft3-analytics-kpi ft3-analytics-kpi-volume"><div class="ft3-analytics-kpi-top"><span>Fuel volume</span><span aria-hidden="true">◈</span></div><strong>'+esc(num.format(totals.liters))+' L</strong><small>Verified dispensed liters</small></article>'+
   '<article class="ft3-analytics-kpi ft3-analytics-kpi-count"><div class="ft3-analytics-kpi-top"><span>Transactions</span><span aria-hidden="true">↗</span></div><strong>'+esc(num.format(totals.count))+'</strong><small>Completed refueling events</small></article>'+
   '<article class="ft3-analytics-kpi ft3-analytics-kpi-rate"><div class="ft3-analytics-kpi-top"><span>Effective cost / L</span><span aria-hidden="true">≈</span></div><strong>'+esc(effectiveCost)+'</strong><small>Weighted amount ÷ liters · avg / transaction '+esc(avgTransaction)+'</small></article>'+
  '</div>'+
  '<p class="ft3-analytics-data-note"><strong>Verified data only.</strong> Figures include completed refueling transactions returned by the signed FuelTrack analytics service. Showing last '+esc(days)+' days ('+esc(dateFloor)+' to '+esc(dateCeiling)+') · dates use Asia/Manila.</p>'+
  section('Consumption Trend','Daily spending and dispensed volume · latest 14 active days',dailyBars(daily,trendMetric))+
  '<div class="ft3-analytics-grid">'+
   section('Daily Summary','Completed transaction totals for the selected period',analyticsDailyTable(daily))+
   section('Request Status','Current signed workflow totals',analyticsStatus(snapshot))+
  '</div>'+
  '<nav class="ft3-analytics-section-nav" aria-label="Analytics categories">'+tabs+'</nav>'+
  '<div class="ft3-analytics-detail">'+analyticsDetail(snapshot,daily,totals,chosen)+'</div>'+
  '<p class="ft3-analytics-footnote">Effective cost per liter is a weighted calculation from recorded amount and dispensed volume. It is not a station-listed pump price. Older trends require a signed backend query beyond the available 365-day window.</p>'+
 '</section>';
}


export function fuelTrackAnalyticsCsv(analytics){
 if(!analytics||analytics.status!=='VERIFIED_READ'||!Array.isArray(analytics.daily)||
  analytics.daily.length>365||!analytics.daily.every(validDaily))return null;
 const seen=new Set();
 for(const row of analytics.daily){
  if(seen.has(row.day))return null;
  seen.add(row.day);
 }
 const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
 const rows=[['Completion date','Completed transactions','Fuel liters','Amount PHP','Effective cost per liter PHP']];
 for(const row of analytics.daily.slice().sort((a,b)=>a.day.localeCompare(b.day))){
  rows.push([row.day,row.transactions,row.liters,row.amount,
   row.liters>0?(row.amount/row.liters).toFixed(2):'']);
 }
 return '\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n');
}
