import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const css=readFileSync('frontend/dark-native-refinements.css','utf8');
test('native dark refinements are final and bundled deterministically',()=>{
 assert.equal(STYLE_SOURCES.at(-5),'frontend/dark-native-refinements.css');
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 assert.match(readFileSync('index.html','utf8'),/bundle\.css\?v=(?:cp-crm-dark-07|(?:cp-crm-dark-08|(?:cp-crm-dark-09|(?:cp-crm-ui-restore-01|cp-mobile-workspace-switch-01))))/);
});
test('native GPS, My Hours and TradeLink finance controls have screen-only dark treatments',()=>{
 for(const selector of ['.tt-gps-controls','.tt-gps-map-stats','.tt-gps-map-modes',
  '.tt-gps-map-zoom','.tt-gps-kpis .tt-gps-kpi','.tt-hours-week-nav',
  '.tt-hours-kpis>div','.tl-draft-finance-results>div','.tl-draft-summary-rows>div',
  '.tl-analytics-kpis article','.tl-finance-fields input',':focus-visible',
  'prefers-reduced-motion'])assert.ok(css.includes(selector),selector);
 assert.match(css,/^\/\* CP-CRM-DARK-07[^]*@media screen \{/);
 assert.doesNotMatch(css,/!important|@import|@keyframes|javascript:|auth\.uid|supabase|fetch\(/i);
 assert.doesNotMatch(css,/\.leaflet-(?:tile|container)|\.tl-official-|tl-print-|@media print/i);
});
