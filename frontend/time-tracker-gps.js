/** Restricted attendance GPS fixes; never read raw shared state. */
import {manilaDay} from './time-tracker-overview.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TT_GPS_VIEWS=Object.freeze(['map','geofence','trail','accuracy','trends']);
export function timeTrackerGpsWindow(now=new Date(),days=7){
 const today=manilaDay(now);
 return {from:new Date(Date.parse(today+'T00:00:00Z')-(days-1)*86400000).toISOString().slice(0,10),to:today};
}
export function validateTimeTrackerGps(payload,{userId,workspaceId,boardId}){
 if(!uuid.test(userId)||!uuid.test(workspaceId)||!uuid.test(boardId)||
  payload?.scope!=='AUTHORIZED_WORKSPACE_GPS'||payload.actorId!==userId||
  payload.workspaceId!==workspaceId||payload.boardId!==boardId||
  !Array.isArray(payload.events)||payload.events.length>500)
  throw Error('Signed GPS scope mismatch');
 const events=payload.events.map(p=>{
  if(!uuid.test(p.userId||'')||!['in','out'].includes(p.kind)||
   !Number.isFinite(Date.parse(p.timestamp))||
   !Number.isFinite(p.latitude)||Math.abs(p.latitude)>90||
   !Number.isFinite(p.longitude)||Math.abs(p.longitude)>180||
   !Number.isFinite(p.accuracyM)||p.accuracyM<0||p.accuracyM>100000||
   manilaDay(p.timestamp)<payload.from||manilaDay(p.timestamp)>payload.to)
    throw Error('Invalid signed GPS point');
  return Object.freeze({userId:p.userId,recordId:String(p.recordId||'').slice(0,150),
   name:String(p.name||'Member').slice(0,100),kind:p.kind,timestamp:p.timestamp,
   latitude:p.latitude,longitude:p.longitude,accuracyM:p.accuracyM,
   department:String(p.department||'').slice(0,80),
   location:String(p.location||'').slice(0,100),
   source:p.source==='Browser GPS'?'Browser GPS':'Reported GPS'});
 });
 return Object.freeze({events:Object.freeze(events),from:payload.from,to:payload.to,
  truncated:payload.truncated===true,actorId:userId,workspaceId,boardId});
}
export function gpsDistance(a,b){
 const r=Math.PI/180,dlat=(a.latitude-b.latitude)*r,dlon=(a.longitude-b.longitude)*r;
 const h=Math.sin(dlat/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dlon/2)**2;
 return Math.round(12742000*Math.asin(Math.min(1,Math.sqrt(h))));
}
export function summarizeGps(data,options={}){
 const points=data?.events||[],latest=new Map(),byDay=new Map();
 for(const p of [...points].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp))){
  if(p.kind==='in'&&!latest.has(p.userId))latest.set(p.userId,p);
  const day=manilaDay(p.timestamp),rows=byDay.get(day)||[];rows.push(p);byDay.set(day,rows);
 }
 const selected=points.filter(p=>options.userId&&p.userId===options.userId)
  .sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
 const reference=points.find(p=>p.recordId+':'+p.kind===options.referenceId)||null;
 const radius=Math.max(100,Math.min(50000,Number(options.radius)||10000));
 const distances=reference?[...latest.values()].map(p=>({point:p,metres:gpsDistance(reference,p)})):[];
 const average=points.length?Math.round(points.reduce((n,p)=>n+p.accuracyM,0)/points.length):null;
 const trend=[...byDay].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,rows])=>({
  day,count:rows.length,accuracy:Math.round(rows.reduce((n,p)=>n+p.accuracyM,0)/rows.length)
 }));
 return {points,latest:[...latest.values()],selected,reference,radius,distances,average,trend,
  poor:points.filter(p=>p.accuracyM>200).length};
}
const human=p=>new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'
}).format(new Date(p.timestamp));
const metric=(name,value)=>'<div class="tt-gps-kpi"><span>'+esc(name)+'</span><strong>'+esc(value)+'</strong></div>';
const list=points=>{
 if(!points.length)return '<p class="tt-gps-empty-list">No signed attendance locations match these filters.</p>';
 return '<ul class="tt-gps-records">'+points.map(p=>
  '<li><span class="tt-gps-record-pin" aria-hidden="true">'+(p.kind==='in'?'●':'○')+'</span>'+
  '<div class="tt-gps-record-person"><strong>'+esc(p.name)+'</strong>'+
  '<small>'+esc(p.department)+' · '+esc(p.location)+'</small></div>'+
  '<div class="tt-gps-record-fix"><span>'+esc(p.kind==='in'?'Clock in':'Clock out')+
  ' · '+esc(human(p))+'</span><small>'+
  p.latitude.toFixed(6)+', '+p.longitude.toFixed(6)+
  ' · ±'+Math.round(p.accuracyM)+' m</small></div>'+
  '<a class="tt-gps-record-link" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" '+
  'title="Opens OpenStreetMap and shares only this selected point with that service" '+
  'href="https://www.openstreetmap.org/?mlat='+p.latitude+'&mlon='+p.longitude+
  '#map=17/'+p.latitude+'/'+p.longitude+'">Open map ↗</a></li>'
 ).join('')+'</ul>';
};

/** Zoomable, north-up plot of authorized event coordinates, without an external map service. */
export function plotGps(points,{zoom=1,theme='map'}={}){
 if(!points.length)return '<div class="tt-gps-map-empty"><strong>No recorded fixes yet</strong>'+
  '<span>Choose a date range and load authorized clock-in or clock-out evidence.</span></div>';
 const validZoom=Number.isFinite(Number(zoom))?Math.max(1,Math.min(4,Number(zoom))):1;
 const dark=theme==='dark';
 const xs=points.map(p=>p.longitude),ys=points.map(p=>p.latitude);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const dx=Math.max(.002,(maxX-minX)*1.3),dy=Math.max(.002,(maxY-minY)*1.3);
 const position=p=>({
  x:Math.max(42,Math.min(758,400+680*(p.longitude-(minX+maxX)/2)/dx)),
  y:Math.max(45,Math.min(335,186-300*(p.latitude-(minY+maxY)/2)/dy))
 });
 const dots=points.map(p=>{
  const xy=position(p),label=p.name+' · '+human(p)+' · '+p.kind;
  return '<g><circle cx="'+xy.x.toFixed(2)+'" cy="'+xy.y.toFixed(2)+
   '" r="'+(p.kind==='in'?11:9)+'" fill="'+(p.kind==='in'?'#f15c2a':'#2879be')+
   '" stroke="#ffffff" stroke-width="3"/><circle cx="'+xy.x.toFixed(2)+
   '" cy="'+xy.y.toFixed(2)+'" r="2.8" fill="#fff"/>'+
   '<title>'+esc(label)+'</title></g>';
 }).join('');
 const background=dark?'#25313a':'#eaf0e7';
 const grid=dark?'#48575e':'#c9d8d0';
 const contour=dark?'#455f65':'#c4d9d0';
 const roads=dark?'#75838a':'#fff';
 return '<svg class="tt-gps-map-svg" viewBox="0 0 800 390" preserveAspectRatio="xMidYMid meet" '+
  'role="img" aria-label="Recorded GPS coordinate plot, north-up, not satellite imagery">'+
  '<defs><clipPath id="tt-gps-plot-clip"><rect width="800" height="390"/></clipPath></defs>'+
  '<g clip-path="url(#tt-gps-plot-clip)"><rect width="800" height="390" fill="'+background+'"/>'+
  '<g transform="translate(400 195) scale('+validZoom+') translate(-400 -195)">'+
  '<path d="M-20 120 Q180 -40 420 80 T850 60 M-40 275 Q180 100 440 250 T850 190 M-20 350 Q200 205 370 360 T830 305" fill="none" stroke="'+contour+'" stroke-width="54" opacity=".5"/>'+
  '<path d="M-30 145 L180 174 L365 85 L535 205 L845 130 M35 400 L255 285 L460 320 L650 160 L805 -20" fill="none" stroke="'+roads+'" stroke-width="9" opacity=".68"/>'+
  '<path d="M-30 145 L180 174 L365 85 L535 205 L845 130 M35 400 L255 285 L460 320 L650 160 L805 -20" fill="none" stroke="'+grid+'" stroke-width="1.5"/>'+
  '<path d="M0 98H800 M0 196H800 M0 294H800 M160 0V390 M320 0V390 M480 0V390 M640 0V390" fill="none" stroke="'+grid+'" stroke-width="1" stroke-dasharray="4 7"/>'+
  dots+'</g></g></svg>';
}
const mapView=(points,s,data,filters,loading)=>{
 const zoom=Number.isFinite(Number(filters.zoom))?
  Math.max(1,Math.min(4,Number(filters.zoom))):1;
 const theme=filters.theme==='dark'?'dark':'map';
 const records=data?.events||[];
 const inCount=records.filter(p=>p.kind==='in').length;
 const outCount=records.filter(p=>p.kind==='out').length;
 return '<div class="tt-gps-map-shell tt-gps-theme-'+theme+'">'+
  '<div class="tt-gps-map-canvas">'+plotGps(points,{zoom,theme})+'</div>'+
  '<div class="tt-gps-map-stats" aria-label="Recorded attendance GPS statistics">'+
  metric('RECORDED',records.length)+metric('CLOCK IN',inCount)+metric('CLOCK OUT',outCount)+
  '<button type="button" class="tt-gps-refresh" data-action="tt-gps-load" '+
  (loading?'disabled ':'')+'title="Refresh signed attendance fixes" aria-label="Refresh signed GPS evidence">↻</button></div>'+
  '<div class="tt-gps-map-modes" role="group" aria-label="Map appearance">'+
  '<button type="button" data-action="tt-gps-theme" data-theme="map" aria-pressed="'+(theme==='map')+
  '" class="'+(theme==='map'?'is-active':'')+'">▧ <span>Map</span></button>'+
  '<button type="button" data-action="tt-gps-theme" data-theme="dark" aria-pressed="'+(theme==='dark')+
  '" class="'+(theme==='dark'?'is-active':'')+'">◐ <span>Dark</span></button>'+
  '<button type="button" disabled aria-disabled="true" '+
  'title="Satellite imagery requires an approved provider; no employee locations are sent to external tiles">◎ <span>Satellite</span></button></div>'+
  '<div class="tt-gps-map-zoom" role="group" aria-label="Coordinate plot zoom">'+
  '<button type="button" data-action="tt-gps-zoom" data-direction="in" aria-label="Zoom in"'+
  (zoom>=4?' disabled':'')+'>+</button>'+
  '<button type="button" data-action="tt-gps-zoom" data-direction="out" aria-label="Zoom out"'+
  (zoom<=1?' disabled':'')+'>−</button></div>'+
  '<div class="tt-gps-map-footer"><span>⌖ &nbsp; Relative coordinate plot · North ↑</span>'+
  '<span>'+esc(zoom.toFixed(1))+'×</span></div></div>';
};
const panel=(title,subtitle,body)=>'<div class="tt-gps-panel"><div class="tt-gps-panel-head"><div>'+
 '<h4>'+esc(title)+'</h4><p>'+esc(subtitle)+'</p></div></div>'+body+'</div>';
const bars=items=>'<div class="tt-gps-bars">'+items.map(([label,count,max,suffix=''])=>
 '<div class="tt-gps-bar"><span>'+esc(label)+'</span><progress max="'+
 Math.max(1,max)+'" value="'+Math.max(0,count)+'"></progress><strong>'+
 esc(suffix||count)+'</strong></div>').join('')+'</div>';
export function renderTimeTrackerGps({
 data=null,eligible=false,view='map',filters={},loading=false,error='',now=new Date()
}={}){
 if(!eligible)return '<section class="tt-gps"><p class="tt-gps-restricted">Privileged GPS authorization required.</p></section>';
 const tab=TT_GPS_VIEWS.includes(view)?view:'map',s=summarizeGps(data,filters);
 const days=timeTrackerGpsWindow(now),users=[...new Map(s.points.map(p=>[p.userId,p.name])).entries()];
 const dataStatus=loading?'Checking signed records…':
  data?'Signed attendance evidence loaded':'Awaiting signed attendance evidence';
 const controls='<div class="tt-gps-controls" aria-label="GPS attendance filters">'+
  '<label for="tt-gps-from">From<input id="tt-gps-from" type="date" value="'+
  esc(filters.from||days.from)+'"></label>'+
  '<label for="tt-gps-to">To<input id="tt-gps-to" type="date" value="'+
  esc(filters.to||days.to)+'"></label>'+
  '<label for="tt-gps-user">Employee<select id="tt-gps-user">'+
  '<option value="">All authorized members</option>'+
  users.map(([id,name])=>'<option value="'+esc(id)+'"'+
  (filters.userId===id?' selected':'')+'>'+esc(name)+'</option>').join('')+
  '</select></label><button type="button" class="tt-gps-load" data-action="tt-gps-load"'+
  (loading?' disabled':'')+'>↻ &nbsp; Load signed evidence</button></div>';
 const legend='<div class="tt-gps-legend"><span><i class="tt-gps-legend-in"></i>Clock in</span>'+
  '<span><i class="tt-gps-legend-out"></i>Clock out</span>'+
  '<span>Positions shown only at recorded attendance events</span></div>';
 let content='';
 if(tab==='map')content=mapView(s.latest,s,data,filters,loading)+legend+
  panel('Recorded attendance locations',
   'Latest signed clock-in point per member, within the selected date range.',list(s.latest));
 if(tab==='geofence'){
  content='<p class="tt-gps-note">Ad-hoc distance comparison only. No enforced geofence is configured.</p>'+
   '<div class="tt-gps-compare-controls"><label for="tt-gps-reference">Reference location<select id="tt-gps-reference">'+
   '<option value="">Choose a recorded fix</option>'+
   s.latest.map(p=>'<option value="'+esc(p.recordId+':'+p.kind)+'"'+
   (filters.referenceId===p.recordId+':'+p.kind?' selected':'')+'>'+esc(p.name)+'</option>').join('')+
   '</select></label><label for="tt-gps-radius">Radius (metres)<input id="tt-gps-radius" type="number" min="100" max="50000" value="'+
   s.radius+'"></label><button type="button" data-action="tt-gps-compare">Compare distances</button></div>'+
   '<div class="tt-gps-kpis">'+metric('INSIDE RADIUS',s.reference?s.distances.filter(x=>x.metres<=s.radius).length:'—')+
   metric('OUTSIDE RADIUS',s.reference?s.distances.filter(x=>x.metres>s.radius).length:'—')+'</div>'+
   mapView(s.latest,s,data,filters,loading)+legend+
   panel('Distance comparison','Approximate distance between recorded clock-in positions.',list(s.distances.map(x=>x.point)));
 }
 if(tab==='trail')content='<p class="tt-gps-note">The trail contains only clock-in/out fixes, not continuous movement.</p>'+
  mapView(s.selected,s,data,filters,loading)+legend+
  panel('Attendance event trail','Select a member above to show their recorded event sequence.',
   filters.userId?list(s.selected):'<p class="tt-gps-empty-list">Select an employee to view attendance fixes.</p>');
 if(tab==='accuracy'){
  const bins=[['≤20m',0,20],['20–100m',20,100],['100–500m',100,500],['>500m',500,100001]];
  content='<div class="tt-gps-kpis">'+metric('AVERAGE UNCERTAINTY',s.average===null?'—':'±'+s.average+'m')+
   metric('POOR (>200m)',s.poor)+metric('RECORDED FIXES',s.points.length)+'</div>'+
   panel('GPS accuracy distribution','Measured browser-reported uncertainty at attendance time.',
    bars(bins.map(([label,lo,hi])=>[label,s.points.filter(p=>p.accuracyM>lo&&p.accuracyM<=hi).length,s.points.length])))+
   panel('Fix details','All authorized recorded coordinates for this range.',list(s.points));
 }
 if(tab==='trends')content='<div class="tt-gps-kpis">'+metric('RECORDED EVENTS',s.points.length)+
  metric('DAYS',s.trend.length)+metric('AVERAGE UNCERTAINTY',s.average===null?'—':'±'+s.average+'m')+'</div>'+
  panel('Daily GPS evidence','Average reported location uncertainty by attendance date.',
   bars(s.trend.map(p=>[p.day,p.accuracy,Math.max(1,...s.trend.map(x=>x.accuracy)),'±'+p.accuracy+'m'])))+
  panel('Signed recorded fixes','All authorized clock-in/out events in the selected window.',list(s.points));
 return '<section class="tt-gps" aria-label="Restricted GPS and Location Hub">'+
  '<header class="tt-gps-heading"><div><h3>GPS &amp; Location Hub</h3>'+
  '<p>'+esc(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',
   weekday:'long',month:'long',day:'numeric'}).format(new Date(now)))+'</p></div>'+
  '<div class="tt-gps-status" role="status"><span class="tt-gps-status-dot" aria-hidden="true"></span>'+
  '<span>'+esc(dataStatus)+'</span></div></header>'+
  '<div class="tt-gps-tabs" role="tablist" aria-label="GPS detail views">'+
  [['map','⌖','Live Map'],['geofence','⬡','Geofence'],['trail','⇢','Trail'],
   ['accuracy','⌁','Accuracy'],['trends','↗','Trends']].map(([key,glyph,title])=>
   '<button type="button" role="tab" data-action="tt-gps-view" data-view="'+key+
   '" aria-selected="'+(tab===key)+'" class="tt-gps-tab'+(tab===key?' is-current':'')+'">'+
   '<span aria-hidden="true">'+glyph+'</span>'+title+'</button>').join('')+'</div>'+
  (error?'<p class="tt-gps-error" role="alert">'+esc(error)+'</p>':'')+
  controls+(loading?'<p class="tt-gps-loading" role="status">Checking signed GPS records…</p>':'')+
  content+
  '<p class="tt-gps-note tt-gps-privacy">Only bootstrap administrators and assigned TimeTracker Supervisors may read signed GPS evidence. '+
  'This north-up coordinate plot is not satellite imagery or continuous live tracking. External map links share the selected point only after you open them.</p>'+
  '</section>';
}
