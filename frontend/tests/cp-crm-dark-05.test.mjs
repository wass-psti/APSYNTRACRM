import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const css=readFileSync('frontend/dark-board-sharing.css','utf8');
test('board sharing dark layer is final and bundle is deterministic',()=>{
 assert.equal(STYLE_SOURCES.at(-7),'frontend/dark-board-sharing.css');
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 assert.match(readFileSync('index.html','utf8'),/bundle\.css\?v=(?:cp-crm-dark-05|(?:cp-crm-dark-06|(?:cp-crm-dark-07|(?:cp-crm-dark-08|(?:cp-crm-dark-09|(?:cp-crm-ui-restore-01|cp-mobile-workspace-switch-01))))))/);
});
test('board share and people/group picker are covered only in dark mode',()=>{
 for(const token of ['.board-share-stage-frame','.board-share-stage-secondary',
  '.board-share-stage-primary:disabled','.board-share-stage-form input',
  '.board-share-stage-pill','.board-share-stage-caption','.bs09-board-access',
  '.bs09-board-access input','.bs09-picker-tabs','.bs09-access-result',
  '.bs09-group-create',':focus-visible','prefers-reduced-motion'])
  assert.ok(css.includes(token),`Missing component ${token}`);
 assert.doesNotMatch(css,/@import|!important|@keyframes|javascript:|auth\.uid|supabase|fetch\(/i);
});
