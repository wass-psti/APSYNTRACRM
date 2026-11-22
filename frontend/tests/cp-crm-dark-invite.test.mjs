import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const css=readFileSync('frontend/dark-workspace-invitations.css','utf8');
test('workspace invitation dark layer is final in deterministic bundle',()=>{
 assert.equal(STYLE_SOURCES.at(-10),'frontend/dark-workspace-invitations.css');
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 assert.match(readFileSync('index.html','utf8'),/bundle\.css\?v=(?:cp-crm-dark-invite-01|(?:cp-crm-dark-05|(?:cp-crm-dark-06|(?:cp-crm-dark-07|(?:cp-crm-dark-08|(?:cp-crm-dark-09|(?:cp-crm-boards-uiverse-overhaul-03|cp-crm-overview-redesign-01)))))))/);
});
test('invitation form and history controls have dark-mode scoped styles',()=>{
 for(const token of ['.ws01-overlay.ws01-invite','.ws02-invite-card','.ws02-invite-heading h2',
  'input[type=email]','.ws02-invite-access','.ws02-invite-footer',
  '.ws11-manage','.ws11-invite-row','.ws02-invite-state.is-pending',
  '.ws02-send',':focus-visible',':disabled'])assert.ok(css.includes(token),token);
 assert.doesNotMatch(css,/@import|!important|@keyframes|javascript:|auth\.uid|supabase|fetch\(/i);
});
