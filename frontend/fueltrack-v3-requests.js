/** CP-FT3-03 — FuelTrack+ v3 All Requests, signed-board read model.
 * Reference layout only: no requestor, vehicle, refueling approvals, or trip
 * data may be inferred from a row title or a pump reference.
 */
import {FUELTRACK_V3_ID,isFuelTrackV3ApplicationBoard} from './fueltrack-v3-application.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[c]);
const fmt=new Intl.NumberFormat('en-PH',{maximumFractionDigits:2});
const dateFmt=new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const STATUS_LABELS=Object.freeze([
 {key:'all',label:'All'}, {key:'done',label:'Done'}, {key:'pending',label:'Pending'},
 {key:'approved',label:'Approved'}, {key:'rejected',label:'Rejected'}, {key:'other',label:'Other'}
]);
export const FUELTRACK_REQUEST_PAGE_SIZE=25;
export const FUELTRACK_REQUEST_FILTER_DEFAULTS=Object.freeze({
 search:'',status:'all',from:'',to:'',sort:'newest',limit:FUELTRACK_REQUEST_PAGE_SIZE,
 expandedId:null
});
export function fuelTrackRequestQuickDates(period,now=new Date()){
 const d=new Date(now);
 if(!Number.isFinite(d.getTime()))return null;
 const y=d.getUTCFullYear(),m=d.getUTCMonth();
 const today=d.toISOString().slice(0,10);
 const first=day=>new Date(day).toISOString().slice(0,10);
 if(period==='today')return {from:today,to:today};
 if(period==='week'){
  const start=new Date(Date.UTC(y,m,d.getUTCDate()-(d.getUTCDay()+6)%7));
  return {from:first(start),to:today};
 }
 if(period==='month')return {from:first(new Date(Date.UTC(y,m,1))),to:today};
 if(period==='last-month')return {
  from:first(new Date(Date.UTC(y,m-1,1))),
  to:first(new Date(Date.UTC(y,m,0)))
 };
 return null;
}
export function fuelTrackRequestStatus(value){
 const s=String(value??'').toLowerCase().trim().replace(/[_ -]+/g,' ');
 if(['done','completed'].includes(s))return 'done';
 if(s==='approved')return 'approved';
 if(['pending','waiting','working','in progress','todo','not started','planned','awaiting refueling'].includes(s))return 'pending';
 if(s==='rejected')return 'rejected';
 return 'other';
}
export function validFuelTrackDate(value){
 if(typeof value!=='string'||!DATE_RE.test(value))return false;
 const [y,m,d]=value.split('-').map(Number);
 const dt=new Date(Date.UTC(y,m-1,d));
 return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d;
}
function dateOf(value){
 const raw=value&&typeof value==='object'&&!Array.isArray(value)?
  value.value??value.date??value.text??null:value;
 if(typeof raw==='string'&&validFuelTrackDate(raw))return raw;
 if(typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(raw)&&
    Number.isFinite(Date.parse(raw)))return new Date(raw).toISOString().slice(0,10);
 return null;
}
function field(value){
 const raw=value&&typeof value==='object'&&!Array.isArray(value)?
  value.value??value.text??value.number??null:value;
 if(typeof raw==='number'&&Number.isFinite(raw))return String(raw);
 return typeof raw==='string'&&raw.trim()?raw.trim():null;
}
function columnId(detail,name,type){
 const matches=(Array.isArray(detail.columns)?detail.columns:[]).filter(c=>
  c?.name===name&&c.data_type===type&&c.system_key==null&&c.visible!==false);
 return matches.length===1?matches[0].id:null;
}
function safeFilters(filters){
 const f={...FUELTRACK_REQUEST_FILTER_DEFAULTS,...(filters||{})};
 return {
  search:typeof f.search==='string'?f.search.slice(0,120):'',
  status:STATUS_LABELS.some(x=>x.key===f.status)?f.status:'all',
  from:validFuelTrackDate(f.from)?f.from:'',
  to:validFuelTrackDate(f.to)?f.to:'',
  sort:f.sort==='oldest'?'oldest':'newest',
  limit:Number.isSafeInteger(f.limit)?Math.min(500,Math.max(FUELTRACK_REQUEST_PAGE_SIZE,f.limit)):FUELTRACK_REQUEST_PAGE_SIZE,
  expandedId:typeof f.expandedId==='string'?f.expandedId:null
 };
}
export function fuelTrackRequestsModel(detail,filters={},now=new Date()){
 if(!isFuelTrackV3ApplicationBoard(detail?.board))return null;
 const f=safeFilters(filters);
 const columns={
  date:columnId(detail,'Event Date','date'),
  reference:columnId(detail,'Fuel Event Ref','text'),
  quantity:columnId(detail,'Quantity Liters','number'),
  pump:columnId(detail,'Pump Ref','text'),
  reconcile:columnId(detail,'Reconcile Status','status')
 };
 const raw=(Array.isArray(detail.items)?detail.items:[]).filter(i=>
  i?.id&&i.board_id===FUELTRACK_V3_ID&&!i.archived_at);
 const ids=new Set(raw.map(x=>x.id));
 const map=new Map();
 for(const v of (Array.isArray(detail.values)?detail.values:[])){
  if(!ids.has(v?.item_id)||!Object.values(columns).includes(v.column_id))continue;
  map.set(v.item_id+':'+v.column_id,v.value);
 }
 const get=(item,col)=>col?map.get(item.id+':'+col):null;
 const rows=raw.map(item=>{
  const created=typeof item.created_at==='string'&&Number.isFinite(Date.parse(item.created_at))?
   new Date(item.created_at):null;
  const recorded=dateOf(get(item,columns.date));
  const title=String(item.title||'Untitled request').slice(0,300);
  return {
   id:item.id,title,status:String(item.status||'Unspecified'),
   category:fuelTrackRequestStatus(item.status),
   created:created?.toISOString()||null,
   createdDay:created?.toISOString().slice(0,10)||null,
   date:recorded,
   reference:field(get(item,columns.reference)),
   quantity:field(get(item,columns.quantity)),
   pump:field(get(item,columns.pump)),
   reconcile:field(get(item,columns.reconcile)),
   notes:typeof item.notes==='string'&&item.notes.trim()?item.notes.trim().slice(0,1000):null
  };
 });
 const counts={all:rows.length,done:0,pending:0,approved:0,rejected:0,other:0};
 for(const row of rows)counts[row.category]++;
 const day=Number.isFinite(new Date(now).getTime())?new Date(now).toISOString().slice(0,10):null;
 const startWeek=day?(()=>{
  const dt=new Date(day+'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate()-(dt.getUTCDay()+6)%7);
  return dt.toISOString().slice(0,10);
 })():null;
 const today=rows.filter(r=>day&&r.createdDay===day).length;
 const week=rows.filter(r=>day&&r.createdDay&&r.createdDay>=startWeek&&r.createdDay<=day).length;
 const processed=counts.done+counts.approved+counts.rejected;
 const needle=f.search.toLocaleLowerCase().trim();
 const invalidRange=!!(f.from&&f.to&&f.from>f.to);
 const filtered=invalidRange?[]:rows.filter(r=>
  (f.status==='all'||r.category===f.status)&&
  (!needle||[r.title,r.reference,r.pump].some(v=>String(v||'').toLocaleLowerCase().includes(needle)))&&
  (!f.from||(r.date!==null&&r.date>=f.from))&&
  (!f.to||(r.date!==null&&r.date<=f.to))
 );
 filtered.sort((a,b)=>{
  const da=a.created||'',db=b.created||'';
  const order=da.localeCompare(db)||a.id.localeCompare(b.id);
  return f.sort==='newest'?-order:order;
 });
 return {
  filters:f,columns,rows,counts,today,week,processed,
  completion:rows.length?Math.round(counts.done*100/rows.length):0,
  processedPercent:rows.length?Math.round(processed*100/rows.length):0,
  filteredCount:filtered.length,visible:filtered.slice(0,f.limit),
  canLoadMore:filtered.length>f.limit,invalidRange,
  expanded:filtered.find(r=>r.id===f.expandedId)||null
 };
}
function stat(label,value,detail,icon){
 return '<article class="ft3-request-stat"><span class="ft3-request-stat-icon" aria-hidden="true">'+icon+
  '</span><div><strong>'+esc(value)+'</strong><small>'+esc(label)+'</small>'+
  '<span class="ft3-request-stat-detail">'+esc(detail)+'</span></div></article>';
}
function info(label,value){
 return '<div class="ft3-request-field"><small>'+esc(label)+'</small><strong>'+esc(value??'Not available')+'</strong></div>';
}
function expandedRow(row,columns){
 const date=row.created?dateFmt.format(new Date(row.created)):'Not available';
 const qty=row.quantity?row.quantity+' L':'Not available';
 return '<tr class="ft3-request-detail-row"><td colspan="7"><section class="ft3-request-detail" aria-label="Request details">'+
  '<h4>Request information</h4><div class="ft3-request-detail-grid">'+
  info('Request title',row.title)+info('Fuel event reference',row.reference)+
  info('Submitted',date)+info('Current status',row.status)+
  '</div><h4>Fuel event details</h4><div class="ft3-request-detail-grid">'+
  info('Event date',row.date?dateFmt.format(new Date(row.date+'T00:00:00Z')):'Not available')+
  info('Quantity',qty)+info('Pump reference',row.pump)+
  info('Reconciliation status',row.reconcile)+
  '</div>'+(row.notes?'<div class="ft3-request-notes"><strong>Notes</strong><p>'+esc(row.notes)+'</p></div>':'')+
  '<p class="ft3-request-data-note">Requester identity, vehicle details, routes, odometer readings, refueling personnel and approval history are not provided by this authorized board record. No lifecycle events are inferred.</p>'+
  '</section></td></tr>';
}
function rowMarkup(row,expanded){
 const open=expanded===row.id;
 return '<tr class="ft3-request-row"><td><button type="button" class="ft3-request-expand" data-action="ft3-request-expand" data-id="'+esc(row.id)+
  '" aria-label="'+(open?'Collapse':'Expand')+' request '+esc(row.title)+'" aria-expanded="'+open+'">'+
  '<span class="ft3-request-person">◈</span><span class="ft3-request-heading">'+esc(row.title)+
  '<small>'+esc(row.reference||'Fuel event reference unavailable')+'</small></span></button></td>'+
  '<td>'+esc(row.pump||'—')+'</td><td><span class="ft3-request-type">Fuel event</span></td>'+
  '<td><span class="ft3-status-pill ft3-status-'+row.category+'">'+esc(row.status)+'</span></td>'+
  '<td>—</td><td>'+esc(row.date?dateFmt.format(new Date(row.date+'T00:00:00Z')):'—')+'</td>'+
  '<td><button type="button" class="ft3-request-chevron" data-action="ft3-request-expand" data-id="'+esc(row.id)+
  '" aria-label="'+(open?'Collapse':'Expand')+' request details" aria-expanded="'+open+'">'+
  (open?'⌃':'⌄')+'</button></td></tr>'+(open?expandedRow(row):'');
}
export function fuelTrackRequestsSummary(model){
 if(!model)return '';
 return 'FuelTrack+ v3 — Authorized Board Items\n'+
  'Total: '+model.counts.all+'\nToday (submitted): '+model.today+
  '\nThis week (submitted): '+model.week+'\nDone: '+model.counts.done+
  '\nPending: '+model.counts.pending+'\nApproved: '+model.counts.approved+
  '\nRejected: '+model.counts.rejected+'\nOther: '+model.counts.other+
  '\nCompleted (Done): '+model.completion+'%\nProcessed (Done/Approved/Rejected): '+model.processedPercent+'%';
}
export function renderFuelTrackRequests({detail,filters={}}={}){
 const model=fuelTrackRequestsModel(detail,filters);
 if(!model)return '<div class="ft3-unavailable" role="alert">All Requests is unavailable for this signed board.</div>';
 const f=model.filters;
 const chip=({key,label})=>'<button type="button" class="ft3-request-filter'+
  (f.status===key?' is-active':'')+'" data-action="ft3-request-status" data-status="'+key+'"'+
  (f.status===key?' aria-pressed="true"':' aria-pressed="false"')+'>'+esc(label)+
  ' <strong>'+model.counts[key]+'</strong></button>';
 return '<section class="ft3-requests" aria-label="FuelTrack request log">'+
  '<header class="ft3-dashboard-head"><div><span class="ft3-eyebrow">FUEL CONTROL / RECORDS</span>'+
  '<h2>All Requests</h2><p>'+model.counts.all+' authorized board items · '+model.counts.pending+
  ' pending</p></div><div class="ft3-dashboard-actions">'+
  '<button type="button" class="ft3-soft-action" data-action="ft3-request-copy">Copy Summary</button>'+
  '<button type="button" class="ft3-soft-action" data-action="ft3-request-export">Export CSV</button>'+
  '<button type="button" class="ft3-soft-action" data-action="refresh-board">↻ Refresh</button></div></header>'+
  '<div class="ft3-request-stats">'+
  stat('Today',model.today,'Submitted today','▣')+
  stat('This Week',model.week,'Submitted this week','↗')+
  stat('Completion',model.completion+'%','Done / all requests','◆')+
  stat('Processed',model.processedPercent+'%','Done + approved + rejected','◷')+'</div>'+
  '<div class="ft3-request-filters" aria-label="Status filters">'+STATUS_LABELS.map(chip).join('')+'</div>'+
  '<div class="ft3-request-controls">'+
  '<label class="ft3-request-search-label" for="ft3-request-search">Search requests</label>'+
  '<input id="ft3-request-search" type="search" maxlength="120" autocomplete="off" placeholder="Search by request title or authorized reference" value="'+esc(f.search)+'"/>'+
  '<label for="ft3-request-from">Event date from</label><input id="ft3-request-from" type="date" value="'+esc(f.from)+'"/>'+
  '<label for="ft3-request-to">Event date to</label><input id="ft3-request-to" type="date" value="'+esc(f.to)+'"/>'+
  '<button type="button" class="ft3-soft-action" data-action="ft3-request-sort" aria-label="Sort requests '+(f.sort==='newest'?'oldest first':'newest first')+'">'+
  (f.sort==='newest'?'↓ Newest first':'↑ Oldest first')+'</button>'+
  '<button type="button" class="ft3-soft-action" data-action="ft3-request-clear">Clear filters</button></div>'+
  '<div class="ft3-request-quick-dates" aria-label="Quick event date ranges">'+
  [['today','Today'],['week','This Week'],['month','This Month'],['last-month','Last Month']].map(([key,label])=>
   '<button type="button" data-action="ft3-request-period" data-period="'+key+'">'+label+'</button>').join('')+
  '</div>'+
  (model.invalidRange?'<p role="alert" class="ft3-request-invalid">The starting date must not be after the ending date.</p>':'')+
  '<section class="ft3-panel ft3-request-log"><header class="ft3-panel-head"><div><h3>Request Log</h3>'+
  '<p>Use the expand button to review available signed record fields</p></div>'+
  '<span class="ft3-request-count">'+model.visible.length+' of '+model.filteredCount+' shown</span></header>'+
  '<div class="ft3-request-table-scroll"><table class="ft3-request-table"><thead><tr>'+
  '<th scope="col">Request</th><th scope="col">Pump ref</th><th scope="col">Type</th>'+
  '<th scope="col">Status</th><th scope="col">Refueled by / at</th><th scope="col">Event date</th>'+
  '<th scope="col">Details</th></tr></thead><tbody>'+
  (model.visible.length?model.visible.map(row=>rowMarkup(row,f.expandedId)).join(''):
   '<tr><td colspan="7"><div class="ft3-empty"><strong>No matching requests</strong>'+
   '<p>No authorized board items match the current filters.</p></div></td></tr>')+
  '</tbody></table></div>'+
  (model.canLoadMore?'<footer class="ft3-request-footer"><button type="button" data-action="ft3-request-more">Load more ('+
    (model.filteredCount-model.visible.length)+' remaining)</button></footer>':'')+
  '</section><p class="ft3-request-data-note">Source: current authorized FuelTrack+ v3 board records. The screenshots are layout references; requester, vehicle, approval and trip histories require separate backend integration.</p>'+
  '</section>';
}

/** Export only already-authorized board projection values; neutralize CSV formulas. */
export function fuelTrackRequestsCsv(model){
 if(!model)return '';
 const cell=v=>{
  let value=String(v??'');
  // Excel/LibreOffice formula injection and control characters.
  value=value.replace(/[\u0000-\u001f\u007f]/g,' ');
  if(/^[\s]*[=+\-@]/.test(value))value="'"+value;
  return '"'+value.replace(/"/g,'""')+'"';
 };
 const headers=['Request','Fuel event ref','Pump ref','Status','Event date','Quantity liters','Reconciliation'];
 const records=model.rows.map(r=>[
  r.title,r.reference,r.pump,r.status,r.date,r.quantity,r.reconcile
 ]);
 return [headers,...records].map(row=>row.map(cell).join(',')).join('\r\n');
}
