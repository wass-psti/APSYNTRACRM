import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const entry = readFileSync('index.html', 'utf8');
const script = readFileSync('frontend/mobile-home.js', 'utf8');
const css = readFileSync('frontend/mobile-home.css', 'utf8');
const app = readFileSync('frontend/app.js', 'utf8');
const globalSearch = readFileSync('frontend/global-search.js', 'utf8');

test('mobile shell loads after existing frontend scripts and built styles', () => {
  assert.equal((entry.match(/<link rel="stylesheet"/g) || []).length, 1);
  assert.ok(entry.includes('frontend/mobile-home.css'));
  assert.ok(css.includes('APSYNTRA CRM mobile home / immersive application routes'));
  assert.ok(entry.indexOf('frontend/mobile-home.js') > entry.indexOf('frontend/monday-inspired-ui.js'));
  assert.ok(entry.indexOf('frontend/mobile-home.js') > entry.indexOf('frontend/app.js'));
  assert.doesNotMatch(script, /\bfetch\s*\(|\bDomainApi\b|\bsupabase\b|\bAuthClient\b/);
});

test('mobile shell JavaScript parses and uses the signed rendered navigation catalog', () => {
  assert.doesNotThrow(() => new Script(script, {filename:'frontend/mobile-home.js'}));
  assert.match(script, /nav\[aria-label="Primary"\] a\.nav-link/);
  assert.match(script, /sidebar-recent-list a\.sidebar-recent-link/);
  assert.match(script, /safeRoute\(href\)/);
  assert.match(script, /if \(!shell \|\| !catalog\(shell\)\.all\.some/);
  assert.match(script, /root\.querySelector\(':scope > \.shell'\)/);
});

test('favorites and visit history are scoped to the mounted signed workspace', () => {
  assert.match(script, /if \(shell !== lastShell \|\| workspace !== lastContext\)/);
  assert.match(script, /favorites = null;\s*visited = \[\];\s*searchText = ''/);
  assert.match(script, /Visited this session/);
  assert.match(script, /items\.all\.find\(item => item\.href === entry\.href\)/);
  assert.doesNotMatch(script, /localStorage|sessionStorage/);
});

test('mobile home and immersive destinations never replace native application contents', () => {
  assert.match(script, /shell\.classList\.toggle\('apsm-home-route', homeRoute\)/);
  assert.match(script, /shell\.classList\.toggle\('apsm-destination-route', !homeRoute\)/);
  assert.match(script, /href="#\/overview"/);
  assert.match(css, /@media \(max-width: 810px\)/);
  assert.match(css, /> \.aps-sidebar,[\s\S]+?> \.aps-monday-rail,[\s\S]+?> \.main > \.topbar[\s\S]+?display: none !important;/);
  assert.match(css, /\.apsm-home-route > \.main\s*\{[\s\S]*?display: none !important;/);
  assert.match(css, /\.apsm-destination-route > \.apsm-app-header/);
  assert.match(css, /max-width: none;/);
  assert.doesNotMatch(script, /main-content'\)\.innerHTML|main-content"\)\.innerHTML/);
});

test('bottom navigation reaches real CRM sections and opens the existing global search', () => {
  assert.match(script, /href="#\/boards" aria-label="My Boards"/);
  assert.match(script, /href="#\/settings"/);
  assert.match(script, /href="#\/overview\?section=favorites"/);
  assert.match(script, /data-apsm-open-search/);
  assert.match(script, /globalSearchTrigger = root\.querySelector\('\[data-global-search-open\]'\)/);
  assert.match(script, /globalSearchTrigger\.click\(\)/);
  assert.match(script, /if \(location\.hash !== href\) location\.hash = href/);
  assert.match(script, /const homeSection = \(\) =>/);
  assert.match(script, /favoritesOnly/);
  assert.match(app, /sidebarNav\('#\/boards','My boards'/);
  assert.match(app, /sidebarNav\('#\/settings','Settings'/);
  assert.match(app, /parts\[0\]==='boards'\?'boards'/);
  assert.match(app, /parts\[0\]==='settings'\?'settings'/);
  assert.match(app, /data-global-search-open/);
  assert.match(globalSearch, /function startGlobalSearch/);
  assert.doesNotMatch(script, /data-apsm-focus-search|data-apsm-scroll-favorites/);
});

test('mobile search, favorite toggle, keyboard focus and dark theme are supported', () => {
  assert.match(script, /data-apsm-search/);
  assert.match(script, /id="apsm-home-search" name="apsm-home-search"/);
  assert.match(script, /data-apsm-favorite/);
  assert.match(script, /data-apsm-open-search/);
  assert.match(script, /aria-pressed/);
  assert.match(css, /focus-visible/);
  assert.match(css, /html\[data-aps-monday-theme="dark"\]/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
