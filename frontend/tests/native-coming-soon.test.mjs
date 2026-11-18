import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOARD_MODULES} from '../board-manifest.js';
import {NATIVE_PLACEHOLDER_KEYS,nativePlaceholderHref,renderNativePlaceholder} from '../native-coming-soon.js';
import {sidebarActiveRoute} from '../sidebar-active-route.js';

test('exactly eight registered standalone placeholders have distinct canonical routes and accessible content',()=>{
 const keys=['fueltrans','tools','toolbox','orders','evaluation','charter','aims','materials'];
 assert.deepEqual([...NATIVE_PLACEHOLDER_KEYS],keys);
 for(const key of keys){
  const module=BOARD_MODULES.find(row=>row.key===key);
  assert.ok(module,key);
  const href=nativePlaceholderHref(key);
  assert.equal(href,'#/native/'+key);
  assert.equal(sidebarActiveRoute(href),'native:'+key);
  assert.equal(sidebarActiveRoute(href+'?q=test'),'native:'+key);
  const markup=renderNativePlaceholder(key);
  assert.ok(markup.includes(module.name),key);
  assert.match(markup,/Coming <span>Soon\.<\/span>/);
  assert.match(markup,/aria-labelledby="native-soon-title"/);
  assert.match(markup,/#\/overview/);
 }
 assert.equal(nativePlaceholderHref('tradelink'),null);
 assert.equal(sidebarActiveRoute('#/native/tools/invalid'),'');
 assert.equal(sidebarActiveRoute('#/native/unknown'),'');
});

test('sidebar routes placeholders separately from existing board data and native workflows',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/board\?sidebarNav\(nativePlaceholderHref\(module\.key\),module\.name,'boards'/);
 assert.match(app,/state\.view==='native-coming-soon'\)shell\(renderNativePlaceholder/);
 assert.match(app,/NATIVE_PLACEHOLDER_KEYS\.has\(parts\[1\]\)/);
 assert.match(app,/selected\.startsWith\('native:'\)\?nativePlaceholderHref/);
 assert.equal(sidebarActiveRoute('#/tradelink'),'tradelink');
 assert.equal(sidebarActiveRoute('#/time-tracker'),'time-tracker');
 assert.equal(sidebarActiveRoute('#/boards/other-board'),'');
});
