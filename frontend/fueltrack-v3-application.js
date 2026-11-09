/** CP-FT3-01 — FuelTrack+ v3 application shell and signed-board dashboard.
 * Read-only until a dedicated fuel operations contract is activated.
 * Never substitute the Monday.com reference screenshot's 271 transactions.
 */
export const FUELTRACK_V3_ID='7af78b3f-67bf-4600-9aa1-9006d19d486e';
const MARKER='[APSYNTRA:MODULE:fueltrack:v1]';
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const fmt=new Intl.NumberFormat('en-PH',{maximumFractionDigits:2});
const escapeName=v=>h(String(v||'').trim().slice(0,240));
export const FUELTRACK_TABS=Object.freeze([
 {key:'dashboard',label:'Dashboard',icon:'▦'},
 {key:'analytics',label:'Analytics',icon:'▥'},
 {key:'requests',label:'All Requests',icon:'▤'},
 {key:'new-request',label:'New Fuel Request',icon:'⊕'},
 {key:'approvals',label:'Approvals',icon:'♢'},
 {key:'lightfuels',label:'LightFuels',icon:'◇'},
 {key:'activity',label:'Activity',icon:'◷'}
]);
export function isFuelTrackV3ApplicationBoard(board){
 return board?.id===FUELTRACK_V3_ID&&board?.name==='FuelTrack+ v3'&&
  typeof board?.workspace_id==='string'&&
  String(board.description||'').startsWith(MARKER)&&board.status==='active';
}
export function normalizeFuelTrackSection(section){
 return FUELTRACK_TABS.some(x=>x.key===section)?section:'dashboard';
}
export function fuelTrackHref(section='dashboard'){
 return '#/boards/'+FUELTRACK_V3_ID+'/fueltrack/'+normalizeFuelTrackSection(section);
}
function numericValue(value){
 const raw=value&&typeof value==='object'&&!Array.isArray(value)?
  value.value??value.number??value.text??null:value;
 if(typeof raw==='number')return Number.isFinite(raw)&&raw>=0?raw:null;
 if(typeof raw!=='string'||!raw.trim()||!/^\d+(?:\.\d+)?$/.test(raw.trim()))return null;
 const n=Number(raw);
 return Number.isFinite(n)?n:null;
}
function extractDate(value){
 const raw=value&&typeof value==='object'&&!Array.isArray(value)?
  value.value??value.date??value.text:value;
 if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(raw))return null;
 const d=new Date(raw);
 return Number.isFinite(d.getTime())?d:null;
}
const DATE_FORMAT=new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric'});
function countStatus(status){
 const s=String(status||'').toLowerCase().replace(/[\s_-]+/g,' ').trim();
 if(['done','completed'].includes(s))return 'done';
 if(s==='approved')return 'approved';
 if(['pending','waiting','working','in progress','todo','planned'].includes(s))return 'pending';
 if(s==='rejected')return 'rejected';
 return 'other';
}
export function fuelTrackDashboardModel(detail){
 if(!isFuelTrackV3ApplicationBoard(detail?.board))return null;
 const boardId=detail.board.id;
 const items=Array.isArray(detail.items)?
  detail.items.filter(item=>item?.board_id===boardId&&!item.archived_at&&item.id):[];
 const liveIds=new Set(items.map(item=>item.id));
 const columns=Array.isArray(detail.columns)?detail.columns:[];
 const quantities=columns.filter(c=>c?.name==='Quantity Liters'&&
  c.system_key==null&&c.visible!==false&&c.data_type==='number');
 const dates=columns.filter(c=>c?.name==='Event Date'&&c.data_type==='date'&&
  c.system_key==null&&c.visible!==false);
 const quantityId=quantities.length===1?quantities[0].id:null;
 const dateId=dates.length===1?dates[0].id:null;
 const values=new Map();
 for(const v of (Array.isArray(detail.values)?detail.values:[])){
  if(!liveIds.has(v?.item_id))continue;
  if(v.column_id!==quantityId&&v.column_id!==dateId)continue;
  values.set(v.item_id+':'+v.column_id,v.value);
 }
 let volume=0,measured=0;
 const status={done:0,approved:0,pending:0,rejected:0,other:0};
 const recent=[];
 for(const item of items){
  status[countStatus(item.status)]++;
  if(quantityId&&values.has(item.id+':'+quantityId)){
   const amount=numericValue(values.get(item.id+':'+quantityId));
   if(amount!==null){volume+=amount;measured++;}
  }
  const date=dateId?extractDate(values.get(item.id+':'+dateId)):null;
  const created=extractDate(item.created_at);
  recent.push({
   id:item.id,title:String(item.title||'Untitled request'),status:String(item.status||'Unspecified'),
   category:countStatus(item.status),
   date:date?DATE_FORMAT.format(date):'—',
   timestamp:date?.getTime()??created?.getTime()??0
  });
 }
 recent.sort((a,b)=>b.timestamp-a.timestamp||a.id.localeCompare(b.id));
 return Object.freeze({
  count:items.length,status,
  volume:quantityId&&(items.length===0||measured===items.length)?volume:null,
  volumeMeasured:measured,
  dateAvailable:!!dateId,
  recent:recent.slice(0,30),
  source:'Current authorized FuelTrack+ v3 Board items only'
 });
}
function statCard(title,value,caption,tone,icon){
 return '<article class="ft3-metric ft3-tone-'+tone+'"><div class="ft3-metric-label">'+
  '<span>'+h(title)+'</span><span aria-hidden="true" class="ft3-metric-icon">'+icon+'</span></div>'+
  '<strong>'+h(value)+'</strong><p>'+h(caption)+'</p></article>';
}
function panel(title,description,content,extra=''){
 return '<section class="ft3-panel"><header class="ft3-panel-head"><div><h3>'+
  h(title)+'</h3><p>'+h(description)+'</p></div>'+extra+'</header>'+content+'</section>';
}
function statusPanel(model){
 const order=[['done','Done'],['approved','Approved'],['pending','Pending'],
  ['rejected','Rejected'],['other','Other']];
 const nonzero=order.filter(([k])=>model.status[k]>0);
 const scale=model.count||1;
 return panel('Status Overview','Statuses from authorized board records',
  '<div class="ft3-status-track" aria-label="Status distribution">'+
  (nonzero.length?nonzero.map(([k])=>'<span class="ft3-status-segment ft3-status-'+k+
   '" style="width:'+(100*model.status[k]/scale).toFixed(3)+'%" title="'+
   h(k)+': '+model.status[k]+'"></span>').join(''):'<span class="ft3-status-empty"></span>')+
  '</div><div class="ft3-status-list">'+order.map(([k,label])=>
  '<div class="ft3-status-row"><span class="ft3-dot ft3-dot-'+k+
   '"></span><span>'+label+'</span><strong>'+model.status[k]+
   '</strong><small>'+(model.count?Math.round(model.status[k]*100/model.count):0)+'%</small></div>').join('')+
  '</div>');
}
function recentPanel(model){
 return panel('Recent Transactions','Latest 30 records from this board — read-only',
  model.recent.length?
   '<div class="ft3-recent-scroll"><table class="ft3-recent-table"><thead><tr><th scope="col">Request</th>'+
   '<th scope="col">Status</th><th scope="col">Event date</th></tr></thead><tbody>'+
   model.recent.map(row=>'<tr><td><span class="ft3-request-title">'+escapeName(row.title)+
    '</span></td><td><span class="ft3-status-pill ft3-status-'+row.category+'">'+
    h(row.status)+'</span></td><td>'+h(row.date)+'</td></tr>').join('')+
   '</tbody></table></div>':
   '<div class="ft3-empty"><strong>No transactions on this board yet</strong>'+
   '<p>Authorized fuel requests will appear here after the backend is integrated and records exist.</p></div>',
  '<a class="ft3-text-link" href="'+fuelTrackHref('requests')+'">All requests</a>');
}
function dashboard(model){
 return '<div class="ft3-dashboard"><header class="ft3-dashboard-head"><div>'+
  '<span class="ft3-eyebrow">FUEL OPERATIONS / OVERVIEW</span>'+
  '<h2>Dashboard</h2><p>'+h(model.source)+'</p></div>'+
  '<div class="ft3-dashboard-actions"><a href="'+fuelTrackHref('requests')+
  '" class="ft3-soft-action">View requests</a><button type="button" class="ft3-soft-action" data-action="refresh-board">↻ Refresh</button></div></header>'+
  '<p class="ft3-info" role="note">Reference screenshots show another system with historical fuel data. '+
  'Only live authorized APSYNTRA CRM board records are counted here. Cost and vehicle rankings require separate verified domain data.</p>'+
  '<div class="ft3-metric-grid">'+
   statCard('Total spent','—','Financial ledger not connected','teal','₱')+
   statCard('Fuel volume',model.volume===null?'—':fmt.format(model.volume)+' L',
    model.volume===null?'Incomplete or unavailable quantity data':'Quantity Liters from board items','coral','◈')+
   statCard('Requests',fmt.format(model.count),'Current board records','blue','↗')+
   statCard('Avg / vehicle','—','Vehicle and cost data not connected','gold','▤')+
  '</div><div class="ft3-dashboard-grid">'+
   panel('Top Vehicles','Cost, volume and trips rankings',
    '<div class="ft3-empty"><strong>Vehicle rankings unavailable</strong>'+
    '<p>The current board has no verified vehicle-cost contract. No sample rankings are shown.</p></div>')+
   statusPanel(model)+'</div>'+recentPanel(model)+'</div>';
}
function placeholder(section){
 const labels={
  analytics:['Analytics','Trend and historical analyses need verified fuel records and domain aggregation.'],
  requests:['All Requests','Fuel request search, details and full history will be connected after the request domain contract is verified.'],
  'new-request':['New Fuel Request','Request submission is not enabled. No draft or record is created from this screen.'],
  approvals:['Approvals','Signed approval permissions and workflow decisions are not enabled in this frontend milestone.'],
  lightfuels:['LightFuels','LightFuels workflows require their authorized backend integration.'],
  activity:['Activity','The fuel-specific event timeline is not yet integrated.']
 };
 const [title,description]=labels[section]||labels.analytics;
 return '<section class="ft3-placeholder"><span class="ft3-eyebrow">NEXT FRONTEND MILESTONE</span>'+
  '<h2>'+h(title)+'</h2><p>'+h(description)+'</p>'+
  '<a href="'+fuelTrackHref('dashboard')+'" class="ft3-soft-action">Return to Dashboard</a></section>';
}
export function renderFuelTrackV3Application({detail,section='dashboard',actorName='Member'}={}){
 const model=fuelTrackDashboardModel(detail);
 if(!model)return '<section class="ft3-unavailable" role="alert">'+
  'FuelTrack+ v3 dashboard is unavailable for this board or session.</section>';
 const view=normalizeFuelTrackSection(section);
 const navigation=FUELTRACK_TABS.map(t=>'<a class="ft3-app-tab'+
  (view===t.key?' is-active':'')+'" href="'+fuelTrackHref(t.key)+'"'+
  (view===t.key?' aria-current="page"':'')+'><span aria-hidden="true">'+t.icon+'</span>'+
  h(t.label)+'</a>').join('');
 return '<section class="ft3-app" aria-label="FuelTrack+ v3 application">'+
  '<header class="ft3-app-header"><div class="ft3-app-brand">'+
  '<span class="ft3-app-logo" aria-hidden="true">◈</span>'+
  '<div><strong>FuelTrack+</strong><small>Fuel Control · APSYNTRA CRM</small></div></div>'+
  '<div class="ft3-app-identity"><span>'+h(actorName)+'</span>'+
  '<span class="ft3-app-mode">Signed board data · Read-only dashboard</span></div></header>'+
  '<nav class="ft3-app-tabs" aria-label="FuelTrack application sections">'+navigation+'</nav>'+
  '<div class="ft3-app-body">'+(view==='dashboard'?dashboard(model):placeholder(view))+
  '</div></section>';
}
