const MAX_EVENTS=60;
const events=[];
let nextEventId=0;
let nextCaptureId=0;

function finiteNumber(value){
 return Number.isFinite(Number(value))?Number(value):null;
}
function browserDetails(navigatorObject){
 let ua='',platform='';
 try{ua=String(navigatorObject?.userAgent||'');}catch{}
 try{platform=String(navigatorObject?.platform||'');}catch{}
 let browser='Unknown',browserVersion='';
 const patterns=[
  ['Edge',/Edg(?:A|iOS)?\/([\d.]+)/],
  ['Opera',/OPR\/([\d.]+)/],
  ['Chrome iOS',/CriOS\/([\d.]+)/],
  ['Chrome',/(?:Chrome|Chromium)\/([\d.]+)/],
  ['Firefox iOS',/FxiOS\/([\d.]+)/],
  ['Firefox',/Firefox\/([\d.]+)/],
  ['Safari',/Version\/([\d.]+).*Safari\//]
 ];
 for(const [name,pattern] of patterns){
  const match=ua.match(pattern);
  if(match){browser=name;browserVersion=match[1];break;}
 }
 let os='Unknown',osVersion='',device='Unknown';
 if(/iPhone|iPod/i.test(ua)){os='iOS';device='iPhone';}
 else if(/iPad/i.test(ua)){os='iPadOS';device='iPad';}
 else if(/Macintosh|Mac OS X/i.test(ua)||/Mac/i.test(platform)){
  let touch=0;try{touch=Number(navigatorObject?.maxTouchPoints)||0;}catch{}
  os=touch>1?'iPadOS':'macOS';device=touch>1?'iPad':'Mac';
  // Safari's macOS user-agent token is commonly a compatibility value, not the installed OS version.
 }else if(/Android/i.test(ua)){
  os='Android';device=/Mobile/i.test(ua)?'Android phone':'Android tablet';
  osVersion=ua.match(/Android ([\d.]+)/)?.[1]||'';
 }else if(/Windows/i.test(ua)){
  os='Windows';device='PC';osVersion=ua.match(/Windows NT ([\d.]+)/)?.[1]||'';
 }else if(/Linux/i.test(ua)){os='Linux';device='PC';}
 if(os==='iOS'||os==='iPadOS')osVersion=ua.match(/(?:iPhone )?OS ([\d_]+) like Mac OS X/)?.[1]?.replace(/_/g,'.')||'';
 return {browser,browserVersion,os,osVersion,device};
}
function environmentSnapshot(){
 let nav=null,doc=null,secureContext=null,geolocationAvailable=false;
 let permissionApiAvailable=false,visibilityState='unknown',documentFocused=null,online=null;
 try{nav=globalThis.navigator||null;}catch{}
 try{doc=globalThis.document||null;}catch{}
 try{secureContext=typeof globalThis.isSecureContext==='boolean'?globalThis.isSecureContext:null;}catch{}
 try{geolocationAvailable=typeof nav?.geolocation?.getCurrentPosition==='function';}catch{}
 try{permissionApiAvailable=typeof nav?.permissions?.query==='function';}catch{}
 try{if(typeof doc?.visibilityState==='string')visibilityState=doc.visibilityState;}catch{}
 try{documentFocused=typeof doc?.hasFocus==='function'?doc.hasFocus():null;}catch{}
 try{online=typeof nav?.onLine==='boolean'?nav.onLine:null;}catch{}
 return {
  ...browserDetails(nav),secureContext,geolocationAvailable,
  permissionApiAvailable,visibilityState,documentFocused,online
 };
}
function actionName(value){
 return ['clock-in','clock-out','automatic-clock-out','ojt-attendance'].includes(value)?
  value:'unknown';
}
function cleanEvent(input={}){
 const output={
  id:++nextEventId,
  at:new Date().toISOString(),
  phase:String(input.phase||'event').slice(0,48),
  action:actionName(input.action),
  environment:environmentSnapshot()
 };
 for(const key of ['captureId','attempt','elapsedMs','timeoutMs','maximumAgeMs',
  'accuracyMeters','positionAgeMs','httpStatus']){
  const value=finiteNumber(input[key]);
  if(value!==null&&value>=0)output[key]=Math.round(value*100)/100;
 }
 if(typeof input.enableHighAccuracy==='boolean')
  output.enableHighAccuracy=input.enableHighAccuracy;
 if(typeof input.submitterAvailable==='boolean')
  output.submitterAvailable=input.submitterAvailable;
 if(typeof input.permissionApiStatus==='string')
  output.permissionApiStatus=input.permissionApiStatus.slice(0,24);
 if(['granted','denied','prompt'].includes(input.permissionState))
  output.permissionState=input.permissionState;
 if(typeof input.errorCode==='string')
  output.errorCode=input.errorCode.slice(0,48);
 if(typeof input.result==='string')
  output.result=input.result.slice(0,32);
 if(typeof input.reason==='string')
  output.reason=input.reason.slice(0,48);
 return Object.freeze(output);
}

export function recordTimeTrackerGpsDiagnostic(input){
 try{
  const entry=cleanEvent(input);
  events.push(entry);
  if(events.length>MAX_EVENTS)events.splice(0,events.length-MAX_EVENTS);
  return entry;
 }catch{
  // Diagnostics must never interrupt GPS acquisition or an attendance action.
  return null;
 }
}

export function getTimeTrackerGpsDiagnostics(){
 return {
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  privacy:{coordinatesIncluded:false,persistentStorage:false,remoteTransmission:false},
  environment:environmentSnapshot(),
  events:events.map(event=>({...event,environment:{...event.environment}}))
 };
}

export function exportTimeTrackerGpsDiagnostics(){
 return JSON.stringify(getTimeTrackerGpsDiagnostics(),null,2);
}

export function clearTimeTrackerGpsDiagnostics(){
 events.length=0;
}

export function beginTimeTrackerGpsCapture(action){
 const captureId=++nextCaptureId;
 recordTimeTrackerGpsDiagnostic({phase:'capture-start',action,captureId});
 return captureId;
}

export function observeTimeTrackerGpsPermission(action,captureId){
 let permissions=null;
 try{permissions=globalThis.navigator?.permissions;}catch{
  recordTimeTrackerGpsDiagnostic({phase:'permission-query-failed',action,captureId,
   permissionApiStatus:'failed'});
  return ()=>{};
 }
 let active=true,statusObject=null,changeListener=null;
 const cleanup=()=>{
  active=false;
  if(statusObject&&changeListener){
   try{statusObject.removeEventListener?.('change',changeListener);}catch{}
  }
 };
 if(typeof permissions?.query!=='function'){
  recordTimeTrackerGpsDiagnostic({
   phase:'permission-api-unavailable',action,captureId,
   permissionApiStatus:'unsupported'
  });
  return cleanup;
 }
 recordTimeTrackerGpsDiagnostic({
  phase:'permission-query-start',action,captureId,
  permissionApiStatus:'available'
 });
 try{
  Promise.resolve(permissions.query({name:'geolocation'})).then(status=>{
   recordTimeTrackerGpsDiagnostic({
    phase:'permission-query-result',action,captureId,
    permissionApiStatus:'available',
    permissionState:['granted','denied','prompt'].includes(status?.state)?status.state:undefined
   });
   if(active&&typeof status?.addEventListener==='function'){
    statusObject=status;
    changeListener=()=>recordTimeTrackerGpsDiagnostic({
     phase:'permission-state-change',action,captureId,
     permissionApiStatus:'available',
     permissionState:['granted','denied','prompt'].includes(status.state)?status.state:undefined
    });
    statusObject.addEventListener('change',changeListener);
   }
  }).catch(()=>{
   recordTimeTrackerGpsDiagnostic({
    phase:'permission-query-failed',action,captureId,
    permissionApiStatus:'failed'
   });
  });
 }catch{
  recordTimeTrackerGpsDiagnostic({
   phase:'permission-query-failed',action,captureId,
   permissionApiStatus:'failed'
  });
 }
 return cleanup;
}

export function observeTimeTrackerGpsLifecycle(action,captureId){
 let doc=null,win=null;
 try{doc=globalThis.document||null;}catch{}
 try{win=globalThis.window||null;}catch{}
 const listeners=[];
 const add=(target,type,handler)=>{
  try{
   if(typeof target?.addEventListener!=='function')return;
   target.addEventListener(type,handler);
   listeners.push(()=>{try{target.removeEventListener?.(type,handler);}catch{}});
  }catch{}
 };
 const record=(phase,result)=>recordTimeTrackerGpsDiagnostic({
  phase,action,captureId,result
 });
 add(doc,'visibilitychange',()=>{
  let visibility='unknown';try{visibility=doc?.visibilityState||'unknown';}catch{}
  record('lifecycle-visibility',visibility);
 });
 add(win,'focus',()=>record('lifecycle-focus','focused'));
 add(win,'blur',()=>record('lifecycle-focus','blurred'));
 add(win,'online',()=>record('lifecycle-network','online'));
 add(win,'offline',()=>record('lifecycle-network','offline'));
 add(win,'pagehide',()=>record('lifecycle-page','pagehide'));
 add(win,'pageshow',()=>record('lifecycle-page','pageshow'));
 return ()=>{for(const remove of listeners)remove();};
}

export function gpsPositionFailureReason(position,now=Date.now()){
 const coords=position?.coords||{};
 const latitude=Number(coords.latitude);
 const longitude=Number(coords.longitude);
 const accuracy=Number(coords.accuracy);
 const capturedAt=Number(position?.timestamp);
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||
  latitude < -90||latitude>90||longitude < -180||longitude>180)
  return 'invalid-coordinates';
 if(!Number.isFinite(accuracy)||accuracy<0||accuracy>100000)
  return 'invalid-accuracy';
 if(!Number.isFinite(capturedAt))return 'invalid-timestamp';
 if(now-capturedAt>60000)return 'stale-position';
 if(capturedAt-now>120000)return 'future-position';
 return '';
}
