import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STYLE_SOURCES,STYLE_BUNDLE} from '../../scripts/priority5-style-manifest.mjs';
import {generateStyleBundle} from '../../scripts/build-priority5-styles.mjs';
const index=readFileSync('index.html','utf8');
const source=readFileSync(STYLE_BUNDLE,'utf8');
test('Priority 5 merges 41 blocking CSS requests into one exact-order source bundle',()=>{
 assert.equal(STYLE_SOURCES.length,41);
 assert.equal(new Set(STYLE_SOURCES).size,STYLE_SOURCES.length);
 assert.equal((index.match(/<link rel="stylesheet"/g)||[]).length,1);
 assert.match(index,/href="\.\/frontend\/apsyntra-styles\.bundle\.css"/);
 for(let i=0;i<STYLE_SOURCES.length;i++){
  const path=STYLE_SOURCES[i];
  assert.match(path,/^frontend\/[a-z0-9-]+\.css$/);
  assert.equal(readFileSync(path,'utf8').match(/@import|@charset|url\(/g),null,
   path+' requires explicit reviewed URL/import handling before concatenation');
  assert.ok(index.includes(path),'CSS source provenance missing from index: '+path);
  if(i>0)assert.ok(index.indexOf(path)>index.indexOf(STYLE_SOURCES[i-1]),
   'CSS manifest order drifted in HTML: '+path);
 }
 assert.equal(source,generateStyleBundle(),'committed CSS bundle must match every source exactly');
});
test('Priority 5 preserves restrictive CSP, existing source modules and Pages source verification',()=>{
 const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
 const verify=readFileSync('scripts/verify-pages-source.mjs','utf8');
 assert.ok(smoke.includes(STYLE_BUNDLE));
 assert.match(index,/style-src-attr 'none'/);
 assert.match(index,/<script type="module" src="\.\/frontend\/app\.js"><\/script>/);
 assert.match(verify,/Public|Pages-first static asset graph|https/);
 assert.doesNotMatch(source,/@import\b|url\(/);
});

test('Board header options are contextual on mouse and accessible by keyboard and touch',()=>{
 const css=readFileSync('frontend/soft-minimalist.css','utf8');
 const markup=readFileSync('frontend/board-presentation.js','utf8');
 const behavior=readFileSync('frontend/app.js','utf8');
 assert.match(css,/#app \.aps-board-shell \.board-table-custom thead th > \.board-column-more/);
 assert.match(css,/@media\s*\(hover:hover\)\s*and\s*\(pointer:fine\)/);
 assert.match(css,/opacity:0;\s*pointer-events:none/);
 assert.match(css,/:is\(:hover,:focus-within\)/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/\[aria-expanded="true"\]/);
 assert.match(css,/@media\s*\(hover:none\),\s*\(pointer:coarse\)/);
 assert.match(css,/@media\s*\(prefers-reduced-motion:reduce\)/);
 assert.match(markup,/class="board-column-more" data-action="board-column-context"/);
 assert.match(markup,/aria-haspopup="menu" aria-expanded="false"/);
 assert.match(behavior,/case 'board-column-context':/);
 assert.match(behavior,/case 'board-column-hide':/);
 assert.match(behavior,/case 'board-column-set-width':/);
 assert.doesNotMatch(css.slice(css.lastIndexOf('/* BS03')),/\.board-actions-menu|\.board-group-actions|\.board-card-actions/);
});
