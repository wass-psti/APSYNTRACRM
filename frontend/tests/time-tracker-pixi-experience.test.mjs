import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 PIXI_V8_URL,PIXI_DECORATION_FPS,canRunTimeTrackerPixi,
 mountTimeTrackerPixi,stopTimeTrackerPixi
} from '../time-tracker-pixi-scene.js';
import {renderTimeTrackerNative} from '../time-tracker-ui.js';

const css=readFileSync('frontend/time-tracker-pixi-experience.css','utf8');
const app=readFileSync('frontend/app.js','utf8');
const index=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const sceneCode=readFileSync('frontend/time-tracker-pixi-scene.js','utf8');

test('Pixi v8 is pinned, lazy, decorative, and cannot touch signed data or controls',()=>{
 assert.equal(PIXI_V8_URL,'https://unpkg.com/pixi.js@8.22.0/dist/pixi.min.mjs');
 assert.equal(PIXI_DECORATION_FPS,30);
 assert.match(sceneCode,/await load\(\)/);
 assert.match(sceneCode,/new lib\.Application\(\)/);
 assert.match(sceneCode,/backgroundAlpha:0/);
 assert.match(sceneCode,/preferWebGLVersion:2/);
 assert.match(sceneCode,/powerPreference:'low-power'/);
 assert.match(sceneCode,/new Graphics|new lib\.Graphics|new Graphics\(\)/);
 assert.match(sceneCode,/application\.ticker\.maxFPS=PIXI_DECORATION_FPS/);
 assert.doesNotMatch(sceneCode,/fetch\(|\.rpc\(|\.commit\(|localStorage|sessionStorage|geolocation|access_token|Authorization|WebAssembly|new Worker/);
 assert.doesNotMatch(sceneCode,/\.style\.|\.cssText=|setAttribute\(['"]style|<script/);
});

test('low power, reduced motion, offline and hidden conditions skip GPU setup',()=>{
 for(const options of [
  {hidden:true},{reducedMotion:true},{saveData:true},{online:false},
  {memory:2},{memory:4}
 ])assert.equal(canRunTimeTrackerPixi(options),false);
 assert.equal(canRunTimeTrackerPixi({
  hidden:false,reducedMotion:false,saveData:false,online:true,memory:8
 }),true);
});

test('native attendance DOM remains semantic and GPS or clock inputs unchanged',()=>{
 const markup=renderTimeTrackerNative();
 assert.match(markup,/class="tt-native" aria-label="TimeTracker attendance application"/);
 assert.match(markup,/tt-pixi-backdrop" aria-hidden="true"/);
 assert.match(markup,/data-pixi="fallback"/);
 assert.match(markup,/class="tt-unavailable"/);
 assert.doesNotMatch(markup,/<canvas|style=|onclick=/);
 assert.match(app,/mountTimeTrackerPixi\(root\)/);
 assert.match(app,/function renderLogin\(message=''\)\{\s*stopTimeTrackerClock\(\);\s*stopTimeTrackerPixi\(\);/);
 assert.match(app,/renderTimeTrackerNative\(\{/);
 assert.match(app,/await captureAttendanceGeo\(navigator\.geolocation\)/);
 assert.match(app,/timeTracker\.commit\(boardId/);
});

test('a mocked Pixi scene mounts once, stops when route leaves, and disposes GPU app',async()=>{
 const oldDocument=globalThis.document;
 const oldNavigator=globalThis.navigator;
 const oldMatch=globalThis.matchMedia;
 const oldRatio=globalThis.devicePixelRatio;
 const events=new Set();
 const document={
  hidden:false,
  addEventListener(type,fn){if(type==='visibilitychange')events.add(fn);},
  removeEventListener(type,fn){if(type==='visibilitychange')events.delete(fn);}
 };
 const host={
  isConnected:true,dataset:{pixi:'fallback'},clientWidth:860,clientHeight:114,
  children:[],
  appendChild(node){this.children.push(node);},
  replaceChildren(){this.children=[];}
 };
 const root={querySelector:()=>host};
 const counters={created:0,initialized:0,started:0,stopped:0,destroyed:0,imports:0};
 class Container{
  constructor(){this.position={set(){}};this.scale={set(){}};this.rotation=0;}
  addChild(){}
 }
 class Graphics extends Container{
  circle(){return this;}
  ellipse(){return this;}
  fill(){return this;}
  stroke(){return this;}
 }
 class Application{
  constructor(){
   counters.created++;
   this.stage=new Container();
   this.renderer={};
   this.canvas={setAttribute(){}};
   this.ticker={deltaMS:20,maxFPS:0,add(fn){this.tick=fn;}};
  }
  async init(options){
   counters.initialized++;
   assert.equal(options.autoStart,false);
   assert.equal(options.backgroundAlpha,0);
  }
  start(){counters.started++;}
  stop(){counters.stopped++;}
  destroy(){counters.destroyed++;}
 }
 try{
  Object.defineProperty(globalThis,'document',{value:document,configurable:true});
  Object.defineProperty(globalThis,'navigator',{value:{onLine:true,deviceMemory:8,connection:{saveData:false}},configurable:true});
  globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  globalThis.devicePixelRatio=2;
  const load=async()=>{counters.imports++;return {Application,Container,Graphics};};
  mountTimeTrackerPixi(root,{load});
  for(let i=0;i<10;i++)await Promise.resolve();
  assert.equal(counters.created,1);
  assert.equal(counters.initialized,1);
  assert.equal(host.dataset.pixi,'ready');
  assert.equal(host.children.length,1);
  assert.equal(counters.started,1);
  assert.equal(events.size,1);
  mountTimeTrackerPixi(root,{load});
  assert.equal(counters.imports,1);
  stopTimeTrackerPixi();
  assert.equal(counters.destroyed,1);
  assert.equal(events.size,0);
  assert.equal(host.children.length,0);
  assert.equal(host.dataset.pixi,'fallback');
  stopTimeTrackerPixi();
  assert.equal(counters.destroyed,1);
 }finally{
  stopTimeTrackerPixi();
  if(oldDocument===undefined)delete globalThis.document;
  else Object.defineProperty(globalThis,'document',{value:oldDocument,configurable:true});
  if(oldNavigator===undefined)delete globalThis.navigator;
  else Object.defineProperty(globalThis,'navigator',{value:oldNavigator,configurable:true});
  if(oldMatch===undefined)delete globalThis.matchMedia;
  else globalThis.matchMedia=oldMatch;
  if(oldRatio===undefined)delete globalThis.devicePixelRatio;
  else globalThis.devicePixelRatio=oldRatio;
 }
});

test('premium TimeTracker styles are scoped, responsive and retain reduced-motion fallback',()=>{
 assert.match(css,/#app \.aps-board-shell \.tt-native\{/);
 assert.match(css,/\.tt-pixi-backdrop\[data-pixi="ready"\]::after/);
 assert.match(css,/\.tt-pixi-backdrop canvas\{/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/\.tt-clock-aura/);
 assert.match(css,/\.tt-clock-card/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(prefers-contrast:more\)/);
 assert.doesNotMatch(css,/url\(https?:|@import|@keyframes|animation:.*infinite|will-change/);
 assert.match(index,/frontend\/time-tracker-pixi-experience\.css/);
 assert.match(smoke,/'frontend\/time-tracker-pixi-scene\.js'/);
 assert.match(smoke,/'frontend\/time-tracker-pixi-experience\.css'/);
});
