/** Temporary Annotate compatibility CSP regression.
 * Permit inline stylesheet rules only; continue blocking inline script execution,
 * inline style attributes, and application CSSOM style injection.
 * Remove the temporary exception once the desktop annotation overlay is fixed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const css=readFileSync('frontend/styles.css','utf8');
const html=readFileSync('index.html','utf8');
test('temporary annotation-only CSS exception preserves other CSP protections',()=>{
 const meta=html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"\/>/);
 assert.ok(meta,'CSP must remain present in the main HTML document');
 const directives=Object.fromEntries(meta[1].split(';').map(d=>d.trim()).filter(Boolean)
  .map(d=>{const [name,...values]=d.split(/\s+/);return [name,values]}));
 assert.deepEqual(directives['style-src'],["'self'","'unsafe-inline'",'https://unpkg.com']);
 assert.deepEqual(directives['style-src-attr'],["'none'"]);
 assert.deepEqual(directives['script-src'],["'self'",'https://unpkg.com']);
 assert.deepEqual(directives['default-src'],["'self'"]);
 assert.deepEqual(directives['object-src'],["'none'"]);
 assert.deepEqual(directives['img-src'],["'self'",'data:','blob:','https://tile.openstreetmap.org']);
 assert.deepEqual(directives['font-src'],["'self'"]);
 assert.deepEqual(directives['worker-src'],["'self'"]);
 assert.deepEqual(directives['frame-src'],["'none'"]);
 assert.deepEqual(directives['base-uri'],["'self'"]);
 assert.deepEqual(directives['form-action'],["'self'"]);
 assert.deepEqual(directives['connect-src'],["'self'",'https://jtlusodorfnyzgyuewkz.supabase.co',
  'wss://jtlusodorfnyzgyuewkz.supabase.co','https://unpkg.com']);
 assert.equal((meta[1].match(/'unsafe-inline'/g)||[]).length,1,'only style-src may allow inline styling');
 assert.doesNotMatch(meta[1],/unsafe-eval|unsafe-hashes|\*/);
});
test('frontend generated markup never uses blocked inline styles or CSSOM injection',()=>{
 for(const file of readdirSync('frontend').filter(x=>x.endsWith('.js'))){
  const source=readFileSync('frontend/'+file,'utf8');
  assert.doesNotMatch(source,/\bstyle\s*=\s*(?:["']|\x60)/,'blocked inline style in '+file);
  assert.doesNotMatch(source,/\.style\s*\.|\.style\s*=|\.cssText\s*=|setAttribute\s*\(\s*["']style["']/,'runtime style injection in '+file);
  for(const m of source.matchAll(/\bcsp-u\d{3}\b/g)){
   assert.ok(css.includes('#app .'+m[0]+'{'),'missing scoped same-origin CSS for '+m[0]+' in '+file);
  }
 }
});
test('dynamic acceptance check status uses named CSS classes',()=>{
 const code=readFileSync('frontend/app.js','utf8');
 for(const name of ['csp-check-pass','csp-check-fail','csp-check-pending']){
  assert.match(code,new RegExp(name));
  assert.match(css,new RegExp('#app \\.'+name+'\\{'));
 }
});

test('Leaflet migration loads approved pinned script and standard OSM raster tiles',()=>{
 const map=readFileSync('frontend/time-tracker-map.js','utf8');
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(map,/leaflet@1\.9\.4/);
 assert.match(map,/https:\/\/tile\.openstreetmap\.org/);
 assert.doesNotMatch(map,/maplibre-gl|tiles\.openfreemap\.org|innerHTML|setHTML\(/);
 assert.match(app,/state\.ttAttendance\?\.status!=='VERIFIED_READ'/);
 assert.match(app,/case 'tt-map-retry'/);
});
