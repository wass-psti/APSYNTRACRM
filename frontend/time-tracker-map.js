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
function showMessage(host,message){
 if(!host?.isConnected)return;
 // On map initialization failure, never display raw location or API details.
 host.replaceChildren();
 const span=document.createElement('div');
 span.className='tt-map-message';span.setAttribute('role','status');span.textContent=message;
 host.append(span);
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
 if(points.length===1){map.jumpTo({center:[points[0].longitude,points[0].latitude],zoom:14});return;}
 const bounds=new lib.LngLatBounds();
 for(const p of points)bounds.extend([p.longitude,p.latitude]);
 map.fitBounds(bounds,{padding:56,maxZoom:15,duration:0});
}
export function disposeTimeTrackerMaps(){
 for(const {map} of instances.values())try{map.remove()}catch{}
 instances.clear();
}
/** Called after rendering and on audit disclosure toggle. No tracking or polling. */
export async function mountTimeTrackerMaps(root,configs=[]){
 if(typeof document==='undefined'||!root)return;
 const hosts=[...root.querySelectorAll('.tt-map-host')].filter(host=>
  host.isConnected&&(!host.closest('details')||host.closest('details').open));
 const entries=hosts.map(host=>{
  const scope=host.dataset.mapScope;
  return {host,config:configs.find(c=>scope==='log'?
   c.scope==='log'&&c.elementId===host.closest('[data-record-id]')?.dataset.recordId:
   c.scope===scope)};
 }).filter(x=>x.config?.points?.length);
 if(!entries.length)return;
 let lib;
 try{lib=await loadLibrary()}catch{
  entries.forEach(({host})=>showMessage(host,'Street map could not load. Check the connection and retry.'));
  return;
 }
 for(const {host,config} of entries){
  if(!host.isConnected||host.closest('details')?.open===false||
    instances.has(host))continue;
  const points=config.points.filter(isPoint).slice(0,500);
  if(!points.length)continue;
  try{
   if(typeof lib.supported==='function'&&!lib.supported()){
    showMessage(host,'WebGL2 is unavailable. Use the listed coordinates or external map link.');
    continue;
   }
   const style=TT_MAP_STYLE[config.theme]||TT_MAP_STYLE.map;
   const map=new lib.Map({container:host,style,center:[points[0].longitude,points[0].latitude],
    zoom:13,attributionControl:true,cooperativeGestures:true,
    fadeDuration:0,renderWorldCopies:false});
   instances.set(host,{map});
   map.addControl(new lib.NavigationControl({visualizePitch:false}),'top-right');
   map.addControl(new lib.FullscreenControl(),'top-right');
   map.addControl(new lib.ScaleControl({unit:'metric'}),'bottom-left');
   map.on('load',()=>{
    if(!host.isConnected||!instances.has(host))return;
    const notice=host.querySelector('.tt-map-loading');notice?.remove();
    map.addSource('tt-fixes',{type:'geojson',data:mapGeoJSON(points)});
    map.addSource('tt-direct-line',{type:'geojson',data:mapLineGeoJSON(points)});
    map.addLayer({id:'tt-direct-line',type:'line',source:'tt-direct-line',
     paint:{'line-color':'#596c9f','line-width':2,'line-dasharray':[3,3]}});
    map.addLayer({id:'tt-fixes',type:'circle',source:'tt-fixes',
     paint:{'circle-radius':9,'circle-color':['match',['get','kind'],
      'in','#16976b','out','#ed5b2a','#397ac7'],
      'circle-stroke-width':3,'circle-stroke-color':'#fff'}});
    map.on('click','tt-fixes',e=>{
     const feature=e.features?.[0];if(!feature)return;
     new lib.Popup({closeButton:true}).setLngLat(feature.geometry.coordinates)
      .setText(String(feature.properties?.label||'Recorded attendance location')+
       ' · ±'+String(feature.properties?.accuracyM||'—')+' m')
      .addTo(map);
    });
    fit(map,lib,points);
   });
   map.on('error',()=>showMessage(host,'Street map tiles are unavailable. Signed GPS records remain accessible.'));
  }catch{
   const existing=instances.get(host);if(existing){try{existing.map.remove()}catch{}instances.delete(host);}
   showMessage(host,'Street map could not initialize. Signed GPS records remain accessible.');
  }
 }
}
