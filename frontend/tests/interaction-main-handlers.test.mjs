import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const handlers=app.slice(app.indexOf("root.addEventListener('input',event=>{"),app.indexOf("document.addEventListener('visibilitychange'",app.indexOf("root.addEventListener('input',event=>{")));
test('CP-BOARD-INTERACTION-LATENCY-REAL: three signed search input handlers retain DOM without rerender',()=>{
 for(const id of ['ft3-activity-search','tt-team-search','tt-ot-search']){
  const at=handlers.indexOf("event.target.id==='"+id+"'");
  assert.ok(at>=0,id);
  const end=handlers.indexOf('return;',at);
  const segment=handlers.slice(at,end+7);
  assert.match(segment,/applySearchVisibility\(/,id);
  assert.doesNotMatch(segment,/\brender\(\)|\.outerHTML\s*=/,id);
 }
});
test('CP-BOARD-INTERACTION-LATENCY-REAL: resizing uses scheduled frame and flush/cancel without measuring layout in move',()=>{
 const move=app.slice(app.indexOf("window.addEventListener('pointermove',event=>{"),app.indexOf("window.addEventListener('pointerup',event=>{"));
 assert.match(move,/boardResizeFrames\.schedule/);
 assert.doesNotMatch(move,/offsetWidth|getBoundingClientRect|getAttribute\('width'\)|setAttribute\('width'\)/);
 const up=app.slice(app.indexOf("window.addEventListener('pointerup',event=>{"),app.indexOf("window.addEventListener('pointercancel',"));
 assert.match(up,/boardResizeFrames\.flush\(/);
 assert.match(app,/window\.addEventListener\('pointercancel',\(\)=>\{cancelBoardResize\(\)/);
});
