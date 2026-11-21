import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const css=readFileSync('frontend/dark-role-configuration.css','utf8');
test('role-specific styling is final and deterministic',()=>{
 assert.equal(STYLE_SOURCES.at(-7),'frontend/dark-role-configuration.css');
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 assert.match(readFileSync('index.html','utf8'),/frontend\/dark-role-configuration\.css/);
});
test('role catalog, assignments, native application access and bulk controls have dark coverage',()=>{
 for(const token of ['.aps-role-config-shell','.role-config-hero','.role-stat-card',
  '.role-config-tabs','.role-table-panel','.role-data-table',
  '.role-search','.role-proposal-button','.native-application-access',
  '.user-role-native-app-picker','.user-role-native-app-row',
  '.user-role-native-app-role select','.user-role-native-batch-action select',
  '.user-role-batch-user-list label:has(input:checked)',':focus-visible'])
  assert.ok(css.includes(token),`Missing dark role control: ${token}`);
});
test('styles alter presentation only, not authorization or workflow',()=>{
 assert.doesNotMatch(css,/@import|@keyframes|!important|javascript:|expression\(|animation\s*:/i);
 assert.doesNotMatch(css,/\b(?:service_role|supabase|auth\.uid|fetch\(|RLS)\b/i);
 assert.doesNotMatch(css,/pointer-events\s*:\s*none|overflow-x\s*:\s*hidden/i);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
