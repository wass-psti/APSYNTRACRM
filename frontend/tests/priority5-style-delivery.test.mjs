import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const index=readFileSync('index.html','utf8');
const source=readFileSync(STYLE_BUNDLE,'utf8');
test('Priority 5 preserves the exact-order consolidated CSS bundle',()=>{
 assert.ok(STYLE_SOURCES.length>=50);
 assert.ok(STYLE_SOURCES.includes("frontend/global-search.css"));
 assert.ok(STYLE_SOURCES.includes("frontend/fm1-application.css"));
 assert.ok(STYLE_SOURCES.includes("frontend/time-tracker-application.css"));
 assert.ok(STYLE_SOURCES.includes("frontend/frt-collaboration.css"));
 assert.ok(STYLE_SOURCES.includes("frontend/frt-voucher.css"));
 assert.equal(new Set(STYLE_SOURCES).size,STYLE_SOURCES.length);
 assert.equal((index.match(/<link rel="stylesheet"/g)||[]).length,1);
 assert.match(index,/href="\.\/frontend\/apsyntra-styles\.bundle\.css(?:\?v=[a-z0-9-]+)?"/);
 for(let i=0;i<STYLE_SOURCES.length;i++){
  const path=STYLE_SOURCES[i];
  // Application-owned source folders may use the existing PascalCase app name.
  // Keep root/other source paths on the original restrictive lowercase rule.
  assert.ok(
   /^frontend\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.css$/.test(path) ||
   /^frontend\/apps\/[A-Z][A-Za-z0-9-]*\/[a-z0-9-]+\.css$/.test(path),
   'Unexpected CSS source path: '+path
  );
  assert.equal(readFileSync(path,'utf8').match(/@import|@charset|url\(/g),null,
   path+' requires explicit reviewed URL/import handling before concatenation');
  assert.ok(index.includes(path),'CSS source provenance missing from index: '+path);
  if(i>0)assert.ok(index.indexOf(path)>index.indexOf(STYLE_SOURCES[i-1]),
   'CSS manifest order drifted in HTML: '+path);
 }
 assert.equal(source,generateStyleBundle(),'committed CSS bundle must match every source exactly');
});
test('Priority 5 preserves restrictive CSP, existing source modules and Pages source verification',()=>{
 const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
 const verify=readFileSync('scripts/verify-pages-source.mjs','utf8');
 assert.ok(smoke.includes(STYLE_BUNDLE));
 assert.match(index,/style-src-attr 'none'/);
 assert.match(index,/<script type="module" src="\.\/frontend\/app\.js"><\/script>/);
 assert.match(verify,/Public|Pages-first static asset graph|https/);
 assert.doesNotMatch(source,/@import\b|url\(/);
});
