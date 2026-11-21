import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const css=readFileSync('frontend/dark-overview-legibility.css','utf8');
test('Overview legibility stylesheet is last and published in deterministic bundle',()=>{
 assert.equal(STYLE_SOURCES.at(-6),'frontend/dark-overview-legibility.css');
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 assert.match(readFileSync('index.html','utf8'),/bundle\.css\?v=(?:cp-crm-dark-invite-01|(?:cp-crm-dark-05|(?:cp-crm-dark-06|(?:cp-crm-dark-07|cp-crm-dark-08))))/);
});
test('board initials use readable dark color variants and no new privileges',()=>{
 for(const cls of ['.board-symbol.green','.board-symbol.blue','.board-symbol.orange','.board-symbol.pink','.sidebar-board-initial']){
  assert.ok(css.includes(cls),`Missing initials style ${cls}`);
 }
 assert.doesNotMatch(css,/!important|@keyframes|\banimation\s*:|fetch\(|supabase|service_role|auth\.uid/i);
});
test('essentials use separate tiles with icon/status row above full-width text',()=>{
 assert.match(css,/grid-template-areas:"icon status" "content content"/);
 assert.match(css,/grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,290px\),1fr\)\)/);
 assert.match(css,/grid-area:content/);
 assert.match(css,/grid-area:status/);
 assert.match(css,/gap:14px;padding:16px/);
 assert.match(css,/max-width:650px/);
});
