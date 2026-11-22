import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const css=readFileSync('frontend/dark-search-settings.css','utf8');
test('settings and search dark CSS is final deterministic layer',()=>{
 assert.equal(STYLE_SOURCES.at(-6),'frontend/dark-search-settings.css');
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 assert.match(readFileSync('index.html','utf8'),/bundle\.css\?v=(?:cp-crm-dark-06|(?:cp-crm-dark-07|(?:cp-crm-dark-08|(?:cp-crm-dark-09|(?:cp-crm-ui-restore-01)))))/);
});
test('search dialog, native details and settings receive scoped dark surfaces',()=>{
 for(const marker of ['.aps-global-search-dialog','.aps-global-search-option.is-active',
  '.aps-global-search-input-wrap:focus-within','.native-search-detail-drawer',
  '.native-search-detail-field','.aps-settings-shell',
  '.settings-session-callout','.settings-token-warning',
  '.settings-verify-block .csp-u048','.settings-session-actions button',
  'prefers-reduced-motion'])assert.ok(css.includes(marker),marker);
 assert.doesNotMatch(css,/@import|@keyframes|javascript:|auth\.uid|supabase|fetch\(/i);
});
