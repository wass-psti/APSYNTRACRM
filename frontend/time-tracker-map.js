/**
 * Restricted TimeTracker recorded-location display.
 * Leaflet 1.9.4 renders authorized signed GPS fixes; tiles are an external,
 * best-effort backdrop, never a source of truth for location or attendance.
 * Precise points are filtered by the caller and never sent in tile URLs.
 */
export const TT_LEAFLET_JS='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
export const TT_LEAFLET_CSS='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
export const TT_OSM_TILES='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const LEAFLET_JS_SRI='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
const LEAFLET_CSS_SRI='sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
let libraryPromise=null;
const instances=new Map();
const day=t=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date(t));
const isPoint=p=>p&&['in','out'].includes(p.kind)&&
 Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&
 Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180&&
 Number.isFinite(p.accuracyM)&&p.accuracyM>=0&&p.accuracyM<=100000&&
 typeof p.timestamp==='string'&&Number.isFinite(Date.parse(p.timestamp))&&
 typeof p.userId==='string'&&typeof p.recordId==='string';

/** Retain the authoritative owner/date/record checks from the restricted RPC. */
export function signedMapPoints(data,{type='hub',record=null,points=[]}={}){
 if(!data||!Array.isArray(data.events))return [];
 if(type==='log'){
  if(!record?.id||!record?.ownerId?.startsWith('cloud:')||
     !Array.isArray(data.ranges))return [];
  return data.events.filter(p=>isPoint(p)&&p.recordId===record.id&&
   record.ownerId==='cloud:'+p.userId&&data.ranges.some(r=>
    day(p.timestamp)>=r.from&&day(p.timestamp)<=r.to)).slice(0,2);
 }
 const keys=new Set((Array.isArray(points)?points:[]).filter(isPoint)
  .map(p=>p.userId+'|'+p.recordId+'|'+p.kind));
 return data.events.filter(p=>isPoint(p)&&keys.has(
  p.userId+'|'+p.recordId+'|'+p.kind)).slice(0,500);
}
/** Standard GeoJSON is kept for pure tests and alternate approved exports. */
export function mapGeoJSON(points){
 return {type:'FeatureCollection',features:points.filter(isPoint).map(p=>({
  type:'Feature',geometry:{type:'Point',coordinates:[p.longitude,p.latitude]},
  properties:{kind:p.kind,recordId:p.recordId,
   label:(p.kind==='in'?'Clock In':'Clock Out')+' · '+
    new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',
     month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(p.timestamp)),
   accuracyM:Math.round(p.accuracyM)}
 }))};
}
export function mapLineGeoJSON(points){
 const ins=points.find(p=>p.kind==='in'),outs=points.find(p=>p.kind==='out');
 return {type:'FeatureCollection',features:ins&&outs?[{
  type:'Feature',geometry:{type:'LineString',
   coordinates:[[ins.longitude,ins.latitude],[outs.longitude,outs.latitude]]},
  properties:{note:'Straight-line comparison; not a traveled route'}
 }]:[]};
}
export function mapFrame({hasPoints=false,enabled=false,scope='hub',loading=false}={}){
 if(!hasPoints)return '<div class="tt-map-empty" role="status">'+
  (loading?'Checking signed GPS records…':
   'No signed GPS coordinates available for this selection. Select a date range and load signed evidence.')+
  '</div>';
 if(!enabled)return '<div class="tt-map-empty" role="status">GPS map authorization required.</div>';
 return '<div class="tt-map-host" data-map-scope="'+scope+'" role="group" '+
  'aria-label="Interactive Leaflet map of authorized attendance fixes">'+
  '<div class="tt-map-loading" role="status">Preparing recorded location map…</div></div>';
}
function info(host,text,allowRetry=true){
 if(!host?.isConnected)return;
 let box=host.querySelector('.tt-map-banner');
 if(!box){box=document.createElement('div');box.className='tt-map-banner';host.append(box);}
 box.replaceChildren();
 const label=document.createElement('span');label.textContent=text;box.append(label);
 if(allowRetry){
  const button=document.createElement('button');button.type='button';
  button.dataset.action='tt-map-retry';button.textContent='Retry street tiles';box.append(button);
 }
}
function failed(host,text){
 if(!host?.isConnected)return;
 host.replaceChildren();
 const element=document.createElement('div');
 element.className='tt-map-message';element.setAttribute('role','status');
 const label=document.createElement('span');label.textContent=text;element.append(label);
 const retry=document.createElement('button');retry.type='button';
 retry.dataset.action='tt-map-retry';retry.textContent='Retry map';
 element.append(retry);host.append(element);
}
async function loadLeaflet(){
 if(typeof window==='undefined'||typeof document==='undefined')return null;
 if(window.L?.map&&window.L?.tileLayer)return window.L;
 if(!libraryPromise){
  libraryPromise=new Promise((resolve,reject)=>{
   const link=document.querySelector('link[data-tt-leaflet]')||
    document.createElement('link');
   if(!link.isConnected){
    link.rel='stylesheet';link.href=TT_LEAFLET_CSS;
    link.integrity=LEAFLET_CSS_SRI;link.crossOrigin='anonymous';
    link.dataset.ttLeaflet='true';
   }
   const script=document.createElement('script');
   script.src=TT_LEAFLET_JS;script.async=true;
   script.integrity=LEAFLET_JS_SRI;script.crossOrigin='anonymous';
   script.dataset.ttLeaflet='true';
   let cssReady=false,jsReady=false,failedLoad=false;
   const complete=()=>{
    if(cssReady&&jsReady&&!failedLoad)
     window.L?.map?resolve(window.L):reject(Error('Leaflet unavailable'));
   };
   const failure=()=>{
    if(failedLoad)return;
    failedLoad=true;reject(Error('Leaflet assets unavailable'));
   };
   link.addEventListener('load',()=>{cssReady=true;complete()},{once:true});
   link.addEventListener('error',()=>{link.remove();failure()},{once:true});
   script.addEventListener('load',()=>{jsReady=true;complete()},{once:true});
   script.addEventListener('error',failure,{once:true});
   if(!link.isConnected)document.head.append(link);
   document.head.append(script);
  }).catch(err=>{
   libraryPromise=null;
   document.querySelector('script[data-tt-leaflet]')?.remove();
   throw err;
  });
 }
 return libraryPromise;
}
function markerLabel(p){
 return (p.kind==='in'?'Clock In':'Clock Out')+' · '+
  new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',
   month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(p.timestamp))+
  ' · ±'+Math.round(p.accuracyM)+' m';
}
function initMap(host,config,L){
 const points=config.points.filter(isPoint).slice(0,500);
 if(!points.length)return;
 const map=L.map(host,{preferCanvas:true,zoomControl:true,attributionControl:true,
  scrollWheelZoom:false,zoomAnimation:false,fadeAnimation:false,
  markerZoomAnimation:false,worldCopyJump:false});
 const entry={map,layer:null,points,theme:config.theme==='dark'?'dark':'map',
  bounds:null,disposed:false,resize:null,errors:0};
 instances.set(host,entry);
 host.classList.toggle('tt-leaflet-dark',entry.theme==='dark');
 try{
  const tiles=L.tileLayer(TT_OSM_TILES,{
   minZoom:2,maxZoom:19,maxNativeZoom:19,
   attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
   updateWhenIdle:true,keepBuffer:1,noWrap:true,crossOrigin:'anonymous'
  });
  entry.layer=tiles;
  tiles.on('tileerror',()=>{
   if(entry.disposed||!host.isConnected)return;
   entry.errors++;
   if(entry.errors===1)info(host,'Street tiles are temporarily unavailable. Recorded GPS markers remain interactive.');
  });
  tiles.on('tileload',()=>{
   if(entry.disposed||!host.isConnected)return;
   if(entry.errors){entry.errors=0;host.querySelector('.tt-map-banner')?.remove();}
  });
  tiles.addTo(map);
  const bounds=L.latLngBounds([]);
  const groups=new Map();
  for(const p of points){
   const latlng=[p.latitude,p.longitude];
   const circle=L.circleMarker(latlng,{
    radius:8,color:'#fff',weight:2,fillOpacity:0.95,
    fillColor:p.kind==='in'?'#16976b':'#ed5b2a'
   }).addTo(map);
   // DOM nodes, not HTML strings assembled from employee data.
   const label=document.createElement('div');
   label.className='tt-map-popup';label.textContent=markerLabel(p);
   circle.bindPopup(label);
   bounds.extend(latlng);
   const key=p.userId+'|'+p.recordId;
   const pair=groups.get(key)||{};
   pair[p.kind]=p;groups.set(key,pair);
  }
  for(const pair of groups.values()){
   if(pair.in&&pair.out){
    L.polyline([[pair.in.latitude,pair.in.longitude],
     [pair.out.latitude,pair.out.longitude]],{
     color:'#596c9f',weight:2,dashArray:'5,7',interactive:false
    }).addTo(map);
   }
  }
  entry.bounds=bounds;
  const fullscreenChange=()=>{
   if(!entry.disposed)map.invalidateSize({pan:false,animate:false});
  };
  document.addEventListener('fullscreenchange',fullscreenChange);
  entry.fullscreenCleanup=()=>document.removeEventListener('fullscreenchange',fullscreenChange);
  if(points.length===1)map.setView([points[0].latitude,points[0].longitude],14,{animate:false});
  else map.fitBounds(bounds,{padding:[36,36],maxZoom:15,animate:false});
  host.querySelector('.tt-map-loading')?.remove();
  const fullscreen=document.createElement('button');
  fullscreen.type='button';
  fullscreen.dataset.action='tt-map-fullscreen';
  fullscreen.className='tt-map-fullscreen';
  fullscreen.setAttribute('aria-label','Toggle recorded-location map fullscreen');
  fullscreen.textContent='⛶ Fullscreen';
  host.append(fullscreen);
  L.control.scale({imperial:false,metric:true,maxWidth:100}).addTo(map);
  if(typeof ResizeObserver!=='undefined'){
   entry.resize=new ResizeObserver(()=>{if(!entry.disposed)map.invalidateSize({pan:false,animate:false});});
   entry.resize.observe(host);
  }
  map.invalidateSize({pan:false,animate:false});
 }catch(err){
  entry.resize?.disconnect();entry.fullscreenCleanup?.();
  entry.disposed=true;
  instances.delete(host);map.remove();
  failed(host,'The map could not initialize. Recorded coordinates remain available.');
 }
}
export function disposeTimeTrackerMaps(){
 for(const entry of instances.values()){
  entry.disposed=true;entry.resize?.disconnect();entry.fullscreenCleanup?.();
  try{entry.map.remove()}catch{}
 }
 instances.clear();
}
/** Lazy on expanded audit sections and GPS tab; in-flight asset reads deduped. */
export async function mountTimeTrackerMaps(root,configs=[]){
 if(typeof document==='undefined'||!root)return;
 const hosts=[...root.querySelectorAll('.tt-map-host')].filter(host=>
  host.isConnected&&(!host.closest('details')||host.closest('details').open));
 const matching=hosts.map(host=>({
  host,config:configs.find(c=>host.dataset.mapScope==='log'?
   c.scope==='log'&&c.elementId===host.closest('[data-record-id]')?.dataset.recordId:
   c.scope==='hub')
 })).filter(x=>x.config?.points?.length&&!instances.has(x.host));
 if(!matching.length)return;
 let L;
 try{L=await loadLeaflet()}catch{
  for(const {host} of matching)failed(host,'Leaflet could not load. Check the network and retry.');
  return;
 }
 for(const {host,config} of matching){
  if(!host.isConnected||host.closest('details')?.open===false||instances.has(host))continue;
  initMap(host,config,L);
 }
}
/** Dark map uses a local CSS tile filter, not another remote provider or data API. */
export function setTimeTrackerMapTheme(theme){
 if(theme!=='map'&&theme!=='dark')return;
 for(const [host,entry] of instances){
  entry.theme=theme;
  host.classList.toggle('tt-leaflet-dark',theme==='dark');
 }
}
export async function retryTimeTrackerMaps(root,configs=[],selectedHost=null){
 if(typeof document==='undefined'||!root)return;
 for(const host of root.querySelectorAll('.tt-map-host')){
  if(selectedHost&&host!==selectedHost)continue;
  if(host.closest('details')?.open===false)continue;
  const entry=instances.get(host);
  if(entry){
   entry.errors=0;
   host.querySelector('.tt-map-banner')?.remove();
   entry.layer?.redraw();
   entry.map.invalidateSize({pan:false,animate:false});
  }else{
   host.querySelector('.tt-map-message')?.remove();
   const pending=document.createElement('div');
   pending.className='tt-map-loading';pending.textContent='Preparing street map…';
   host.append(pending);
  }
 }
 await mountTimeTrackerMaps(root,configs);
}

/** Native fullscreen requires no extra mapping dependency or library-specific API. */
export async function toggleTimeTrackerMapFullscreen(host){
 if(!host||typeof document==='undefined')return;
 const entry=instances.get(host);
 if(!entry)return;
 try{
  if(document.fullscreenElement===host)await document.exitFullscreen();
  else if(host.requestFullscreen)await host.requestFullscreen();
  entry.map.invalidateSize({pan:false,animate:false});
 }catch{
  info(host,'Fullscreen mode is not available in this browser.',false);
 }
}
