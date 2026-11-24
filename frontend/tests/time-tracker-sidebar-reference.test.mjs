import test from 'node:test';
import assert from 'node:assert/strict';
import {syncTimeTrackerSidebar} from '../time-tracker-ui.js';

// Minimal DOM tree for the real reparenting contract. Moving a node preserves
// its permission-filtered children and event-delegation attributes.
function fixture(){
 const attrs=new Map();
 const orientation=new Map();
 const selected={textContent:'Clock'};
 const tablist={
  setAttribute:(k,v)=>orientation.set(k,v),
  removeAttribute:k=>orientation.delete(k)
 };
 let location='application';
 let mounted=false;
 let crumb=null;
 const nav={
  remove(){location='removed';},
  querySelector(selector){
   return selector==='[role="tablist"]'?tablist:
    selector==='[aria-selected="true"]'?selected:null;
  }
 };
 const parent={
  get nextElementSibling(){return location==='sidebar'?nav:null;},
  after(node){assert.equal(node,nav);location='sidebar';},
  setAttribute:(k,v)=>attrs.set(k,v),
  removeAttribute:k=>attrs.delete(k)
 };
 const header={after(node){assert.equal(node,nav);location='application';}};
 const application={querySelector(selector){
  return selector==='.tt-navigation'&&location==='application'?nav:
   selector==='.tt-app-header'?header:null;
 }};
 const sidebar={
  querySelector(selector){
   return selector==='.tt-navigation'?(location==='sidebar'?nav:null):
    selector==='a.nav-link[href="#/time-tracker"]'?parent:null;
  },
  contains(node){return node===nav&&location==='sidebar';}
 };
 const breadcrumb={
  querySelector(){return crumb;},
  ownerDocument:{createElement(){return {remove(){crumb=null;}};}},
  append(node){crumb=node;}
 };
 const shell={
  querySelector(selector){
   return ({
    '.aps-sidebar':sidebar,'.main-content .tt-application':application,
    '.breadcrumb':breadcrumb
   })[selector]||null;
  },
  classList:{toggle(key,value){assert.equal(key,'tt-sidebar-mounted');mounted=value;}}
 };
 return {shell,selected,attrs,orientation,location:()=>location,mounted:()=>mounted,crumb:()=>crumb,
  newBody(){location='application';}};
}

test('desktop moves the existing tabs to the sidebar and restores them on collapse or narrow viewport',()=>{
 const f=fixture();
 assert.equal(syncTimeTrackerSidebar(f.shell,{enabled:true,expanded:true}),true);
 assert.equal(f.location(),'sidebar');
 assert.equal(f.attrs.get('aria-expanded'),'true');
 assert.equal(f.orientation.get('aria-orientation'),'vertical');
 assert.equal(f.crumb().textContent,'› Clock');
 assert.equal(syncTimeTrackerSidebar(f.shell,{enabled:true,expanded:false}),false);
 assert.equal(f.location(),'application');
 assert.equal(f.orientation.has('aria-orientation'),false);
 assert.equal(f.attrs.has('aria-expanded'),false);
 assert.equal(f.mounted(),false);
 assert.equal(syncTimeTrackerSidebar(f.shell,{enabled:true,expanded:true}),true);
 f.selected.textContent='Log';
 syncTimeTrackerSidebar(f.shell,{enabled:true,expanded:true});
 assert.equal(f.crumb().textContent,'› Log');
});

test('disabled placement never mounts the tabs or leaves a stale breadcrumb',()=>{
 const f=fixture();
 syncTimeTrackerSidebar(f.shell,{enabled:true,expanded:true});
 assert.equal(syncTimeTrackerSidebar(f.shell,{enabled:false,expanded:true}),false);
 assert.equal(f.location(),'application');
 assert.equal(f.crumb(),null);
});
