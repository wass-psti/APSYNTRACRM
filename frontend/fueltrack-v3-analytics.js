/** CP-FT3-02 — FuelTrack+ v3 analytics presentation over signed Board items.
 * No vehicle, price, requester or odometer data may be inferred from titles,
 * pump references or reference screenshots. Read-only domain boundary.
 */
import {FUELTRACK_V3_ID,isFuelTrackV3ApplicationBoard,fuelTrackHref} from './fueltrack-v3-application.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numberFormat=new Intl.NumberFormat('en-PH',{maximumFractionDigits:2});
const validRanges=['all','six-months','month','week'];
export const FUELTRACK_ANALYTICS_VIEWS=Object.freeze([
 {key:'fuel-price',label:'Fuel Price',icon:'⌁'},
 {key:'efficiency',label:'Efficiency',icon:'◉'},
 {key:'frequency',label:'Frequency',icon:'◷'},
 {key:'requestors',label:'Requestors',icon:'♧'},
 {key:'odometer',label:'Odometer',icon:'◴'}
]);
export function normalizeFuelTrackAnalyticsView(value){
 return FUELTRACK_ANALYTICS_VIEWS.some(v=>v.key===value)?value:'fuel-price';
}
export function normalizeFuelTrackAnalyticsRange(value){
 return validRanges.includes(value)?value:'all';
}
export function normalizeFuelTrackAnalyticsMetric(value){
 return ['spend','volume','both'].includes(value)?value:'both';
}
export function fuelTrackAnalyticsHref(view='fuel-price',range='all',metric='both'){
 return fuelTrackHref('analytics')+'/'+normalizeFuelTrackAnalyticsView(view)+'/'+
  normalizeFuelTrackAnalyticsRange(range)+'/'+normalizeFuelTrackAnalyticsMetric(metric);
}
function parseDate(value){
 const raw=value&&typeof value==='object'&&!Array.isArray(value)?
  value.value??value.date??value.text:value;
 if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw))return null;
 const [y,m,d]=raw.split('-').map(Number);
 const parsed=new Date(Date.UTC(y,m-1,d));
 return parsed.getUTCFullYear()===y&&parsed.getUTCMonth()===m-1&&parsed.getUTCDate()===d?parsed:null;
}
function quantity(value){
 const raw=value&&typeof value==='object'&&!Array.isArray(value)?
  value.value??value.number??value.text:value;
 if(typeof raw==='number')return Number.isFinite(raw)&&raw>=0?raw:null;
 if(typeof raw!=='string'||!/^\d+(?:\.\d+)?$/.test(raw.trim()))return null;
 const n=Number(raw);
 return Number.isFinite(n)&&n>=0?n:null;
}
function startOfRange(range,now){
 const date=new Date(now);
 if(Number.isNaN(date.getTime()))return null;
 const y=date.getUTCFullYear(),m=date.getUTCMonth(),d=date.getUTCDate();
 if(range==='month')return Date.UTC(y,m,1);
 if(range==='week')return Date.UTC(y,m,d-(date.getUTCDay()+6)%7);
 if(range==='six-months')return Date.UTC(y,m-5,1);
 return null;
}
function completeColumn(detail,name,type){
 const matches=(Array.isArray(detail.columns)?detail.columns:[]).filter(c=>
  c?.name===name&&c.data_type===type&&c.system_key==null&&c.visible!==false);
 return matches.length===1?matches[0].id:null;
}
export function fuelTrackAnalyticsModel(detail,{range='all',now=new Date()}={}){
 if(!isFuelTrackV3ApplicationBoard(detail?.board))return null;
 const bounded=normalizeFuelTrackAnalyticsRange(range);
 const dateId=completeColumn(detail,'Event Date','date');
 const volumeId=completeColumn(detail,'Quantity Liters','number');
 const items=(Array.isArray(detail.items)?detail.items:[]).filter(i=>
  i?.id&&i.board_id===FUELTRACK_V3_ID&&!i.archived_at);
 const itemIds=new Set(items.map(i=>i.id));
 const values=new Map();
 for(const v of (Array.isArray(detail.values)?detail.values:[])){
  if(!itemIds.has(v?.item_id)||![dateId,volumeId].includes(v.column_id))continue;
  values.set(v.item_id+':'+v.column_id,v.value);
 }
 const start=startOfRange(bounded,now);
 const rows=[],trend=new Map();
 let excludedUndated=0,completeVolume=true,totalVolume=0,completed=0;
 for(const item of items){
  const eventDate=dateId?parseDate(values.get(item.id+':'+dateId)):null;
  if(bounded!=='all'&&(!eventDate||eventDate.getTime()<start)){
   if(!eventDate)excludedUndated++;
   continue;
  }
  const amount=volumeId?quantity(values.get(item.id+':'+volumeId)):null;
  if(amount===null)completeVolume=false;
  else totalVolume+=amount;
  if(['done','completed'].includes(String(item.status||'').trim().toLowerCase()))completed++;
  const month=eventDate?eventDate.toISOString().slice(0,7):null;
  if(month&&amount!==null){
   const aggregate=trend.get(month)||{month,volume:0,count:0};
   aggregate.volume+=amount;aggregate.count++;
   trend.set(month,aggregate);
  }
  rows.push({id:item.id,month,volume:amount});
 }
 // Partial totals cannot be labeled as full fuel volume or a complete trend.
 const verified=!!volumeId&&(rows.length===0||completeVolume);
 return Object.freeze({
  range:bounded,requestCount:rows.length,completed,
  undatedExcluded:excludedUndated,
  totalVolume:verified?totalVolume:null,
  volumeAvailable:verified,
  dateAvailable:!!dateId,
  trend:verified&&dateId?[...trend.values()].sort((a,b)=>a.month.localeCompare(b.month)):[],
  unavailable:{
   cost:'No verified fuel expenditure or unit-price field is available.',
   vehicles:'Vehicle identities and trip associations are not available in the authorized board contract.',
   requestors:'Requester identities and ranking permissions are not available in the authorized board contract.',
   odometer:'Verified odometer readings and vehicle mileage are not available.',
   efficiency:'Vehicle identity, distance and benchmark data are not available.'
  }
 });
}
function tile(label,value,caption,tone){
 return '<article class="ft3-analytics-stat ft3-analytics-'+tone+'"><span>'+esc(label)+
  '</span><strong>'+esc(value)+'</strong><small>'+esc(caption)+'</small></article>';
}
function emptyState(title,detail){
 return '<div class="ft3-analytics-void"><strong>'+esc(title)+'</strong><p>'+esc(detail)+'</p></div>';
}
function analyticsPanel(title,subtitle,body){
 return '<section class="ft3-panel ft3-analytics-panel"><header class="ft3-panel-head"><div><h3>'+
  esc(title)+'</h3><p>'+esc(subtitle)+'</p></div></header>'+body+'</section>';
}
function consumptionChart(model,metric){
 if(!model.dateAvailable)return emptyState('Event dates unavailable','This chart requires the authorized Event Date column.');
 if(!model.volumeAvailable)return emptyState('Incomplete fuel quantities','A complete set of valid Quantity Liters values is required before showing a trend.');
 if(metric==='spend')return emptyState('Spending trend unavailable',model.unavailable.cost);
 if(!model.trend.length)return emptyState('No dated fuel consumption yet','Dated fuel events will appear when authorized records are available.');
 const max=Math.max(1,...model.trend.map(x=>x.volume));
 const width=780,height=214,left=38,right=20,top=18,bottom=40;
 const plotW=width-left-right,plotH=height-top-bottom;
 const gap=model.trend.length>1?plotW/(model.trend.length-1):0;
 const pts=model.trend.map((row,i)=>({
  x:left+(model.trend.length===1?plotW/2:i*gap),
  y:top+plotH*(1-row.volume/max),
  label:row.month,amount:row.volume
 }));
 const path=pts.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' ');
 const grid=[0,.25,.5,.75,1].map(f=>{
  const y=top+plotH*f;
  return '<line class="ft3-analytics-gridline" x1="'+left+'" y1="'+y+
   '" x2="'+(width-right)+'" y2="'+y+'"/>'+
   '<text class="ft3-analytics-axis" x="0" y="'+(y+3)+'">'+
   esc(numberFormat.format(max*(1-f)))+' L</text>';
 }).join('');
 const dots=pts.map(p=>'<circle class="ft3-analytics-dot" cx="'+p.x.toFixed(2)+
  '" cy="'+p.y.toFixed(2)+'" r="4"><title>'+esc(p.label)+
  ' · '+esc(numberFormat.format(p.amount))+' L</title></circle>').join('');
 const labels=pts.map(p=>'<text class="ft3-analytics-axis" text-anchor="middle" x="'+
  p.x.toFixed(2)+'" y="'+(height-12)+'">'+esc(p.label)+'</text>').join('');
 return '<div class="ft3-analytics-chart-wrap"><svg class="ft3-analytics-chart" '+
  'viewBox="0 0 780 214" role="img" aria-label="Monthly fuel volume trend in liters">'+
  grid+(pts.length>1?'<path class="ft3-analytics-trend-path" d="'+path+'"/>':'')+
  dots+labels+'</svg><p class="ft3-analytics-chart-note">'+
  (metric==='both'?'Fuel volume shown; spending data is not connected.':'Verified Quantity Liters by event month.')+
  '</p></div>';
}
function analyticsOverview(model,metric){
 return '<div class="ft3-analytics-overview">'+
  '<div class="ft3-metric-grid ft3-analytics-summary">'+
  tile('Total spent','—','Expenditure unavailable','teal')+
  tile('Fuel volume',model.totalVolume===null?'—':numberFormat.format(model.totalVolume)+' L',
   model.totalVolume===null?'Complete quantities required':'Verified board quantities','coral')+
  tile('Completed requests',numberFormat.format(model.completed),'Based on signed board status','blue')+
  tile('Avg / vehicle','—','Vehicle mapping unavailable','gold')+'</div>'+
  analyticsPanel('Consumption Trend','Event-month aggregation · '+model.requestCount+' scoped requests',
   consumptionChart(model,metric))+
  '<div class="ft3-analytics-grid">'+
   analyticsPanel('Top Vehicles','Vehicle rankings by cost, volume or trips',
    emptyState('No verified vehicle rankings',model.unavailable.vehicles))+
   analyticsPanel('Anomalies','High-usage and mileage exception signals',
    emptyState('Anomaly detection not connected',
     'Verified vehicle-level baseline and transaction history are required.'))+
  '</div></div>';
}
function analysisDetail(model,view){
 const entries={
  'fuel-price':['Fuel Price','Historical price per liter',model.unavailable.cost],
  efficiency:['Efficiency vs Benchmarks','Vehicle fuel economy and efficiency targets',model.unavailable.efficiency],
  frequency:['Request Frequency','Request frequency by vehicle and requester',model.unavailable.vehicles],
  requestors:['Requestor Leaderboard','Requester activity ranked by trip count',model.unavailable.requestors],
  odometer:['Odometer Monitoring','Mileage, fuel efficiency and chronological readings',model.unavailable.odometer]
 };
 const [title,desc,reason]=entries[view];
 return analyticsPanel(title,desc,
  emptyState('Awaiting verified '+title.toLowerCase()+' data',reason)+
  '<p class="ft3-analytics-footnote">No reference screenshot records, fabricated vehicles, requester identities or mileage have been imported.</p>');
}
export function renderFuelTrackAnalytics({detail,view='fuel-price',range='all',metric='both'}={}){
 const model=fuelTrackAnalyticsModel(detail,{range});
 if(!model)return '<section class="ft3-unavailable" role="alert">FuelTrack analytics is unavailable for this board or session.</section>';
 const selected=normalizeFuelTrackAnalyticsView(view);
 const chosenMetric=normalizeFuelTrackAnalyticsMetric(metric);
 const filters=[['all','All Data'],['six-months','6 Months'],['month','This Month'],['week','This Week']]
  .map(([key,label])=>'<a class="ft3-analytics-chip'+(model.range===key?' is-active':'')+
   '" href="'+fuelTrackAnalyticsHref(selected,key,chosenMetric)+'"'+
   (model.range===key?' aria-current="true"':'')+'>'+label+'</a>').join('');
 const metrics=[['spend','Spend'],['volume','Volume'],['both','Both']]
  .map(([key,label])=>'<a class="ft3-analytics-chip'+(chosenMetric===key?' is-active':'')+
   '" href="'+fuelTrackAnalyticsHref(selected,model.range,key)+'"'+
   (chosenMetric===key?' aria-current="true"':'')+'>'+label+'</a>').join('');
 const views=FUELTRACK_ANALYTICS_VIEWS.map(v=>
  '<a class="ft3-analytics-section-tab'+(selected===v.key?' is-active':'')+
  '" href="'+fuelTrackAnalyticsHref(v.key,model.range,chosenMetric)+'"'+
  (selected===v.key?' aria-current="page"':'')+'><span aria-hidden="true">'+v.icon+'</span>'+
  esc(v.label)+'</a>').join('');
 return '<div class="ft3-analytics" aria-label="FuelTrack analytics">'+
  '<header class="ft3-dashboard-head"><div><span class="ft3-eyebrow">FUEL CONTROL / ANALYTICS</span>'+
  '<h2>Analytics</h2><p>'+numberFormat.format(model.requestCount)+
  ' authorized board requests in selected period</p></div>'+
  '<div class="ft3-dashboard-actions"><button type="button" class="ft3-soft-action" data-action="refresh-board">↻ Refresh</button></div></header>'+
  '<div class="ft3-analytics-range" aria-label="Date filters">'+filters+'</div>'+
  (model.undatedExcluded?'<p class="ft3-analytics-footnote">'+model.undatedExcluded+
   ' requests without a valid Event Date were excluded from the selected period.</p>':'')+
  '<p class="ft3-info" role="note">Reference screenshots are used for interface design only. Financial, vehicle, requester and odometer values require their authorized FuelTrack domain records.</p>'+
  '<div class="ft3-analytics-metric-filter" aria-label="Trend metric">'+metrics+'</div>'+
  analyticsOverview(model,chosenMetric)+
  '<nav class="ft3-analytics-section-nav" aria-label="Analytics categories">'+views+'</nav>'+
  '<section class="ft3-analytics-detail">'+analysisDetail(model,selected)+'</section>'+
  '</div>';
}
