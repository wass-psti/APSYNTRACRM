import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const css=readFileSync('frontend/dark-workspace-account-completion.css','utf8');
test('workspace and account completion CSS is final deterministic layer',()=>{
 assert.equal(STYLE_SOURCES.at(-5),'frontend/dark-workspace-account-completion.css');
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 assert.match(readFileSync('index.html','utf8'),/bundle\.css\?v=(?:cp-crm-dark-09|(?:cp-crm-ui-restore-01|cp-mobile-workspace-switch-01))/);
});
test('dark-only workspace dialogs, workspace privacy and account controls are covered',()=>{
 for(const s of ['.ws01-menu-card','.ws01-browser-card','.ws01-create-card',
  '.ws01-browser-tabs','.ws01-browser-results .ws01-note','.ws01-create-intro',
  '.ws01-create-card fieldset label:has(input:checked)',
  '.ws01-create-card fieldset label:has(input:disabled)',
  '#settings-avatar-file','.settings-avatar-gate','.settings-password-field input',
  '.settings-password-submit','.settings-token-warning','.settings-session-actions .settings-token-button',
  ':focus-visible','prefers-reduced-motion'])assert.ok(css.includes(s),`Missing ${s}`);
 assert.match(css,/@media screen/);
 assert.doesNotMatch(css,/@import|@keyframes|javascript:|auth\.uid|fetch\(/i);
});
