import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';

const source=readFileSync('frontend/uiverse-design-system.css','utf8');

test('single shared Uiverse visual layer comes after module styles without duplicating CSS requests',()=>{
 assert.equal(STYLE_SOURCES.at(-15),'frontend/uiverse-design-system.css');
 assert.equal(new Set(STYLE_SOURCES).size,STYLE_SOURCES.length);
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 const html=readFileSync('index.html','utf8');
 assert.match(html,/apsyntra-styles\.bundle\.css\?v=(?:cp-crm-ui-redesign-0[12]|(?:cp-crm-dark-0[1234]|(?:cp-crm-dark-invite-01|(?:cp-crm-dark-05|(?:cp-crm-dark-06|(?:cp-crm-dark-07|(?:cp-crm-dark-08|(?:cp-crm-dark-09|cp-crm-boards-overhaul-01))))))))/);
 assert.match(html,/frontend\/uiverse-design-system\.css/);
 assert.equal((html.match(/<link rel="stylesheet"/g)||[]).length,1);
});

test('visual tokens and shared component families cover navigation, controls, overlays and modules',()=>{
 for(const fragment of ['--uv-accent:', '--uv-radius-control:', '--uv-shadow:',
  '.aps-sidebar .nav-link', '.primary', '.secondary', '.field input',
  '.board-card', '.board-group-panel', '.fm1-app .fm1-panel',
  '.tl-reference-portal .tl-draft-panel', '.tb-panel', '.modal',
  '.aps-action-popover', '.toast', '[role="menuitem"]',
  '.ws01-details-card', '.aps-role-config-shell .panel', '.aps-global-search-dialog',
  '.aps-auth-v2'])
  assert.ok(source.includes(fragment),`Missing shared design coverage: ${fragment}`);
 assert.match(source,/:focus-visible/);
 assert.match(source, /prefers-reduced-motion: reduce/);
 assert.match(source, /max-width: 720px/);
 assert.match(source, /data-aps-monday-theme="dark"/);
});

test('visual-only redesign preserves route, security and geometry invariants',()=>{
 assert.doesNotMatch(source, /@import|@keyframes|javascript:|expression\(|!important|\banimation\s*:/i);
 assert.doesNotMatch(source, /position\s*:\s*(?:fixed|absolute)|overflow-x\s*:\s*hidden|pointer-events\s*:\s*none/i);
 assert.doesNotMatch(source, /auth\.uid|RLS|grant\s+|service_role|supabase|fetch\(/i);
 assert.doesNotMatch(source, /height\s*:\s*\d+px|min-height\s*:\s*\d+px/i);
 assert.ok(!readFileSync('package.json','utf8').includes('uiverse'),
  'Uiverse components must not add runtime package dependencies');
});
