import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureAttendanceGeo} from '../time-tracker-native.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';
import {
 beginTimeTrackerGpsCapture,clearTimeTrackerGpsDiagnostics,
 exportTimeTrackerGpsDiagnostics,getTimeTrackerGpsDiagnostics,
 observeTimeTrackerGpsLifecycle,recordTimeTrackerGpsDiagnostic
} from '../time-tracker-gps-diagnostics.js';

const app=readFileSync('frontend/app.js','utf8');
const automatic=readFileSync('frontend/apps/TimeTracker/time-tracker-auto-clockout-execution.js','utf8');
const diagnosticsSource=readFileSync('frontend/time-tracker-gps-diagnostics.js','utf8');

const position=(timestamp=Date.now())=>({
 timestamp,coords:{latitude:10.2,longitude:123.9,accuracy:18}
});

test.beforeEach(()=>clearTimeTrackerGpsDiagnostics());

test('GPS capture records attempt timing, requested options and accuracy without coordinates',async()=>{
 const geo={getCurrentPosition(ok){ok(position());}};
 const fix=await captureAttendanceGeo(geo,{diagnosticContext:{action:'clock-in'}});
 assert.equal(fix.status,'captured');
 const report=getTimeTrackerGpsDiagnostics();
 const phases=report.events.map(event=>event.phase);
 assert.ok(phases.includes('capture-start'));
 assert.ok(phases.includes('attempt-start'));
 assert.ok(phases.includes('attempt-success'));
 assert.ok(phases.includes('capture-success'));
 const attempt=report.events.find(event=>event.phase==='attempt-start');
 assert.equal(attempt.action,'clock-in');
 assert.equal(attempt.enableHighAccuracy,true);
 assert.equal(attempt.timeoutMs,10000);
 assert.equal(attempt.maximumAgeMs,25000);
 const success=report.events.find(event=>event.phase==='capture-success');
 assert.equal(success.accuracyMeters,18);
 assert.ok(success.positionAgeMs>=0);
 const serialized=exportTimeTrackerGpsDiagnostics();
 assert.doesNotMatch(serialized,/"latitude"|"longitude"|10\.2|123\.9/);
 assert.match(serialized,/"coordinatesIncluded": false/);
 assert.match(serialized,/"persistentStorage": false/);
 assert.match(serialized,/"remoteTransmission": false/);
 assert.doesNotMatch(diagnosticsSource,/\bfetch\s*\(|sendBeacon|localStorage|sessionStorage/);
});

test('GPS timeout and permission denial are distinguished and permission inspection never gates acquisition',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{
  userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  platform:'MacIntel',maxTouchPoints:0,onLine:true,
  permissions:{query:async()=>({state:'denied'})}
 }});
 try{
  const geo={getCurrentPosition(ok,bad){bad({code:3,message:'Timeout expired'});}};
  await assert.rejects(()=>captureAttendanceGeo(geo,{diagnosticContext:{action:'clock-in'}}),
   error=>error.code==='TT_GEO_TIMEOUT');
  await Promise.resolve();
  const report=getTimeTrackerGpsDiagnostics();
  assert.equal(report.environment.browser,'Safari');
  assert.equal(report.environment.browserVersion,'18.6');
  assert.equal(report.environment.os,'macOS');
  assert.ok(report.events.some(event=>event.phase==='permission-query-result'&&
   event.permissionState==='denied'));
  assert.equal(report.events.filter(event=>event.phase==='attempt-error').length,2);
  assert.equal(report.events.at(-1).errorCode,'TT_GEO_TIMEOUT');
 }finally{
  if(original)Object.defineProperty(globalThis,'navigator',original);
  else delete globalThis.navigator;
 }
});

test('WebKit DOMException permission and timeout names map to the correct GPS diagnostics',async()=>{
 const denied={getCurrentPosition(_ok,bad){
  const error=new Error('Permission denied');error.name='NotAllowedError';bad(error);
 }};
 await assert.rejects(()=>captureAttendanceGeo(denied),error=>error.code==='TT_GEO_DENIED');
 assert.ok(getTimeTrackerGpsDiagnostics().events.some(event=>
  event.phase==='attempt-error'&&event.errorCode==='TT_GEO_DENIED'));
 clearTimeTrackerGpsDiagnostics();
 const timedOut={getCurrentPosition(_ok,bad){
  const error=new Error('Timed out');error.name='TimeoutError';bad(error);
 }};
 await assert.rejects(()=>captureAttendanceGeo(timedOut),error=>error.code==='TT_GEO_TIMEOUT');
 assert.ok(getTimeTrackerGpsDiagnostics().events.some(event=>
  event.phase==='attempt-error'&&event.errorCode==='TT_GEO_TIMEOUT'));
});

test('normalized geolocation error codes retain their meaning through the fallback path',async()=>{
 const geo={getCurrentPosition(_ok,bad){bad({code:'TT_GEO_TIMEOUT'});}};
 await assert.rejects(()=>captureAttendanceGeo(geo),error=>error.code==='TT_GEO_TIMEOUT');
 assert.ok(getTimeTrackerGpsDiagnostics().events.some(event=>
  event.phase==='capture-failed'&&event.errorCode==='TT_GEO_TIMEOUT'));
});

test('iOS Safari and Chrome on iOS are identified as WebKit-based mobile browsers',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const cases=[
  {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',browser:'Safari',os:'iOS'},
  {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.0 Mobile/15E148 Safari/604.1',browser:'Chrome iOS',os:'iOS'}
 ];
 try{
  for(const item of cases){
   clearTimeTrackerGpsDiagnostics();
   Object.defineProperty(globalThis,'navigator',{configurable:true,value:{
    userAgent:item.userAgent,platform:'iPhone',maxTouchPoints:5,onLine:true
   }});
   await captureAttendanceGeo({getCurrentPosition(ok){ok(position());}});
   const environment=getTimeTrackerGpsDiagnostics().environment;
   assert.equal(environment.browser,item.browser);
   assert.equal(environment.os,item.os);
   if(item.os==='iOS')assert.equal(environment.osVersion,'18.6');
   assert.equal(environment.device,'iPhone');
  }
 }finally{
  if(original)Object.defineProperty(globalThis,'navigator',original);
  else delete globalThis.navigator;
 }
});

test('permission state changes are observed during acquisition and listeners are removed afterwards',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const listeners=new Set();
 const permission={state:'prompt',
  addEventListener(type,handler){if(type==='change')listeners.add(handler);},
  removeEventListener(type,handler){if(type==='change')listeners.delete(handler);}
 };
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  platform:'iPhone',maxTouchPoints:5,onLine:true,
  permissions:{query:async()=>permission}
 }});
 try{
  let resolvePosition;
  const pending=captureAttendanceGeo({getCurrentPosition(ok){resolvePosition=ok;}},
   {diagnosticContext:{action:'clock-in'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(listeners.size,1);
  permission.state='granted';
  for(const listener of listeners)listener();
  resolvePosition(position());
  await pending;
  assert.ok(getTimeTrackerGpsDiagnostics().events.some(event=>
   event.phase==='permission-state-change'&&event.permissionState==='granted'));
  assert.equal(listeners.size,0);
 }finally{
  if(original)Object.defineProperty(globalThis,'navigator',original);
  else delete globalThis.navigator;
 }
});

test('diagnostic environment access failures never interrupt the browser GPS request',async()=>{
 const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'navigator',{configurable:true,get(){throw new Error('navigator unavailable');}});
 Object.defineProperty(globalThis,'document',{configurable:true,get(){throw new Error('document unavailable');}});
 try{
  const fix=await captureAttendanceGeo({getCurrentPosition(ok){ok(position());}},
   {diagnosticContext:{action:'clock-in'}});
  assert.equal(fix.status,'captured');
  assert.ok(getTimeTrackerGpsDiagnostics().events.some(event=>event.phase==='capture-success'));
 }finally{
  if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);
  else delete globalThis.navigator;
  if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);
  else delete globalThis.document;
 }
});

test('missing geolocation API is recorded without starting an attendance attempt',async()=>{
 await assert.rejects(()=>captureAttendanceGeo(null,{diagnosticContext:{action:'clock-in'}}),
  error=>error.code==='TT_GEO_UNAVAILABLE');
 const events=getTimeTrackerGpsDiagnostics().events;
 assert.ok(events.some(event=>event.phase==='capture-precondition-failed'&&
  event.reason==='geolocation-api-missing'));
 assert.equal(events.some(event=>event.phase==='attempt-start'),false);
});

test('lifecycle observation records foreground, visibility and network transitions then detaches',()=>{
 const makeTarget=()=>{
  const listeners=new Map();
  return {
   listeners,
   addEventListener(type,handler){
    if(!listeners.has(type))listeners.set(type,new Set());
    listeners.get(type).add(handler);
   },
   removeEventListener(type,handler){listeners.get(type)?.delete(handler);},
   dispatch(type){
    for(const handler of listeners.get(type)||[])handler({type});
   }
  };
 };
 const documentTarget=makeTarget();
 documentTarget.visibilityState='visible';
 const windowTarget=makeTarget();
 const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'document',{configurable:true,value:documentTarget});
 Object.defineProperty(globalThis,'window',{configurable:true,value:windowTarget});
 try{
  const captureId=beginTimeTrackerGpsCapture('clock-in');
  const stop=observeTimeTrackerGpsLifecycle('clock-in',captureId);
  documentTarget.visibilityState='hidden';
  documentTarget.dispatch('visibilitychange');
  windowTarget.dispatch('offline');
  windowTarget.dispatch('focus');
  stop();
  const events=getTimeTrackerGpsDiagnostics().events;
  assert.ok(events.some(event=>event.phase==='lifecycle-visibility'&&event.result==='hidden'));
  assert.ok(events.some(event=>event.phase==='lifecycle-network'&&event.result==='offline'));
  assert.ok(events.some(event=>event.phase==='lifecycle-focus'&&event.result==='focused'));
  assert.equal([...documentTarget.listeners.values()].flatMap(set=>[...set]).length,0);
  assert.equal([...windowTarget.listeners.values()].flatMap(set=>[...set]).length,0);
 }finally{
  if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);
  else delete globalThis.document;
  if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);
  else delete globalThis.window;
 }
});

test('diagnostic buffer is bounded and only exports approved operational fields',()=>{
 for(let index=0;index<80;index++)
  recordTimeTrackerGpsDiagnostic({phase:'test-event',action:'clock-in',reason:'test'});
 const report=getTimeTrackerGpsDiagnostics();
 assert.equal(report.events.length,60);
 assert.equal(report.events[0].phase,'test-event');
 const serialized=exportTimeTrackerGpsDiagnostics();
 assert.doesNotMatch(serialized,/userId|workspaceId|boardId|latitude|longitude|workNote|email/i);
});

test('Clock UI exposes local diagnostic export only when diagnostics exist',()=>{
 const result={
  status:'VERIFIED_READ',
  access:{moduleRole:'Employee',attendanceWritesAccepted:true,
   employeeDepartment:'Information Technology',email:'member@example.test'},
  records:[],active:null,otRequests:[],autoClockoutUnavailable:false
 };
 const html=renderTimeTrackerNative({result,view:'clock',gpsDiagnosticsAvailable:true});
 assert.match(html,/Copy GPS diagnostics/);
 assert.match(html,/Precise coordinates are excluded/);
 const hidden=renderTimeTrackerNative({result,view:'clock',gpsDiagnosticsAvailable:false});
 assert.doesNotMatch(hidden,/Copy GPS diagnostics/);
});

test('Clock submit and automatic clock-out paths expose diagnostic stages without changing write flow',()=>{
 assert.match(app,/phase:submitter\?'submit-event':'submitter-missing'/);
 assert.match(app,/phase:'attendance-submit'/);
 assert.match(app,/phase:'attendance-commit-start'/);
 assert.match(app,/phase:'attendance-commit-success'/);
 assert.match(app,/phase:'attendance-readback-success'/);
 assert.match(automatic,/diagnosticContext:\{action:'automatic-clock-out'\}/);
 assert.match(automatic,/phase:'attendance-commit-start'/);
 assert.match(automatic,/phase:'attendance-commit-success'/);
});
