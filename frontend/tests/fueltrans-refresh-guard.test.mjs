import test from 'node:test';
import assert from 'node:assert/strict';
import {createDirtyControlTracker} from '../fueltrans/refresh-guard.js';

class FakeRoot{
 constructor(controls=[]){this.controls=controls;this.listeners=new Map();}
 addEventListener(type,listener,capture){this.listeners.set(type,{listener,capture});}
 removeEventListener(type,listener,capture){
  const current=this.listeners.get(type);
  if(current?.listener===listener&&current.capture===capture)this.listeners.delete(type);
 }
 querySelectorAll(){return this.controls;}
 dispatch(type,target){this.listeners.get(type)?.listener({target});}
}
const control=tag=>({tagName:tag,matches(selector){return selector.includes(tag.toLowerCase());}});

test('clean input, textarea, select and checkbox controls do not block host refresh',()=>{
 const controls=[control('INPUT'),control('TEXTAREA'),control('SELECT')];
 const root=new FakeRoot(controls),tracker=createDirtyControlTracker(root);
 assert.equal(tracker.hasDirtyControls(),false);
 tracker.dispose();
});
test('user input and change events mark only the interacted control dirty',()=>{
 const text=control('INPUT'),select=control('SELECT'),checkbox=control('INPUT');
 const root=new FakeRoot([text,select,checkbox]),tracker=createDirtyControlTracker(root);
 root.dispatch('input',text);
 assert.equal(tracker.hasDirtyControls(),true);
 root.controls=[select,checkbox];
 assert.equal(tracker.hasDirtyControls(),false,'detached controls no longer block refresh');
 root.dispatch('change',select);
 assert.equal(tracker.hasDirtyControls(),true,'select changes are tracked without defaultValue');
 root.controls=[checkbox];
 root.dispatch('change',checkbox);
 assert.equal(tracker.hasDirtyControls(),true,'checkbox/radio changes are tracked');
 tracker.dispose();
});
test('programmatic value changes without user interaction do not mark a control dirty',()=>{
 const select=control('SELECT');select.value='programmatic-change';
 const root=new FakeRoot([select]),tracker=createDirtyControlTracker(root);
 assert.equal(tracker.hasDirtyControls(),false);
 tracker.dispose();
});
test('dirty-control event listeners are removed on module disposal',()=>{
 const root=new FakeRoot([control('SELECT')]),tracker=createDirtyControlTracker(root);
 assert.deepEqual([...root.listeners.keys()].sort(),['change','input']);
 tracker.dispose();
 assert.equal(root.listeners.size,0);
});
