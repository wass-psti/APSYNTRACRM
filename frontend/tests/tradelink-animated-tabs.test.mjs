import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTradeLinkApplication,captureTradeLinkTabMotion,mountTradeLinkTabMotion} from '../tradelink-application.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';

const workspace='00000000-0000-4000-8000-000000000001';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',
 status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},items:[],columns:[],groups:[]};

test('all three navigation tabs expose a single shared animated indicator',()=>{
 for(const section of ['drafts','documents']){
  const html=renderTradeLinkApplication({detail,workspaceId:workspace,section});
  assert.equal((html.match(/tl-reference-active-indicator/g)||[]).length,1);
  assert.match(html,/data-tl-tab="create"/);
  assert.match(html,/data-tl-tab="documents"/);
  assert.match(html,/data-tl-tab="manual"/);
  assert.match(html,new RegExp('data-tl-tab="'+(section==='drafts'?'create':'documents')+'"[^>]*aria-current="page"'));
 }
 const foreign=renderTradeLinkApplication({...{detail,section:'documents'},workspaceId:'11111111-1111-4111-8111-111111111111'});
 assert.doesNotMatch(foreign,/tl-reference-active-indicator/);
});

function fixture(initial='create'){
 const animations=[];
 const indicator={style:{},hidden:true,
  getAnimations:()=>[],
  animate:(frames,options)=>{animations.push({frames,options});}};
 const nav={scrollLeft:0,scrollTop:0,listeners:{},
  getBoundingClientRect:()=>({left:10,top:10}),
  addEventListener(name,callback){this.listeners[name]=callback;}};
 const tabs=['create','documents','manual'].map((key,i)=>({
  dataset:{tlTab:key},classes:new Set(),active:key===initial,
  getBoundingClientRect:()=>({left:20+i*110,top:20,width:95,height:36}),
  classList:{toggle(name,on){this.last=[name,on];}}
 }));
 const manual={open:false,listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}};
 nav.querySelector=selector=>{
  if(selector==='.tl-reference-active-indicator')return indicator;
  if(selector==='.tl-reference-manual')return manual;
  if(selector==='.tl-reference-manual[open] > summary')return manual.open?tabs[2]:null;
  if(selector.includes('aria-current'))return tabs.find(t=>t.active)||null;
  return null;
 };
 nav.querySelectorAll=()=>tabs;
 const container={querySelector:()=>nav};
 return {nav,tabs,manual,indicator,animations,container};
}

test('indicator interpolates from old active tab to new tab across replaced navigation DOM',()=>{
 const old=fixture('create');
 captureTradeLinkTabMotion(old.container);
 const next=fixture('documents');
 mountTradeLinkTabMotion(next.container);
 assert.equal(next.indicator.hidden,false);
 assert.equal(next.indicator.style.left,'120px');
 assert.equal(next.indicator.style.width,'95px');
 assert.equal(next.animations.length,1);
 assert.deepEqual(next.animations[0].frames.map(frame=>frame.left),['10px','120px']);
 assert.equal(next.animations[0].options.duration,280);
 assert.deepEqual(next.tabs.map(tab=>tab.classList.last[1]),[false,true,false]);
 next.manual.open=true;
 next.manual.listeners.toggle();
 assert.equal(next.animations.length,2);
 assert.deepEqual(next.animations[1].frames.map(frame=>frame.left),['120px','230px']);
 next.manual.open=false;
 next.manual.listeners.toggle();
 assert.equal(next.animations.length,3);
 assert.deepEqual(next.animations[2].frames.map(frame=>frame.left),['230px','120px']);
});

test('reduced motion disables animation without removing active-tab indication',()=>{
 const before=globalThis.matchMedia;
 globalThis.matchMedia=()=>({matches:true});
 try{
  const old=fixture('create'); captureTradeLinkTabMotion(old.container);
  const next=fixture('documents');mountTradeLinkTabMotion(next.container);
  assert.equal(next.animations.length,0);
  assert.equal(next.indicator.style.left,'120px');
  assert.equal(next.indicator.hidden,false);
 }finally{
  if(before===undefined)delete globalThis.matchMedia;
  else globalThis.matchMedia=before;
 }
});
