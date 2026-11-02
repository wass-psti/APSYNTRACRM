/**
 * TimeTracker geographic map: opt-in OpenFreeMap basemap with MapLibre v6.
 * Location evidence is sourced exclusively from validated, signed GPS snapshots.
 * No tile request is made until the user explicitly enables the street map.
 * Neither employee identifiers nor GPS GeoJSON are sent to the tile provider.
 */
export const TT_MAPLIBRE_URL='https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs';
export const TT_MAPLIBRE_CSS='https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.css';
export const TT_MAP_STYLE=Object.freeze({
 map:'https://tiles.openfreemap.org/styles/liberty',
 dark:'https://tiles.openfreemap.org/styles/dark'
});
let libraryPromise=null;
const instances=new Map();
const dateKey=t=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date(t));
const isPoint=p=>p&&['in','out'].includes(p.kind)&&
 Number.isFinite(p.latitude)&&p.latitude>=-90&&p.latitude<=90&&
 Number.isFinite(p.longitude)&&p.longitude>=-180&&p.longitude<=180&&
 Number.isFinite(p.accuracyM)&&p.accuracyM>=0&&p.accuracyM<=100000&&
 typeof p.timestamp==='string'&&Number.isFinite(Date.parse(p.timestamp))&&
 typeof p.recordId==='string'&&typeof p.userId==='string';
export function signedMapPoints(data,{type='hub',record=null,points=[]}={}){
 if(!data||!Array.isArray(data.events))return [];
 if(type==='log'){
  if(!record?.id||!record?.ownerId?.startsWith('cloud:')||
    !Array.isArray(data.ranges))return [];
  return data.events.filter(p=>isPoint(p)&&p.recordId===record.id&&
   record.ownerId==='cloud:'+p.userId&&data.ranges.some(r=>
    dateKey(p.timestamp)>=r.from&&dateKey(p.timestamp)<=r.to)).slice(0,2);
 }
 const keys=new Set((Array.isArray(points)?points:[]).filter(isPoint)
  .map(p=>p.userId+'|'+p.recordId+'|'+p.kind));
 return data.events.filter(p=>isPoint(p)&&keys.has(
  p.userId+'|'+p.recordId+'|'+p.kind)).slice(0,500);
}
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
export function mapFrame({hasPoints=false,enabled=false,scope='hub'}={}){
 if(!hasPoints)return '<div class="tt-map-empty" role="status">No signed GPS coordinates available for this selection.</div>';
 if(!enabled)return '<div class="tt-map-consent"><strong>View recorded locations on a street map</strong>'+
  '<p>MapLibre + OpenFreeMap will fetch third-party map tiles for the area shown. '+
  'The provider may infer the approximate map area and receive connection metadata. '+
  'Employee identifiers and exact GPS markers remain in this browser.</p>'+
  '<button type="button" data-action="tt-map-enable">Enable street map</button></div>';
 return '<div class="tt-map-host" data-map-scope="'+scope+'" role="group" '+
  'aria-label="Interactive map of authorized attendance locations">'+
  '<div class="tt-map-loading" role="status">Loading street map…</div></div>';
}

const FALLBACK_STYLE={
 version:8,name:'Recorded GPS — offline coordinate view',
 sources:{},layers:[{id:'tt-background',type:'background',
  paint:{'background-color':'#e7eff3'}}]
};
function message(host,message,{retry=true}={}){
 if(!host?.isConnected)return;
 host.replaceChildren();
 const box=document.createElement('div');
 box.className='tt-map-message';
 box.setAttribute('role','status');
 const note=document.createElement('span');
 note.textContent=message;
 box.append(note);
 if(retry){
  const button=document.createElement('button');
  button.type='button';button.dataset.action='tt-map-retry';
  button.textContent='Retry street map';
  box.append(button);
 }
 host.append(box);
}
function banner(host,content,{retry=false}={}){
 if(!host?.isConnected)return;
 let box=host.querySelector('.tt-map-banner');
 if(!box){box=document.createElement('div');box.className='tt-map-banner';host.append(box);}
 box.replaceChildren();
 const label=document.createElement('span');label.textContent=content;box.append(label);
 if(retry){
  const btn=document.createElement('button');btn.type='button';
  btn.dataset.action='tt-map-retry';btn.textContent='Retry street tiles';box.append(btn);
 }
}
async function loadLibrary(){
 if(!libraryPromise){
  libraryPromise=(async()=>{
   if(!document.querySelector('link[data-tt-maplibre]')){
    const css=document.createElement('link');
    css.rel='stylesheet';css.href=TT_MAPLIBRE_CSS;css.dataset.ttMaplibre='true';
    document.head.append(css);
   }
   return import(TT_MAPLIBRE_URL);
  })().catch(error=>{libraryPromise=null;throw error;});
 }
 return libraryPromise;
}
function fit(map,lib,points){
 if(points.length===1){
  map.jumpTo({center:[points[0].longitude,points[0].latitude],zoom:14});
  return;
 }
 const bounds=new lib.LngLatBounds();
 for(const p of points)bounds.extend([p.longitude,p.latitude]);
 map.fitBounds(bounds,{padding:40,maxZoom:15,duration:0});
}
export function disposeTimeTrackerMaps(){
 for(const {map} of instances.values())try{map.remove()}catch{}
 instances.clear();
}
function drawEvidence(map,lib,points){
 if(map.getSource('tt-fixes'))return;
 map.addSource('tt-fixes',{type:'geojson',data:mapGeoJSON(points)});
 map.addSource('tt-direct-line',{type:'geojson',data:mapLineGeoJSON(points)});
 map.addLayer({id:'tt-direct-line',type:'line',source:'tt-direct-line',
  paint:{'line-color':'#596c9f','line-width':2,'line-dasharray':[3,3]}});
 map.addLayer({id:'tt-fixes',type:'circle',source:'tt-fixes',
  paint:{'circle-radius':9,'circle-color':['match',['get','kind'],
   'in','#16976b','out','#ed5b2a','#397ac7'],
   'circle-stroke-width':3,'circle-stroke-color':'#fff'}});
}
function createMap(host,config,lib){
 const points=config.points.filter(isPoint).slice(0,500);
 if(!points.length)return;
 if(typeof lib.supported==='function'&&!lib.supported()){
  message(host,'WebGL maps are unavailable in this browser. Signed coordinates remain listed.');
  return;
 }
 const map=new lib.Map({container:host,
  style:TT_MAP_STYLE[config.theme]||TT_MAP_STYLE.map,
  center:[points[0].longitude,points[0].latitude],
  zoom:13,attributionControl:true,cooperativeGestures:true,
  fadeDuration:0,renderWorldCopies:false});
 const entry={map,lib,points,theme:config.theme||'map',
  ready:false,fallback:false,wasStyled:false};
 instances.set(host,entry);
 map.addControl(new lib.NavigationControl({visualizePitch:false}),'top-right');
 map.addControl(new lib.FullscreenControl(),'top-right');
 map.addControl(new lib.ScaleControl({unit:'metric'}),'bottom-left');
 // Source/layer creation needs only style.load, not waiting for every remote tile,
 // sprite and glyph request to settle. That was the blank-map defect.
 map.on('style.load',()=>{
  if(!host.isConnected||instances.get(host)!==entry)return;
  try{
   drawEvidence(map,lib,points);
   entry.ready=true;
   host.querySelector('.tt-map-loading')?.remove();
   if(entry.fallback){
    banner(host,'Street basemap unavailable — interactive GPS coordinates shown.',{retry:true});
   }else host.querySelector('.tt-map-banner')?.remove();
   fit(map,lib,points);
   map.resize();
  }catch{
   if(!entry.fallback){
    entry.fallback=true;
    map.setStyle(FALLBACK_STYLE,{diff:false});
   }else banner(host,'Unable to plot GPS points on this device.',{retry:true});
  }
 });
 map.on('click',e=>{
  if(!map.getLayer('tt-fixes'))return;
  const feature=map.queryRenderedFeatures(e.point,{layers:['tt-fixes']})?.[0];
  if(!feature)return;
  new lib.Popup({closeButton:true})
   .setLngLat(feature.geometry.coordinates)
   .setText(String(feature.properties?.label||'Attendance location')+
     ' · ±'+String(feature.properties?.accuracyM??'—')+' m')
   .addTo(map);
 });
 map.on('error',()=>{
  if(!host.isConnected||instances.get(host)!==entry)return;
  if(!entry.ready&&!entry.fallback){
   // A failed style or resource request must not leave the loading veil over
   // a usable canvas. Fall back to an offline interactive coordinate map.
   entry.fallback=true;
   map.setStyle(FALLBACK_STYLE,{diff:false});
  }else if(entry.ready&&!entry.fallback){
   banner(host,'Some street tiles could not load. Recorded GPS markers remain available.',
    {retry:true});
  }
 });
}
export async function mountTimeTrackerMaps(root,configs=[]){
 if(typeof document==='undefined'||!root)return;
 const hosts=[...root.querySelectorAll('.tt-map-host')].filter(host=>
  host.isConnected&&(!host.closest('details')||host.closest('details').open));
 const entries=hosts.map(host=>{
  const scope=host.dataset.mapScope;
  return {host,config:configs.find(c=>scope==='log'?
   c.scope==='log'&&c.elementId===host.closest('[data-record-id]')?.dataset.recordId:
   c.scope===scope)};
 }).filter(x=>x.config?.points?.length&&!instances.has(x.host));
 if(!entries.length)return;
 let lib;
 try{lib=await loadLibrary()}catch{
  entries.forEach(({host})=>message(host,
   'Street map library could not load. Check the network, then retry.'));
  return;
 }
 for(const {host,config} of entries){
  if(!host.isConnected||host.closest('details')?.open===false||
    instances.has(host))continue;
  try{createMap(host,config,lib)}catch{
   const entry=instances.get(host);
   if(entry){try{entry.map.remove()}catch{}instances.delete(host);}
   message(host,'Street map could not initialize. Signed coordinates remain available.');
  }
 }
}
/** Updates map style without rebuilding the surrounding attendance UI. */
export function setTimeTrackerMapTheme(theme){
 if(theme!=='map'&&theme!=='dark')return;
 for(const entry of instances.values()){
  if(entry.theme===theme&&!entry.fallback)continue;
  entry.theme=theme;entry.ready=false;entry.fallback=false;
  try{entry.map.setStyle(TT_MAP_STYLE[theme],{diff:false})}catch{
   entry.fallback=true;
   entry.map.setStyle(FALLBACK_STYLE,{diff:false});
  }
 }
}
/** Retry is a direct map operation; audit disclosure and scroll stay untouched. */
export async function retryTimeTrackerMaps(root,configs=[],selectedHost=null){
 if(typeof document==='undefined'||!root)return;
 const targets=[...root.querySelectorAll('.tt-map-host')].filter(host=>
  host.closest('details')?.open!==false&&(!selectedHost||selectedHost===host));
 for(const host of targets){
  const entry=instances.get(host);
  if(entry){
   entry.ready=false;entry.fallback=false;
   try{entry.map.setStyle(TT_MAP_STYLE[entry.theme]||TT_MAP_STYLE.map,{diff:false})}
   catch{entry.fallback=true;entry.map.setStyle(FALLBACK_STYLE,{diff:false})}
  }else{
   const old=host.querySelector('.tt-map-message');
   if(old){old.remove();const spinner=document.createElement('div');
    spinner.className='tt-map-loading';spinner.textContent='Loading street map…';host.append(spinner);}
  }
 }
 await mountTimeTrackerMaps(root,configs);
}
