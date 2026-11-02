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
const metric=(name,value)=>'<div><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong></div>';
const human=p=>new Intl.DateTimeFormat('en-PH',{
 timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'
}).format(new Date(p.timestamp));
const list=points=>'<ul class="tt-gps-records">'+points.map(p=>'<li><div><strong>'+esc(p.name)+
 '</strong><small>'+esc(p.department)+' · '+esc(p.location)+'</small></div><div><span>'+
 esc(p.kind==='in'?'Clock in':'Clock out')+' · '+esc(human(p))+'</span><small>'+
 p.latitude.toFixed(6)+', '+p.longitude.toFixed(6)+' · ±'+Math.round(p.accuracyM)+
 ' m</small></div><a target="_blank" rel="noopener noreferrer" href="https://www.openstreetmap.org/?mlat='+
 p.latitude+'&mlon='+p.longitude+'#map=17/'+p.latitude+'/'+p.longitude+'">Map</a></li>').join('')+'</ul>';
export function plotGps(points){
 if(!points.length)return '<div class="tt-gps-map-empty">No authorized GPS fixes in this period.</div>';
 const xs=points.map(p=>p.longitude),ys=points.map(p=>p.latitude);
 const a=Math.min(...xs),b=Math.max(...xs),c=Math.min(...ys),d=Math.max(...ys);
 const dx=Math.max(.002,(b-a)*1.3),dy=Math.max(.002,(d-c)*1.3);
 const dots=points.map(p=>'<circle cx="'+(400+680*(p.longitude-(a+b)/2)/dx).toFixed(2)+
 '" cy="'+(186-300*(p.latitude-(c+d)/2)/dy).toFixed(2)+'" r="'+
 (p.kind==='in'?7:5)+'" fill="'+(p.kind==='in'?'#e96235':'#387eaa')+
 '" stroke="#fff" stroke-width="2"><title>'+esc(p.name+' · '+human(p))+'</title></circle>').join('');
 return '<div class="tt-gps-map-frame"><svg viewBox="0 0 800 390" role="img" '+
 'aria-label="Recorded GPS coordinates plotted north-up, without satellite basemap">'+
 '<rect width="800" height="390" fill="#e7f0ee"/>'+
 '<path d="M0 100H800 M0 200H800 M0 300H800 M200 0V390 M400 0V390 M600 0V390" stroke="#c9d8d9"/>'+
 dots+'<text x="20" y="375" fill="#596573" font-size="13">Attendance coordinate plot · North ↑ · not satellite imagery</text></svg></div>';
}
export function renderTimeTrackerGps({data=null,eligible=false,view='map',filters={},loading=false,error='',now=new Date()}={}){
 if(!eligible)return '<section class="tt-gps">Privileged GPS authorization required.</section>';
 const tab=TT_GPS_VIEWS.includes(view)?view:'map',s=summarizeGps(data,filters);
 const days=timeTrackerGpsWindow(now),users=[...new Map(s.points.map(p=>[p.userId,p.name])).entries()];
 const controls='<div class="tt-gps-controls"><label>From<input id="tt-gps-from" type="date" value="'+
 esc(filters.from||days.from)+'"></label><label>To<input id="tt-gps-to" type="date" value="'+
 esc(filters.to||days.to)+'"></label><label>Employee<select id="tt-gps-user"><option value="">All authorized members</option>'+
 users.map(([id,name])=>'<option value="'+id+'"'+(filters.userId===id?' selected':'')+'>'+esc(name)+'</option>').join('')+
 '</select></label><button type="button" data-action="tt-gps-load"'+(loading?' disabled':'')+'>Load signed evidence</button></div>';
 let content=controls;
 if(tab==='map')content+='<div class="tt-gps-kpis">'+metric('RECORDED FIXES',s.points.length)+
 metric('CLOCK-IN LOCATIONS',s.latest.length)+metric('TRUNCATED',data?.truncated?'YES':'NO')+'</div>'+
 plotGps(s.latest)+list(s.latest);
 if(tab==='geofence')content+='<p class="tt-gps-note">Ad-hoc comparison only — there is no approved enforcement geofence.</p>'+
 '<div class="tt-gps-controls"><label>Reference<select id="tt-gps-reference"><option value="">Choose a recorded fix</option>'+
 s.latest.map(p=>'<option value="'+esc(p.recordId+':'+p.kind)+'"'+
 (filters.referenceId===p.recordId+':'+p.kind?' selected':'')+'>'+esc(p.name)+'</option>').join('')+
 '</select></label><label>Radius, metres<input id="tt-gps-radius" type="number" min="100" max="50000" value="'+s.radius+'"></label>'+
 '<button type="button" data-action="tt-gps-compare">Compare</button></div>'+
 '<div class="tt-gps-kpis">'+metric('INSIDE',s.reference?s.distances.filter(x=>x.metres<=s.radius).length:'—')+
 metric('OUTSIDE',s.reference?s.distances.filter(x=>x.metres>s.radius).length:'—')+'</div>'+
 plotGps(s.latest)+list(s.distances.map(x=>x.point));
 if(tab==='trail')content+='<p class="tt-gps-note">Only recorded clock-in/out fixes are shown. A continuous movement route is not available.</p>'+
 (filters.userId?plotGps(s.selected)+list(s.selected):'<div class="tt-gps-map-empty">Select an employee to view recorded attendance fixes.</div>');
 if(tab==='accuracy')content+='<div class="tt-gps-kpis">'+
 metric('AVERAGE UNCERTAINTY',s.average===null?'—':'±'+s.average+'m')+
 metric('POOR (>200m)',s.poor)+metric('FIXES',s.points.length)+'</div>'+
 '<div class="tt-gps-bars">'+[['≤20m',0,20],['20–100m',20,100],['100–500m',100,500],['>500m',500,100001]].map(([label,lo,hi])=>{
 const count=s.points.filter(p=>p.accuracyM>lo&&p.accuracyM<=hi).length;
 return '<div><span>'+label+'</span><progress max="'+Math.max(1,s.points.length)+'" value="'+count+'"></progress><b>'+count+'</b></div>';
 }).join('')+'</div>';
 if(tab==='trends')content+='<div class="tt-gps-kpis">'+metric('EVENTS',s.points.length)+
 metric('DAYS',s.trend.length)+metric('AVG UNCERTAINTY',s.average===null?'—':'±'+s.average+'m')+'</div>'+
 '<div class="tt-gps-bars">'+s.trend.map(p=>'<div><span>'+p.day+'</span>'+
 '<progress max="'+Math.max(1,...s.trend.map(x=>x.accuracy))+'" value="'+p.accuracy+'"></progress>'+
 '<b>±'+p.accuracy+'m</b></div>').join('')+'</div>';
 return '<section class="tt-gps"><header class="tt-gps-heading"><div><h3>GPS &amp; Location Hub</h3>'+
 '<p>'+esc(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',dateStyle:'full'}).format(new Date(now)))+
 '</p></div><small>'+esc(data?'Signed attendance snapshot':'Not loaded')+'</small></header>'+
 '<div class="tt-gps-tabs">'+[['map','Live Map'],['geofence','Geofence'],['trail','Trail'],['accuracy','Accuracy'],['trends','Trends']].map(([key,title])=>
 '<button data-action="tt-gps-view" data-view="'+key+'" type="button" aria-pressed="'+(tab===key)+'">'+title+'</button>').join('')+'</div>'+
 (error?'<p class="tt-gps-error" role="alert">'+esc(error)+'</p>':'')+
 (loading?'<p role="status">Checking signed GPS records…</p>':'')+content+
 '<p class="tt-gps-note">Attendance fixes are not continuous live tracking. GPS evidence is visible only to server-authorized administrators and supervisors. External maps open only when selected. No location telemetry is collected in this view.</p></section>';
}
