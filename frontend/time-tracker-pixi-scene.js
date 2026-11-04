/**
 * TimeTracker decorative GPU scene (PixiJS v8.22.0).
 * CSS remains fully functional while this optional, lazy enhancement loads.
 * No attendance data, GPS, identities, credentials, APIs, storage or DOM inputs
 * enter the renderer. Main UI stays semantic HTML.
 */
export const PIXI_V8_URL='https://unpkg.com/pixi.js@8.22.0/dist/pixi.min.mjs';
export const PIXI_DECORATION_FPS=30;
let current=null;
let pixiModule=null;

export function canRunTimeTrackerPixi({
 hidden=globalThis.document?.hidden,
 reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
 saveData=globalThis.navigator?.connection?.saveData,
 memory=globalThis.navigator?.deviceMemory,
 online=globalThis.navigator?.onLine!==false
}={}){
 return hidden!==true&&reducedMotion!==true&&saveData!==true&&online!==false&&
  !(Number.isFinite(memory)&&memory<=4);
}

function clearScene(scene){
 if(!scene)return;
 scene.cancelled=true;
 scene.observer?.disconnect();
 scene.observer=null;
 scene.visibilityObserver?.disconnect();
 scene.visibilityObserver=null;
 if(scene.visibilityListener)document.removeEventListener('visibilitychange',scene.visibilityListener);
 if(scene.motionQuery&&scene.motionListener)
  scene.motionQuery.removeEventListener?.('change',scene.motionListener);
 if(scene.app){
  try{
   scene.app.stop();
   scene.app.destroy({removeView:true},{children:true,texture:true,textureSource:true});
  }catch{/* Disposing an unmounted decoration must not affect attendance. */}
 }
 scene.host?.replaceChildren?.();
 if(scene.host?.isConnected)scene.host.dataset.pixi='fallback';
}

/** Called after the shell replaces its content. Never persist GPU scenes offscreen. */
export function stopTimeTrackerPixi(){
 const scene=current;current=null;
 clearScene(scene);
}

export function mountTimeTrackerPixi(root,{load=()=>import(PIXI_V8_URL)}={}){
 // Prefer the active TimeTracker content, reusing one GPU scene at a time.
 // Other application tabs retain the existing lightweight header decoration.
 const host=root?.querySelector?.('.tt-native .tt-calendar-command .tt-pixi-backdrop')||
  root?.querySelector?.('.tt-native .tt-overtime-command .tt-pixi-backdrop')||
  root?.querySelector?.('.tt-native .tt-my-hours-command .tt-pixi-backdrop')||
  root?.querySelector?.('.tt-native .tt-team-command .tt-pixi-backdrop')||
  root?.querySelector?.('.tt-native .tt-reports-command .tt-pixi-backdrop')||
  root?.querySelector?.('.tt-native .tt-log-command .tt-pixi-backdrop')||
  root?.querySelector?.('.tt-native .tt-overview .tt-pixi-backdrop')||
  root?.querySelector?.('.tt-native .tt-clock-stage .tt-pixi-backdrop')||
  root?.querySelector?.('.tt-native .tt-app-header .tt-pixi-backdrop');
 if(!host){
  stopTimeTrackerPixi();
  return false;
 }
 if(current?.host===host)return current.app!==null;
 stopTimeTrackerPixi();
 if(!canRunTimeTrackerPixi())return false;
 const scene={host,cancelled:false,app:null,observer:null,visibilityObserver:null,
  visibilityListener:null,motionQuery:null,motionListener:null};
 current=scene;
 void (async()=>{
  let application=null;
  try{
   const lib=pixiModule||await load();
   if(scene.cancelled||current!==scene||!host.isConnected)return;
   if(typeof lib?.Application!=='function'||typeof lib?.Container!=='function'||
      typeof lib?.Graphics!=='function')return;
   pixiModule=lib;
   application=new lib.Application();
   await application.init({
    preference:globalThis.navigator?.gpu?['webgpu','webgl']:'webgl',
    preferWebGLVersion:2,powerPreference:'low-power',
    backgroundAlpha:0,antialias:false,autoDensity:false,
    resolution:Math.min(1.25,globalThis.devicePixelRatio||1),
    resizeTo:host,autoStart:false,sharedTicker:false,
    eventFeatures:{move:false,globalMove:false,click:false,wheel:false}
   });
   if(scene.cancelled||current!==scene||!host.isConnected){
    application.destroy({removeView:true},{children:true,texture:true,textureSource:true});
    return;
   }
   scene.app=application;
   const {Container,Graphics}=lib;
   const orbit=new Container();
   const small=new Container();
   const dots=new Graphics();
   const ring=new Graphics().circle(0,0,88)
    .stroke({width:1.2,color:0x8be8ff,alpha:.35});
   const ringInner=new Graphics().circle(0,0,50)
    .stroke({width:1,color:0x89a7ff,alpha:.27});
   const ringFar=new Graphics().ellipse(0,0,132,63)
    .stroke({width:1,color:0x82cafa,alpha:.24});
   const center=new Graphics().circle(0,0,4).fill({color:0xa5d6ff,alpha:.85});
   for(let i=0;i<24;i++){
    const angle=i*2.399963229728653;
    const radius=14+Math.sqrt(i/24)*128;
    dots.circle(Math.cos(angle)*radius,Math.sin(angle)*radius,
     i%6===0?2.1:1.2).fill({color:i%3?0x98ccff:0x7df5ec,alpha:.24+(i%5)*.09});
   }
   orbit.addChild(ring,ringFar,dots);
   small.addChild(ringInner,center);
   application.stage.addChild(orbit,small);
   function layout(){
    if(scene.cancelled||!application.renderer)return;
    const w=host.clientWidth||800,h=host.clientHeight||130;
    orbit.position.set(w*.79,h*.5);
    small.position.set(w*.79,h*.5);
    const scale=Math.max(.58,Math.min(1.05,h/190));
    orbit.scale.set(scale);
    small.scale.set(scale);
   }
   layout();
   if(typeof ResizeObserver==='function'){
    scene.observer=new ResizeObserver(layout);
    scene.observer.observe(host);
   }
   let visible=true;
   if(typeof IntersectionObserver==='function'){
    scene.visibilityObserver=new IntersectionObserver(entries=>{
     visible=entries[0]?.isIntersecting===true;
     if(scene.cancelled)return;
     if(!visible||document.hidden)application.stop();
     else if(canRunTimeTrackerPixi())application.start();
    },{threshold:.02});
    scene.visibilityObserver.observe(host);
   }
   const motionQuery=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
   scene.motionQuery=motionQuery;
   const update=()=>{
    if(scene.cancelled)return;
    if(document.hidden||!visible||!canRunTimeTrackerPixi())application.stop();
    else application.start();
   };
   scene.visibilityListener=update;
   scene.motionListener=update;
   document.addEventListener('visibilitychange',update);
   motionQuery?.addEventListener?.('change',update);
   application.ticker.maxFPS=PIXI_DECORATION_FPS;
   application.ticker.add(ticker=>{
    const delta=Math.min(ticker.deltaMS,50)/1000;
    orbit.rotation+=delta*.13;
    small.rotation-=delta*.09;
   });
   application.canvas.setAttribute('aria-hidden','true');
   application.canvas.setAttribute('tabindex','-1');
   host.appendChild(application.canvas);
   host.dataset.pixi='ready';
   update();
  }catch{
   if(application&&scene.app!==application){
    try{application.destroy({removeView:true},{children:true});}catch{}
   }
   if(current===scene){clearScene(scene);current=null;}
  }
 })();
 return true;
}
