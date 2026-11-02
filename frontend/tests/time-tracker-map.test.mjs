import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {signedMapPoints,mapGeoJSON,mapLineGeoJSON,mapFrame,mountTimeTrackerMaps,
 disposeTimeTrackerMaps,TT_MAPLIBRE_URL,TT_MAP_STYLE} from '../time-tracker-map.js';

const inFix={userId:'member-1',recordId:'shift-1',kind:'in',
 timestamp:'2026-11-02T10:00:00Z',latitude:9.55,longitude:123.45,accuracyM:12};
const outFix={...inFix,kind:'out',timestamp:'2026-11-02T17:00:00Z',
 latitude:10.25,longitude:123.85};
const signed={actorId:'bootstrap',boardId:'tt-board',workspaceId:'tt-workspace',
 ranges:[{from:'2026-11-02',to:'2026-11-03'}],
 events:[inFix,outFix,{...inFix,userId:'foreign',recordId:'other-shift'}]};
test('signed geographic overlays are scoped to the attendance record and PHT evidence window',()=>{
 const selected=signedMapPoints(signed,{type:'log',record:{id:'shift-1',ownerId:'cloud:member-1'}});
 assert.equal(selected.length,2);
 assert.equal(signedMapPoints(signed,{type:'log',record:{id:'shift-1',ownerId:'cloud:other'}}).length,0);
 assert.equal(signedMapPoints({...signed,ranges:[]},{type:'log',
  record:{id:'shift-1',ownerId:'cloud:member-1'}}).length,0);
 const data=mapGeoJSON(selected);
 assert.deepEqual(data.features[0].geometry.coordinates,[123.45,9.55]);
 assert.equal(data.features[1].properties.kind,'out');
 assert.doesNotMatch(JSON.stringify(data),/member-1|bootstrap|tt-workspace/);
 const line=mapLineGeoJSON(selected);
 assert.equal(line.features.length,1);
 assert.deepEqual(line.features[0].geometry.coordinates,[[123.45,9.55],[123.85,10.25]]);
 assert.match(line.features[0].properties.note,/not a traveled route/);
 assert.equal(mapLineGeoJSON([inFix]).features.length,0);
});
test('opt-in map does not trigger tile requests during signed TimeTracker loading',async()=>{
 assert.match(mapFrame({hasPoints:true,enabled:false,scope:'hub'}),/data-action="tt-map-enable"/);
 assert.doesNotMatch(mapFrame({hasPoints:true,enabled:false}),/data-map-scope="hub"/);
 assert.match(mapFrame({hasPoints:true,enabled:true,scope:'log'}),/data-map-scope="log"/);
 assert.doesNotMatch(mapFrame({hasPoints:false,enabled:true}),/data-map-scope/);
 assert.match(TT_MAPLIBRE_URL,/maplibre-gl@6\.16\.0/);
 assert.match(TT_MAP_STYLE.map,/tiles\.openfreemap\.org/);
 // Calling the lifecycle under Node cannot initialize a map or perform network I/O.
 await mountTimeTrackerMaps(null,[]);
 disposeTimeTrackerMaps();
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/case 'tt-map-enable'/);
 assert.match(app,/timeTrackerSignedMapConfigs/);
 assert.match(app,/disposeTimeTrackerMaps\(\)/);
 assert.match(app,/mountSignedTimeTrackerMaps/);
 assert.match(app,/state\.ttAttendance\?\.status!=='VERIFIED_READ'/);
 const index=readFileSync('index.html','utf8');
 assert.match(index,/worker-src 'self' blob:/);
 assert.match(index,/script-src 'self' https:\/\/unpkg.com/);
 assert.match(index,/connect-src 'self' https:\/\/jtlusodorfnyzgyuewkz\.supabase\.co/);
});

test('nonessential signed TimeTracker reads are concurrent but access checks remain first',()=>{
 const native=readFileSync('frontend/time-tracker-native.js','utf8');
 const body=native.slice(native.indexOf('async snapshot(boardId){'),
  native.indexOf('async teamDirectory(boardId){'));
 assert.match(body,/const access=await this\.access\(boardId\)/);
 assert.match(body,/const otRead=this\.api\.rpc\('timetracker_ot_snapshot'/);
 assert.match(body,/const clockRead=this\.attendanceCapability\(boardId,access\)/);
 assert.match(body,/const raw=await this\.api\.rpc\('list_module_state'/);
 assert.ok(body.indexOf('const access=await')<body.indexOf('const otRead='));
 assert.ok(body.indexOf('const otRead=')<body.indexOf('const raw=await'));
 assert.match(body,/await checkIdentity\(this\.auth,this\.api,access,boardId\)/);
 const map=readFileSync('frontend/time-tracker-map.js','utf8');
 assert.match(map,/map\.on\('style\.load'/);
 assert.match(map,/map\.setStyle\(FALLBACK_STYLE/);
 assert.doesNotMatch(map,/map\.on\('error',\(\)=>showMessage/);
});

test('default street map is identity-bound and nonprivileged views never initialize',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/mapEnabled:auth\.isSignedIn&&state\.ttAttendance\?\.status==='VERIFIED_READ'/);
 assert.match(app,/void mountSignedTimeTrackerMaps\(\)/);
 assert.doesNotMatch(app,/if\(state\.ttMapConsent\)void mountSignedTimeTrackerMaps/);
 assert.match(app,/state\.ttAttendance\.access\?\.moduleRole==='Supervisor'/);
 assert.match(app,/case 'tt-map-retry'/);
 assert.match(app,/setTimeTrackerMapTheme\(theme\)/);
 assert.match(app,/Date\.now\(\)-state\.ttLogGpsCacheAt<15000/);
 assert.match(app,/Date\.now\(\)-state\.ttGpsCacheAt<15000/);
 const module=readFileSync('frontend/time-tracker-map.js','utf8');
 assert.match(module,/map\.on\('style\.load'/);
 assert.match(module,/map\.setStyle\(FALLBACK_STYLE/);
 assert.match(module,/export function setTimeTrackerMapTheme/);
 assert.match(module,/export async function retryTimeTrackerMaps/);
 assert.doesNotMatch(module,/map\.on\('load'/);
});
