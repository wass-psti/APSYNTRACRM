import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const css=readFileSync('frontend/dark-attendance-admin.css','utf8');
test('attendance admin CSS is last and bundled deterministically',()=>{
 assert.equal(STYLE_SOURCES.at(-4),'frontend/dark-attendance-admin.css');
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 assert.match(readFileSync('index.html','utf8'),/bundle\.css\?v=(?:cp-crm-dark-08|(?:cp-crm-dark-09|(?:cp-crm-ui-restore-01)))/);
});
test('all admin, destructive-dialog and monitor controls are dark-only and screen-only',()=>{
 for(const token of ['.tt-log-admin-toolbar','.tt-log-admin-selection-status',
  '.tt-admin-editor','.tt-admin-editor-body','.tt-admin-field-section',
  '.tt-admin-delete-dialog','.tt-admin-delete-records','.tt-admin-delete-audit-note',
  '.tt-admin-delete-actions','.tt-monitor-empty','.tt-monitor-stat',
  ':focus-visible',':disabled','prefers-reduced-motion'])assert.ok(css.includes(token),token);
 assert.match(css,/^\/\* CP-CRM-DARK-08[^]*@media screen \{/);
 assert.doesNotMatch(css,/@import|@keyframes|javascript:|auth\.uid|supabase|fetch\(/i);
 assert.doesNotMatch(css,/\.leaflet-tile|@media print|\.tl-official-|\.tl-print-/);
});
