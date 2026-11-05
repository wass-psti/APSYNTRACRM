import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureBoardGroupScroll,restoreBoardGroupScroll} from '../board-scroll-state.js';

const app=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/styles.css','utf8');
const surfaceStart=css.indexOf('CP-BOARD-SURFACE-01');
const surfaceEnd=css.indexOf('/* CMP-01:',surfaceStart);
const part=css.slice(surfaceStart,surfaceEnd<0?undefined:surfaceEnd);

function scrollGroup(id,left){
 return {scrollLeft:left,querySelector(selector){
  assert.equal(selector,'table[data-group-id]');
  return id?{dataset:{groupId:id}}:null;
 }};
}
function container(groups){
 return {querySelectorAll(selector){
  assert.equal(selector,'.board-group-scroll');
  return groups;
 }};
}
test('all nine annotated board regions use one shared board-only styling scope',()=>{
 assert.match(app,/classList\.toggle\('aps-board-shell',state\.view==='board'\)/);
 assert.match(part,/\.main-content/);
 assert.match(part,/\.page-head/);
 assert.match(part,/\.board-draggable-tabs/);
 assert.match(part,/\.board-customize-toolbar/);
 assert.match(part,/\.group-heading/);
 assert.match(part,/\.board-group-scroll/);
 assert.match(part,/\.topbar/);
 assert.match(part,/\.top-actions/);
 assert.match(part,/\.head-actions/);
 assert.match(part,/@media\(max-width:750px\)/);
 assert.match(part,/@media\(prefers-reduced-motion:reduce\)/);
});
test('per-group horizontal offset survives DOM replacement without cross-group mixing',()=>{
 const first=container([scrollGroup('a',230),scrollGroup('b',90)]);
 const snapshot=captureBoardGroupScroll(first);
 assert.deepEqual([...snapshot],[['a',230],['b',90]]);
 const b=scrollGroup('b',0),a=scrollGroup('a',0),c=scrollGroup('c',14);
 restoreBoardGroupScroll(container([b,c,a]),snapshot);
 assert.equal(a.scrollLeft,230);
 assert.equal(b.scrollLeft,90);
 assert.equal(c.scrollLeft,14,'new group retains its own position');
});
test('no stale cross-view or cross-identity scroll persistence',()=>{
 assert.match(app,/state\.view==='board'&&shellIdentity===identity&&shellRoute===route/);
 assert.match(app,/captureBoardGroupScroll\(root\.querySelector\(':scope > \.shell \.main-content'\)\)/);
 assert.match(app,/if\(scrollPositions\)restoreBoardGroupScroll\(/);
 assert.deepEqual([...captureBoardGroupScroll(null)],[]);
 const node=scrollGroup('x',0);
 restoreBoardGroupScroll(container([node]),null);
 assert.equal(node.scrollLeft,0);
});
test('scroll refinements retain unified vertical scroll and minimal motion',()=>{
 assert.match(part,/overscroll-behavior-x:contain/);
 assert.match(part,/scroll-behavior:auto/);
 assert.match(part,/contain:style/);
 assert.doesNotMatch(part,/overflow-y:\s*(?:auto|scroll)|scrollTo\(|requestAnimationFrame|setInterval|will-change|translate[XYZ]?\(/);
});
