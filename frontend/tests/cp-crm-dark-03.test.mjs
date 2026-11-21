import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const css=readFileSync('frontend/dark-enterprise-monday.css','utf8');
test('reference-inspired dark layer follows the existing native dark layer',()=>{
 assert.deepEqual(STYLE_SOURCES.slice(-8,-5),[
  'frontend/dark-theme-foundation.css','frontend/dark-native-applications.css',
  'frontend/dark-enterprise-monday.css']);
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 assert.match(readFileSync('index.html','utf8'),/apsyntra-styles\.bundle\.css\?v=(?:cp-crm-dark-0[34]|(?:cp-crm-dark-invite-01|(?:cp-crm-dark-05|cp-crm-dark-06)))/);
});
test('compact, restrained enterprise palette covers existing shell and modules',()=>{
 for(const item of ['--crm-dark-canvas:#121212','--crm-dark-sidebar:#181818',
  '--crm-dark-surface:#292929','--crm-dark-accent-surface:#193c78',
  '.aps-sidebar .nav-link.active','.overview-hero','.overview-stat-grid',
  '.overview-board-grid .board-card','.overview-essentials',
  '.boards-catalog-grid .board-card','.board-group-panel',
  '.aps-action-popover','.ws01-menu-card','.aps-global-search-trigger',
  '.aps-board-search-field','.sidebar-layout-toggle','.aps-workspace-add-board',
  '.aps-sync','.topbar-signout','.board-card-actions>summary',':focus-visible'])
   assert.ok(css.includes(item),`Missing dark design component ${item}`);
});
test('dark-only change has no layout rewrite, expensive animation or privilege logic',()=>{
 assert.doesNotMatch(css,/@import|@keyframes|!important|javascript:|expression\(|animation\s*:/i);
 assert.doesNotMatch(css,/position\s*:\s*(?:fixed|absolute)|overflow-x\s*:\s*hidden|pointer-events\s*:\s*none/i);
 assert.doesNotMatch(css,/service_role|supabase|auth\.uid|fetch\(|\bRLS\b/i);
 assert.doesNotMatch(css,/(?:^|[;{])\s*(?:width|max-width)\s*:\s*\d+px/im);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
