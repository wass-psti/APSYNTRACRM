import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sidebarIcon } from '../sidebar-visuals.js';

const app = readFileSync('frontend/app.js', 'utf8');
const css = readFileSync('frontend/pdl-crm-native-refinement.css', 'utf8');
const styles = readFileSync('frontend/apsyntra-styles.bundle.css', 'utf8');
const manifest = readFileSync('scripts/priority5-style-manifest.mjs', 'utf8');

test('Paseo and TalkBox have distinct solid native icons without altering routes', () => {
 const paseo = sidebarIcon('paseo');
 const talkbox = sidebarIcon('talkbox');
 assert.notEqual(paseo, talkbox);
 assert.match(paseo, /fill="currentColor"/);
 assert.match(talkbox, /fill="currentColor"/);
 for(const markup of [paseo,talkbox]){
  assert.match(markup, /viewBox="0 0 24 24"/);
  assert.match(markup, /aria-hidden="true"/);
  assert.doesNotMatch(markup, /filter=|drop-shadow|glow/);
 }
 assert.match(app, /sidebarNav\('#\/paseo','Paseo de Lomboy','paseo',active\('paseo'\)\)/);
 assert.match(app, /sidebarNav\(TALKBOX_APPLICATION_ROUTE,'TalkBox','talkbox',active\('talkbox'\)\)/);
 assert.match(app, /state\.boards\.some\(b=>moduleByBoardName\(b\.name\)\?\.key==='toolbox'\)/);
});

test('modern Paseo launcher retains public and administrator links and both actions', () => {
 assert.match(app, /class="section pdl-crm-portal"/);
 assert.match(app, /id="pdl-native-title"/);
 assert.match(app, /href="\.\/paseo\//);
 assert.match(app, /href="\.\/paseo\/admin\/sign-in"/);
 assert.match(app, /data-action="pdl-refresh"/);
 assert.match(app, /data-action="pdl-more"/);
 assert.match(app, /current\.status==='DENIED'/);
 assert.match(app, /current\.status==='UNAVAILABLE'/);
 assert.match(app, /current\.reservations\.map/);
 assert.match(app, /e\(record\.id\)/);
 assert.match(app, /e\(record\.name\)/);
 assert.match(app, /e\(record\.paymentStatus\)/);
 assert.match(app, /const result=await readPaseoManagement\(token,\{cursor\}\)/);
});

test('UI CSS is scoped, responsive, dark mode and reduced-motion aware', () => {
 assert.match(css, /#app \.pdl-crm-portal/);
 assert.match(css, /html\[data-aps-monday-theme="dark"\]/);
 assert.match(css, /@media\(max-width:800px\)/);
 assert.match(css, /@media\(max-width:480px\)/);
 assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css, /:focus-visible/);
 assert.match(css, /nav-link\[href="#\/paseo"\]/);
 assert.match(css, /nav-link\[href="#\/talkbox"\]/);
 assert.match(manifest, /frontend\/pdl-crm-native-refinement\.css/);
 assert.match(styles, /\/\* frontend\/pdl-crm-native-refinement\.css \*\//);
 assert.ok(styles.endsWith(css.trimEnd()+'\n'), 'CSS delivery bundle includes source without alteration');
});
