import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applySearchVisibility} from '../interaction-search.js';
import {createFrameCoalescer} from '../frame-coalescer.js';

function row(text,group){return {dataset:{searchText:text},hidden:false,closest:selector=>selector==='.group'?group:null};}
function group(){return {hidden:false};}
function fixture(values){
 const groups=[...new Set(values.map(value=>value.group))];
 const rows=values.map(value=>row(value.text,value.group));
 const empty={hidden:true};
 return {rows,groups,empty,root:{
  querySelectorAll(selector){return selector==='.row'?rows:selector==='.group'?groups:[];},
  querySelector(selector){return selector==='.empty'?empty:null;}
 }};
}

test('rendered search updates rows, empty state and groups without rebuilding nodes',()=>{
 const first=group(),second=group();
 const f=fixture([{text:'alpha worker',group:first},{text:'beta request',group:first},
  {text:'gamma worker',group:second}]);
 const nodes=[...f.rows];
 assert.deepEqual(applySearchVisibility(f.root,{selector:'.row',query:'worker',
  groupSelector:'.group',emptySelector:'.empty'}),{total:3,visible:2});
 assert.deepEqual(f.rows.map(row=>row.hidden),[false,true,false]);
 assert.equal(first.hidden,false);assert.equal(second.hidden,false);assert.equal(f.empty.hidden,true);
 assert.deepEqual(applySearchVisibility(f.root,{selector:'.row',query:'beta',
  groupSelector:'.group',emptySelector:'.empty'}),{total:3,visible:1});
 assert.deepEqual(f.rows.map(row=>row.hidden),[true,false,true]);
 assert.equal(first.hidden,false);assert.equal(second.hidden,true);
 assert.deepEqual(applySearchVisibility(f.root,{selector:'.row',query:'missing',
  groupSelector:'.group',emptySelector:'.empty'}),{total:3,visible:0});
 assert.equal(first.hidden,true);assert.equal(second.hidden,true);assert.equal(f.empty.hidden,false);
 assert.deepEqual(f.rows,nodes,'search must preserve the same row nodes');
});

test('frame coalescer applies only the newest pointer value once per frame',()=>{
 const callbacks=new Map();let next=0;const applied=[];
 const scheduler=createFrameCoalescer({
  requestFrame:callback=>{const id=++next;callbacks.set(id,callback);return id;},
  cancelFrame:id=>callbacks.delete(id),apply:value=>applied.push(value)
 });
 scheduler.schedule(120);scheduler.schedule(140);scheduler.schedule(180);
 assert.equal(callbacks.size,1);assert.equal(scheduler.pending,true);
 const [id,callback]=callbacks.entries().next().value;callbacks.delete(id);callback();
 assert.deepEqual(applied,[180]);assert.equal(scheduler.pending,false);
 scheduler.schedule(200);scheduler.schedule(220);
 assert.equal(scheduler.flush(),true);assert.deepEqual(applied,[180,220]);
 assert.equal(scheduler.flush(),false);
});

test('frame coalescer cancellation discards stale pointer work',()=>{
 const callbacks=new Map();let next=0;const applied=[];
 const scheduler=createFrameCoalescer({
  requestFrame:callback=>{const id=++next;callbacks.set(id,callback);return id;},
  cancelFrame:id=>callbacks.delete(id),apply:value=>applied.push(value)
 });
 scheduler.schedule(160);scheduler.cancel();
 assert.equal(callbacks.size,0);assert.deepEqual(applied,[]);assert.equal(scheduler.pending,false);
});

test('performance helpers remain local and do not introduce persistence or network observers',()=>{
 const search=readFileSync(new URL('../interaction-search.js',import.meta.url),'utf8');
 const frames=readFileSync(new URL('../frame-coalescer.js',import.meta.url),'utf8');
 assert.doesNotMatch(search,/fetch\(|localStorage|sessionStorage|PerformanceObserver|setInterval/);
 assert.doesNotMatch(frames,/fetch\(|localStorage|sessionStorage|PerformanceObserver|setInterval/);
});
