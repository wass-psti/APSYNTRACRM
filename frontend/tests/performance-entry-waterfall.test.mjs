import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeEntryWaterfall} from '../performance-entry-waterfall.js';
const entry=(name,startTime,responseEnd,decodedBodySize=100)=>({name,startTime,responseEnd,decodedBodySize});
const origin='https://wass-psti.github.io';
test('fixed numeric waterfall counts only same-origin public resources completed before entry',()=>{
 const entries=[
  entry(origin+'/APSYNTRACRM/frontend/app.js?token=TOP_SECRET',12,230,1000),
  entry(origin+'/APSYNTRACRM/frontend/data.js',20,260,500),
  entry(origin+'/APSYNTRACRM/frontend/apsyntra-styles.bundle.css',15,180,800),
  entry(origin+'/APSYNTRACRM/frontend/apsyntra-logo.webp',18,90,50),
  entry(origin+'/APSYNTRACRM/frontend/later.js',270,500,1000),
  entry('https://jtlusodorfnyzgyuewkz.supabase.co/rest/v1/secret',20,220,900),
  entry(origin+'/APSYNTRACRM/api/private.js',20,240,900),
  entry(origin+'/APSYNTRACRM/frontend/invalid.js',20,400,900),
  entry(origin+'/APSYNTRACRM/storage/personal.jpg',20,210,900)
 ];
 const result=summarizeEntryWaterfall({performanceRef:{getEntriesByType:type=>{
  assert.equal(type,'resource');return entries}},origin,entryMs:300});
 assert.deepEqual(result,{entryMs:300,resourceCount:4,
  groups:{javascript:{count:2,decodedBytes:1500,latestEndMs:260,latestStartMs:20,latestResponseStartMs:20,latestResponseDurationMs:240},
   stylesheet:{count:1,decodedBytes:800,latestEndMs:180,latestStartMs:15,latestResponseStartMs:15,latestResponseDurationMs:165},
   other:{count:1,decodedBytes:50,latestEndMs:90,latestStartMs:18,latestResponseStartMs:18,latestResponseDurationMs:72}},
  afterLatestPublicResourceMs:40,
  scope:'same-origin public frontend resources completed before app entry'});
 assert.doesNotMatch(JSON.stringify(result),/token|TOP_SECRET|supabase|personal|private|app\.js/);
});
test('unsupported timing, invalid entries, negative and cross-origin data fail closed',()=>{
 assert.equal(summarizeEntryWaterfall({origin,entryMs:null}),null);
 assert.equal(summarizeEntryWaterfall({origin,entryMs:-1}),null);
 assert.equal(summarizeEntryWaterfall({origin,entryMs:10,performanceRef:{}}),null);
 assert.equal(summarizeEntryWaterfall({origin,entryMs:10,performanceRef:{getEntriesByType:()=>{throw Error('privacy')}}}),null);
 const result=summarizeEntryWaterfall({origin,entryMs:200,
  performanceRef:{getEntriesByType:()=>[
   entry('https://private.invalid/frontend/app.js',1,100),
   entry(origin+'/APSYNTRACRM/frontend/late.js',50,240),
   entry(origin+'/APSYNTRACRM/frontend/malformed.js',-1,50),
   entry(origin+'/APSYNTRACRM/frontend/odd.css',60,55),
   entry(origin+'/APSYNTRACRM/frontend/valid.js',20,120,NaN)
  ]}});
 assert.equal(result.resourceCount,1);
 assert.equal(result.groups.javascript.decodedBytes,0);
 assert.equal(result.afterLatestPublicResourceMs,80);
});
test('timing scope capped at 300 entries; does not retain resource records',()=>{
 const resources=Array.from({length:500},(_,n)=>entry(origin+'/frontend/file-'+n+'.js',2,10,200));
 const result=summarizeEntryWaterfall({origin,entryMs:100,
  performanceRef:{getEntriesByType:()=>resources}});
 assert.equal(result.resourceCount,300);
 assert.equal(result.groups.javascript.decodedBytes,60000);
 assert.doesNotMatch(JSON.stringify(result),/file-299/);
});
test('signed settings displays read-only waterfall only after valid signed startup snapshot',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/entryWaterfall:startup\?summarizeEntryWaterfall\(\{entryMs:startup\.entryFromNavigationMs\}\):null/);
 assert.match(app,/report\?\.entryWaterfall\?/);
 assert.match(app,/No URLs, account data or RPC requests collected/);
 const source=readFileSync('frontend/performance-entry-waterfall.js','utf8');
 assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|PerformanceObserver|setInterval/);
});

test('last-completing request timing is distinct from latest request discovery',()=>{
 const result=summarizeEntryWaterfall({origin,entryMs:500,
  performanceRef:{getEntriesByType:()=>[
   entry(origin+'/frontend/long.js?secret=HIDDEN',20,420),
   entry(origin+'/frontend/late.js',350,390),
   entry(origin+'/frontend/style.css',40,60)
  ]}});
 assert.equal(result.groups.javascript.latestStartMs,350);
 assert.equal(result.groups.javascript.latestEndMs,420);
 assert.equal(result.groups.javascript.latestResponseStartMs,20);
 assert.equal(result.groups.javascript.latestResponseDurationMs,400);
 assert.doesNotMatch(JSON.stringify(result),/HIDDEN|long\.js|late\.js/);
});
