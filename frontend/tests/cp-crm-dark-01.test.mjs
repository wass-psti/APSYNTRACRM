import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const css=readFileSync('frontend/dark-theme-foundation.css','utf8');

test('semantic dark layer is last in the deterministic single stylesheet',()=>{
 assert.equal(STYLE_SOURCES.at(-13),'frontend/dark-theme-foundation.css');
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 const html=readFileSync('index.html','utf8');
 assert.match(html,/apsyntra-styles\.bundle\.css\?v=(?:cp-crm-dark-0[1234]|(?:cp-crm-dark-invite-01|(?:cp-crm-dark-05|(?:cp-crm-dark-06|(?:cp-crm-dark-07|(?:cp-crm-dark-08|(?:cp-crm-dark-09|cp-crm-item-details-overlay-01)))))))/);
 assert.match(html,/frontend\/dark-theme-foundation\.css/);
 assert.equal((html.match(/<link rel="stylesheet"/g)||[]).length,1);
});
test('tokens and dark workspace/dialog layers cover the confirmed inconsistencies',()=>{
 for(const field of ['--crm-dark-canvas:','--crm-dark-sidebar:','--crm-dark-surface:',
  '--crm-dark-hover:','--crm-dark-text:','--crm-dark-muted:',
  '--crm-dark-border:','--crm-dark-focus:',
  '.ws01-menu-card','.ws01-browser-card','.ws01-details-card','.ws01-create-card',
  '.ws01-browser-tabs','.ws01-entry-copy strong','.ws01-create-safety',
  '.ws01-switcher-button','.nav-link.active',':focus-visible'])
  assert.ok(css.includes(field),`Missing dark-mode coverage: ${field}`);
 assert.match(css, /prefers-reduced-motion: reduce/);
});
test('dark layer is explicitly scoped and does not change geometry or workflows',()=>{
 for(const rule of css.split('}').filter(s=>s.trim()&&s.includes('{'))){
  const selectors=rule.slice(0,rule.indexOf('{')).trim();
  if(selectors.startsWith('/*'))continue;
  for(const selector of selectors.split(','))
   assert.ok(selector.trim().startsWith('html[data-aps-monday-theme="dark"]')||
    !selector.trim().startsWith('#app'),`Unexpected global light-mode selector: ${selector}`);
 }
 assert.doesNotMatch(css, /!important|@import|@keyframes|javascript:|expression\(|\banimation\s*:/i);
 assert.doesNotMatch(css, /position\s*:\s*(?:fixed|absolute)|overflow-x\s*:\s*hidden|pointer-events\s*:\s*none/i);
 assert.doesNotMatch(css, /auth\.uid|service_role|supabase|fetch\(|\bRLS\b/i);
 assert.doesNotMatch(css, /(?:^|[;{])\s*(?:height|min-height|width)\s*:\s*\d+px/im);
});
