import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const css=readFileSync('frontend/dark-overview-legibility.css','utf8');
test('Overview legibility stylesheet is last and published in deterministic bundle',()=>{
 assert.equal(STYLE_SOURCES.at(-1),'frontend/dark-overview-legibility.css');
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 assert.match(readFileSync('index.html','utf8'),/bundle\.css\?v=cp-crm-dark-04/);
});
test('board initials use readable dark color variants and no new privileges',()=>{
 for(const cls of ['.board-symbol.green','.board-symbol.blue','.board-symbol.orange','.board-symbol.pink','.sidebar-board-initial']){
  assert.ok(css.includes(cls),`Missing initials style ${cls}`);
 }
 assert.doesNotMatch(css,/!important|@keyframes|\banimation\s*:|fetch\(|supabase|service_role|auth\.uid/i);
});
test('essentials content is isolated from icons and responsive at narrow widths',()=>{
 assert.match(css,/grid-template-columns:34px minmax\(0,1fr\) 19px/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.match(css,/max-width:1150px/);
 assert.match(css,/max-width:420px/);
});
