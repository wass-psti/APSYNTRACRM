import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOARD_TOOLBAR_POPOVER_SELECTOR,closeBoardToolbarPopovers,
 installBoardToolbarPopoverBehavior} from '../board/presentation/toolbar-popovers.js';

function emitter(){
 const listeners=new Map();
 return {
  addEventListener(type,callback){
   const callbacks=listeners.get(type)||[];
   callbacks.push(callback);listeners.set(type,callbacks);
  },
  removeEventListener(type,callback){
   listeners.set(type,(listeners.get(type)||[]).filter(x=>x!==callback));
  },
  fire(type,event){for(const callback of listeners.get(type)||[])callback(event);}
 };
}
function setup(){
 let lastFocused='';
 const root={...emitter(),menus:[],
  querySelectorAll(selector){
   assert.equal(selector,BOARD_TOOLBAR_POPOVER_SELECTOR);
   return this.menus;
  },
  contains(node){return this.menus.includes(node);}
 };
 const doc={...emitter(),activeElement:null};
 function menu(name){
  const summary={focus(){lastFocused=name;}};
  const instance={open:false,inside:{},matches:selector=>selector===BOARD_TOOLBAR_POPOVER_SELECTOR,
   contains(target){return target===this||target===summary||target===this.inside;},
   querySelector:selector=>selector==='summary'?summary:null
  };
  root.menus.push(instance);
  return instance;
 }
 return {root,doc,menu,focused:()=>lastFocused};
}
test('opening Person, Filter, Sort, Hide, Group by or More closes the previous popover',()=>{
 const {root,doc,menu}=setup();
 const unsubscribe=installBoardToolbarPopoverBehavior(root,doc);
 const menus=['Person','Filter','Sort','Hide','Group by','More'].map(menu);
 for(let i=0;i<menus.length;i++){
  menus[i].open=true;root.fire('toggle',{target:menus[i]});
  assert.equal(menus.filter(x=>x.open).length,1);
  assert.equal(menus[i].open,true);
 }
 unsubscribe();
});

test('inside interaction stays open; outside pointer, click, keyboard focus close',()=>{
 const {root,doc,menu}=setup();
 const unsubscribe=installBoardToolbarPopoverBehavior(root,doc);
 const hide=menu('Hide');
 hide.open=true;root.fire('toggle',{target:hide});
 doc.fire('pointerdown',{target:hide.inside});
 doc.fire('click',{target:hide.inside});
 assert.equal(hide.open,true,'multi-select Hide stays open');
 doc.fire('pointerdown',{target:{unrelated:true}});
 assert.equal(hide.open,false);
 hide.open=true;doc.fire('click',{target:{unrelated:true}});
 assert.equal(hide.open,false,'keyboard/synthetic click dismisses too');
 hide.open=true;doc.fire('focusin',{target:{unrelated:true}});
 assert.equal(hide.open,false,'Tab to unrelated control dismisses');
 unsubscribe();
});

test('Escape closes the open menu and returns focus to its summary',()=>{
 const {root,doc,menu,focused}=setup();
 const stop=installBoardToolbarPopoverBehavior(root,doc);
 const filter=menu('Filter');
 filter.open=true;doc.activeElement=filter.inside;
 let prevented=false,stopped=false;
 doc.fire('keydown',{key:'Escape',preventDefault(){prevented=true;},
  stopPropagation(){stopped=true;}});
 assert.equal(filter.open,false);
 assert.equal(focused(),'Filter');
 assert.equal(prevented,true);
 assert.equal(stopped,true);
 stop();
});

test('non-board menus are unaffected and handler survives rerendered toolbar',()=>{
 const {root,doc,menu}=setup();
 const stop=installBoardToolbarPopoverBehavior(root,doc);
 const old=menu('Old Filter');
 old.open=true;root.fire('toggle',{target:old});
 root.menus=[];
 const fresh=menu('New Filter');
 fresh.open=true;root.fire('toggle',{target:fresh});
 assert.equal(fresh.open,true);
 const unrelated={open:true,matches:()=>false};
 root.fire('toggle',{target:unrelated});
 assert.equal(fresh.open,true);
 closeBoardToolbarPopovers(root);
 assert.equal(fresh.open,false);
 assert.equal(unrelated.open,true);
 stop();
 fresh.open=true;doc.fire('pointerdown',{target:{}});
 assert.equal(fresh.open,true,'disposal removes listeners');
});

test('only the ordinary signed board toolbar installs exclusivity once',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.doesNotMatch(app,/^import \{installBoardToolbarPopoverBehavior\} from /m);
 assert.match(app,/boardToolbarPopoverPromise=import\('\.\/board\/presentation\/toolbar-popovers\.js'\)/);
 assert.match(app,/void ensureBoardToolbarPopoverBehavior\(\)/);
 assert.equal((app.match(/installBoardToolbarPopoverBehavior\(root,document\)/g)||[]).length,1);
 assert.match(BOARD_TOOLBAR_POPOVER_SELECTOR,/\.aps-board-shell/);
 assert.match(BOARD_TOOLBAR_POPOVER_SELECTOR,/details:is\(\.board-tool-menu,\.board-column-menu,\.board-actions-menu\)/);
});
