import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const source=readFileSync('frontend/dark-native-applications.css','utf8');

test('the native dark palette is last and the CSS bundle remains deterministic',()=>{
 assert.deepEqual(STYLE_SOURCES.slice(-13, -11),['frontend/dark-theme-foundation.css','frontend/dark-native-applications.css']);
 assert.equal(readFileSync(STYLE_BUNDLE,'utf8'),generateStyleBundle());
 assert.match(readFileSync('index.html','utf8'),/apsyntra-styles\.bundle\.css\?v=(?:cp-crm-dark-0[234]|(?:cp-crm-dark-invite-01|(?:cp-crm-dark-05|(?:cp-crm-dark-06|(?:cp-crm-dark-07|(?:cp-crm-dark-08|(?:cp-crm-dark-09|(?:cp-crm-ui-restore-01))))))))/);
});
test('TradeLink, Fund Tracker and additional native modules receive dark coverage',()=>{
 for(const target of ['.tl-reference-portal','.tl-draft-panel','.tl-reference-document-topcard',
  '.tl-reference-editor-content','.tl-app-nav>a.active','.frt-ref-table-card',
  '.frt-ref-table td','.frt-ref-filters select','.frt-ref-more-menu',
  '.ft3-panel','.tb-panel','.fm1-panel',':focus-visible'])
  assert.ok(source.includes(target),`Missing dark native surface: ${target}`);
 assert.match(source,/prefers-reduced-motion:reduce/);
 assert.match(source,/data-aps-monday-theme="dark"/);
});
test('dark-only styles do not rewrite workflows, authorizations or module geometry',()=>{
 assert.doesNotMatch(source, /@import|@keyframes|javascript:|expression\(|!important|animation\s*:/i);
 assert.doesNotMatch(source, /position\s*:\s*(?:fixed|absolute)|overflow-x\s*:\s*hidden|pointer-events\s*:\s*none/i);
 assert.doesNotMatch(source, /auth\.uid|service_role|supabase|fetch\(|\bRLS\b/i);
 assert.doesNotMatch(source, /(?:^|[;{])\s*(?:height|min-height|width)\s*:\s*\d+px/im);
});
