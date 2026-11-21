import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const css=readFileSync('frontend/visual-transformation.css','utf8');
const app=readFileSync('frontend/app.js','utf8');

test('new visual transformation is the final deterministic CSS layer',()=>{
 assert.equal(STYLE_SOURCES.at(-1),'frontend/visual-transformation.css');
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 assert.match(readFileSync('index.html','utf8'),/apsyntra-styles\.bundle\.css\?v=cp-crm-ui-redesign-03/);
 assert.equal(new Set(STYLE_SOURCES).size,STYLE_SOURCES.length);
});
test('actual Overview markup has a two-column command center and a role-conditional insight rail',()=>{
 for(const token of ['overview-hero-index','overview-command-grid','overview-command-grid-full',
  'overview-insight-rail','overview-board-section','overview-stat-grid',
  'aria-label="Workspace status and essentials"'])
  assert.ok(app.includes(token),`Missing page structure ${token}`);
 assert.match(app,/data-action="refresh"/);
 assert.match(app,/data-action="new-board"/);
 assert.match(app,/href="#\/boards"/);
});
test('specificity fix overrides legacy minimalist shell instead of cosmetic tokens',()=>{
 for(const selector of [
  '#app .aps-overview-shell .aps-overview .overview-hero',
  '#app .aps-overview-shell .aps-overview .overview-stat-grid .stat-card',
  '#app .aps-overview-shell .aps-overview .overview-board-grid .board-card',
  '#app .aps-overview-shell .aps-overview .overview-essentials',
  '#app .aps-overview-shell .aps-overview .overview-command-grid',
  '#app .aps-sidebar .nav-link.active',
 ])assert.ok(css.includes(selector),`Missing visual override ${selector}`);
 assert.match(css, /background:linear-gradient\(170deg,#111d33/);
 assert.match(css, /grid-template-columns:minmax\(0,1fr\) minmax\(255px,300px\)/);
 assert.match(css, /max-width:740px/);
 assert.match(css, /prefers-reduced-motion:reduce/);
});
test('design does not modify authorization or introduce runtime dependencies',()=>{
 assert.doesNotMatch(css, /@import|javascript:|expression\(|@keyframes|fetch\(|auth\.uid|supabase\.rpc/i);
 assert.doesNotMatch(css, /pointer-events\s*:\s*none\s*!important/i);
 assert.doesNotMatch(app.slice(app.indexOf('function overview(){'),app.indexOf('function boardsPage(){')),
  /grant\s+|alter\s+role|setSession\(/i);
});
