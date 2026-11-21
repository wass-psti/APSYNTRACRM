import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const css=readFileSync('frontend/uiverse-native-workflows.css','utf8');

test('native visual layer follows original shared tokens and retains one CSS bundle',()=>{
 assert.deepEqual(STYLE_SOURCES.slice(-10,-8),[
  'frontend/uiverse-design-system.css','frontend/uiverse-native-workflows.css']);
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 const html=readFileSync('index.html','utf8');
 assert.match(html,/apsyntra-styles\.bundle\.css\?v=(?:cp-crm-ui-redesign-02|(?:cp-crm-dark-0[1234]|(?:cp-crm-dark-invite-01|(?:cp-crm-dark-05|cp-crm-dark-06))))/);
 assert.match(html,/frontend\/uiverse-native-workflows\.css/);
 assert.equal((html.match(/<link rel="stylesheet"/g)||[]).length,1);
});

test('module-specific controls and panels are covered without overriding their brands',()=>{
 for(const selector of [
  '.tl-draft-field', '.tl-draft-actions', '.tl-records-table',
  '.tt-nav-tab.fm1-tab', '.frt-ref-table-card', '.frt-native',
  '.ft3-soft-action', '.ft3-recent-table', '.tb-app .tb-filter',
  '.tb-app .tb-drawer', '.board-table-custom', '.board-bulk-toolbar'
 ])assert.ok(css.includes(selector),`Missing module styling: ${selector}`);
 assert.match(css, /:focus-visible/);
 assert.match(css, /:focus-within/);
 assert.match(css, /prefers-reduced-motion: reduce/);
 assert.match(css, /max-width: 720px/);
 assert.match(css, /data-aps-monday-theme="dark"/);
});

test('visual-only update does not change data, board geometry or backend behavior',()=>{
 assert.doesNotMatch(css,/!important|@import|@keyframes|javascript:|expression\(|animation\s*:/i);
 assert.doesNotMatch(css,/position\s*:\s*(?:fixed|absolute)|overflow-x\s*:\s*hidden|pointer-events\s*:\s*none/i);
 assert.doesNotMatch(css,/auth\.uid|service_role|supabase|fetch\(|\bRLS\b/i);
 assert.doesNotMatch(css,/(?:^|[;{])\s*(?:height|min-height|width)\s*:\s*\d+px/im);
});
