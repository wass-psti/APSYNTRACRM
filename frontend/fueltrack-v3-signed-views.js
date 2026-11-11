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
function statusPanel(s){
 const parts=order.map(key=>({key,count:Number(s[key==='refueling_done'?'refuelingDone':key]||0)}));
 const total=parts.reduce((n,p)=>n+p.count,0);
 let offset=0;
 const segments=parts.map(p=>{
  const width=total?1000*p.count/total:0,x=offset;offset+=width;
  return '<rect class="ft3-status-segment ft3-status-'+esc(p.key)+'" x="'+x.toFixed(3)+'" y="0" width="'+width.toFixed(3)+'" height="12"><title>'+esc(labels[p.key])+': '+p.count+'</title></rect>';
 }).join('');
 return section('Request Status','Authoritative workflow distribution',
  '<svg class="ft3-status-track" role="img" aria-label="Fuel request status distribution" viewBox="0 0 1000 12" preserveAspectRatio="none"><rect x="0" y="0" width="1000" height="12" rx="6" fill="#e1ecee"/>'+segments+'</svg>'+
  '<div class="ft3-status-list">'+parts.map(p=>'<div class="ft3-status-row"><span class="ft3-dot ft3-dot-'+esc(p.key)+'"></span><span>'+esc(labels[p.key])+'</span><strong>'+p.count+'</strong><small>'+(total?Math.round(100*p.count/total):0)+'%</small></div>').join('')+'</div>');
}
function historyTable(rows,compact=false){
 return rows.length?'<div class="ft3-recent-scroll"><table class="ft3-recent-table ft3-signed-table"><thead><tr><th scope="col">Requestor</th><th scope="col">Reference</th><th scope="col">Status</th><th scope="col">Submitted</th></tr></thead><tbody>'+
 rows.slice(0,compact?8:200).map(r=>'<tr><td><strong class="ft3-request-title">'+esc(r.requestor_name)+'</strong></td><td>'+esc(ref(r))+'</td><td><span class="ft3-status-pill ft3-signed-status-'+esc(r.state)+'">'+esc(labels[r.state])+'</span></td><td><time datetime="'+esc(r.created_at)+'">'+esc(fmtDate(r.created_at))+'</time></td></tr>').join('')+'</tbody></table></div>':
 '<div class="ft3-empty"><strong>No fuel requests in this signed response</strong><p>Submitted requests will appear after they are saved.</p></div>';
}
export function renderFuelTrackSignedDashboardRich(snapshot){
 if(!snapshot)return '<p class="ft3-approval-unavailable">Signed FuelTrack data unavailable.</p>';
 const s=snapshot.summary;
 return '<div class="ft3-dashboard ft3-signed-rich">'+header('Dashboard','Signed workspace fuel requests and operational performance')+
 '<div class="ft3-metric-grid">'+
 card('Total Spent',money(s.totalAmount),'Completed fuel transactions','teal')+
 card('Fuel Volume',s.totalLiters!=null&&Number.isFinite(Number(s.totalLiters))?num.format(s.totalLiters)+' L':'—','Completed volume','coral')+
 card('Total Requests',num.format(s.total),'Signed authorized requests','blue')+
 card('Completed',num.format(s.completed),'Finalized refueling records','gold')+'</div>'+
 '<div class="ft3-dashboard-grid">'+
 section('Workflow Overview','Current signed request lifecycle',
  '<div class="ft3-signed-workflow">'+
  [['Pending approval',s.submitted],['Approved',s.approved],['Refueling done',s.refuelingDone],['Completed',s.completed]].map(([k,v])=>'<div><span>'+esc(k)+'</span><strong>'+num.format(v)+'</strong></div>').join('')+'</div>')+
 statusPanel(s)+'</div>'+
 section('Recent Fuel Requests','Latest verified requests · up to 8 shown',
  historyTable(snapshot.rows,true),'<a class="ft3-text-link" href="#/boards/'+esc(snapshot.boardId)+'/fueltrack/requests">All requests</a>')+
 '</div>';
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
const validDaily=r=>r&&/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&
 Number.isSafeInteger(Number(r.transactions))&&Number(r.transactions)>=0&&
 Number.isFinite(Number(r.liters))&&Number(r.liters)>=0&&
 Number.isFinite(Number(r.amount))&&Number(r.amount)>=0;
const analyticsViews=[['fuel-price','Fuel Price'],['efficiency','Efficiency'],['frequency','Frequency'],['requestors','Requestors'],['odometer','Odometer']];
function analyticsHref(snapshot,view,range,metric){
 return '#/boards/'+esc(snapshot.boardId)+'/fueltrack/analytics/'+view+'/'+range+'/'+metric;
}
function dailyBars(rows,metric){
 if(!rows.length)return '<div class="ft3-empty"><strong>No completed transactions in this period</strong><p>Chart data appears after signed completed refueling transactions are available.</p></div>';
 const chosen=metric==='spend'?'amount':'liters',max=Math.max(1,...rows.map(r=>Number(r[chosen])));
 return '<div class="ft3-signed-bars" role="img" aria-label="Completed daily '+(chosen==='amount'?'spending':'fuel volume')+'">'+rows.slice(-14).map(r=>
  '<div class="ft3-signed-bar"><div class="ft3-signed-bar-track"><div class="ft3-signed-bar-fill ft3-signed-bar-height-'+Math.max(1,Math.min(20,Math.ceil(Number(r[chosen])/max*20)))+'"></div></div><small>'+esc(r.day.slice(5))+'</small><span class="ft3-signed-bar-tip">'+esc(r.day)+' · '+esc(chosen==='amount'?money(r.amount):num.format(r.liters)+' L')+'</span></div>').join('')+'</div>';
}
export function renderFuelTrackSignedAnalyticsRich(snapshot,analytics,{view='fuel-price',range='all',metric='both'}={}){
 if(!snapshot||!analytics||analytics.status!=='VERIFIED_READ'||analytics.boardId!==snapshot.boardId||
 analytics.workspaceId!==snapshot.workspaceId||!Array.isArray(analytics.daily)||
 analytics.daily.length>365||!analytics.daily.every(validDaily))
 return '<p class="ft3-approval-unavailable">Signed analytics unavailable.</p>';
 const chosen=analyticsViews.some(x=>x[0]===view)?view:'fuel-price';
 const selected=['all','six-months','month','week'].includes(range)?range:'all';
 const trendMetric=['spend','volume','both'].includes(metric)?metric:'both';
 const days=selected==='week'?7:selected==='month'?31:selected==='six-months'?183:analytics.days;
 const cutoff=new Date();cutoff.setUTCDate(cutoff.getUTCDate()-days+1);
 const dparts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(cutoff)
  .filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const dateFloor=dparts.year+'-'+dparts.month+'-'+dparts.day;
 const daily=analytics.daily.filter(r=>r.day>=dateFloor).sort((a,b)=>a.day.localeCompare(b.day));
 const totals=daily.reduce((a,r)=>({count:a.count+Number(r.transactions),liters:a.liters+Number(r.liters),amount:a.amount+Number(r.amount)}),{count:0,liters:0,amount:0});
 const filters=[['all','Available Data'],['six-months','6 Months'],['month','This Month'],['week','This Week']];
 return '<section class="ft3-analytics ft3-signed-rich">'+header('Analytics','Completed refueling performance · Manila-local calendar')+
 '<div class="ft3-analytics-range" aria-label="Date filters">'+filters.map(([key,label])=>
 '<a class="ft3-analytics-chip'+(key===selected?' is-active':'')+'" href="'+analyticsHref(snapshot,chosen,key,trendMetric)+'"'+(key===selected?' aria-current="true"':'')+'>'+label+'</a>').join('')+'</div>'+
 '<div class="ft3-metric-grid ft3-analytics-summary">'+
 [['Total Spent',money(totals.amount),'Verified completed transactions','teal'],
 ['Fuel Volume',num.format(totals.liters)+' L','Verified dispensed liters','coral'],
 ['Transactions',num.format(totals.count),'Completed in selected period','blue'],
 ['Average / Transaction',totals.count?money(totals.amount/totals.count):'—','Cost per completed transaction','gold']]
 .map(([title,value,note,tone])=>card(title,value,note,tone)).join('')+'</div>'+
 '<div class="ft3-analytics-metric-filter" aria-label="Trend metric">'+[['spend','Spend'],['volume','Volume'],['both','Both']].map(([key,label])=>
 '<a class="ft3-analytics-chip'+(key===trendMetric?' is-active':'')+'" href="'+analyticsHref(snapshot,chosen,selected,key)+'">'+label+'</a>').join('')+'</div>'+
 section('Consumption Trend','Last 14 days with completed transactions · '+(trendMetric==='spend'?'spending':'fuel volume'),
 dailyBars(daily,trendMetric))+
 '<div class="ft3-analytics-grid">'+
 section('Daily Summary','Completed transaction totals',
 daily.length?'<div class="ft3-recent-scroll"><table class="ft3-recent-table"><thead><tr><th>Date</th><th>Transactions</th><th>Liters</th><th>Amount</th></tr></thead><tbody>'+
 daily.slice().reverse().map(r=>'<tr><td>'+esc(dayFormat.format(new Date(r.day+'T00:00:00Z')))+'</td><td>'+esc(r.transactions)+'</td><td>'+esc(num.format(r.liters))+' L</td><td>'+esc(money(r.amount))+'</td></tr>').join('')+'</tbody></table></div>':
 '<div class="ft3-empty"><strong>No completed records</strong></div>')+
 section('Status Overview','All authorized requests',
 '<div class="ft3-status-list">'+[['Pending',snapshot.summary.submitted],['Approved',snapshot.summary.approved],['Completed',snapshot.summary.completed]].map(([k,v])=>
 '<div class="ft3-status-row"><span class="ft3-dot"></span><span>'+k+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div>')+'</div>'+
 '<nav class="ft3-analytics-section-nav" aria-label="Analytics categories">'+analyticsViews.map(([key,label])=>
 '<a class="ft3-analytics-section-tab'+(chosen===key?' is-active':'')+'" href="'+analyticsHref(snapshot,key,selected,trendMetric)+'"'+(chosen===key?' aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav>'+
 section(analyticsViews.find(x=>x[0]===chosen)[1]+' Insights','Verified FuelTrack data only',
 chosen==='fuel-price'?
 '<div class="ft3-empty"><strong>Verified expenditure and volume shown above</strong><p>Unit-price history requires recorded per-liter pricing; total spending does not establish a unit price.</p></div>':
 '<div class="ft3-empty"><strong>Additional '+esc(chosen)+' metrics unavailable</strong><p>Vehicle, odometer, route and benchmark analytics require corresponding signed domain records. No values are inferred.</p></div>')+
 '<p class="ft3-analytics-footnote">Available analytics window: last '+esc(analytics.days)+' days. Older trends require a signed backend query for a longer period.</p></section>';
}
