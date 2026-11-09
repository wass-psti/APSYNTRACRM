import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync('index.html','utf8');
const css=readFileSync('frontend/board-visual-refresh.css','utf8');
const app=readFileSync('frontend/app.js','utf8');
const base=readFileSync('frontend/styles.css','utf8');

test('visual refresh loads last and remains scoped to signed board routes',()=>{
 const link='frontend/board-visual-refresh.css';
 assert.ok(page.includes('frontend/apsyntra-styles.bundle.css'));
 assert.ok(readFileSync('scripts/priority5-style-manifest.mjs','utf8').includes(link));
 assert.ok(page.indexOf(link)>page.indexOf('frontend/time-tracker-gps.css'));
 assert.match(app,/classList\.toggle\('aps-board-shell',state\.view==='board'\)/);
 assert.match(css,/#app \.aps-board-shell \.page-head/);
 assert.doesNotMatch(css,/(?:^|\n)\s*(?:html|body|\.page-head|\.tabs|\.board-group-scroll)\s*\{/);
});

test('premium board presentation is visually differentiated from the base',()=>{
 assert.match(css,/radial-gradient\(/);
 assert.match(css,/linear-gradient\(117deg/);
 assert.match(css,/\.page-head h1/);
 assert.match(css,/color: #ffffff/);
 assert.match(css,/\.board-tab-slot > \.tab\.active/);
 assert.match(css,/background: #5056da/);
 assert.match(css,/\.board-customize-toolbar/);
 assert.match(css,/\.group-heading small/);
 assert.match(css,/\.board-table-custom tbody tr:nth-child\(even\) td/);
 assert.match(css,/\.top-actions \.top-pill/);
 assert.ok(!base.includes('linear-gradient(117deg, #17234b'),
  'new hero is a genuine visual change, not duplicated original CSS');
});

test('motion, native scrolling, focus and small screens remain safe',()=>{
 assert.match(css,/@media \(max-width: 570px\)/);
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/\.board-group-scroll/);
 assert.doesNotMatch(css,/(?:overflow-y|scroll-behavior):\s*(?:auto|scroll|smooth)\s*;?/g);
 assert.doesNotMatch(css,/@keyframes|animation:|will-change|translate3d\(|scale\(|backdrop-filter|@import/);
 assert.match(app,/restoreBoardGroupScroll\(/);
});
