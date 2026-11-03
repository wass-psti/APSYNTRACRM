/**
 * Optional login-panel ambient illustration, using the already-approved pinned
 * Three.js version. It renders once and on resize, not an infinite GPU loop.
 * CSS remains a complete and accessible fallback when WebGL2/CDN is absent.
 */
const THREE_URL='https://unpkg.com/three@0.170.0/build/three.module.js';
const VERTEX=String.raw`
 varying vec2 vUv;
 void main(){
  vUv=uv;
  gl_Position=vec4(position.xy,0.0,1.0);
 }
`;
const FRAGMENT=String.raw`
 precision highp float;
 varying vec2 vUv;
 float halo(vec2 p,vec2 c,float spread){
  float d=length((p-c)*vec2(1.0,1.12));
  return exp(-d*d*spread);
 }
 void main(){
  vec2 uv=vUv;
  float cyan=halo(uv,vec2(0.21,0.68),16.0);
  float violet=halo(uv,vec2(0.88,0.31),10.0);
  float indigo=halo(uv,vec2(0.55,0.85),25.0);
  float arc=abs(length((uv-vec2(0.77,0.65))*vec2(1.0,1.1))-0.40);
  float ring=(1.0-smoothstep(0.001,0.012,arc))*0.15;
  float highlight=smoothstep(0.35,0.97,uv.y);
  vec3 color=vec3(0.18,0.45,0.92)*cyan+
   vec3(0.51,0.25,0.92)*violet+
   vec3(0.20,0.37,0.83)*indigo+
   vec3(0.37,0.68,0.96)*(ring+highlight*0.04);
  float opacity=clamp(cyan*0.20+violet*0.17+indigo*0.15+ring,0.0,0.32);
  gl_FragColor=vec4(color,opacity);
 }
`;

/** @param {HTMLElement} host */
export async function createAuthScene(host){
 if(!host?.isConnected||typeof window==='undefined'||document.hidden)return null;
 // Do not allocate a GPU context while the remotely pinned module is loading.
 const THREE=await import(THREE_URL);
 if(!host.isConnected||document.hidden)return null;
 const canvas=document.createElement('canvas');
 canvas.className='auth-ambient-canvas';
 canvas.setAttribute('aria-hidden','true');
 const context=canvas.getContext('webgl2',{
  alpha:true,antialias:false,depth:false,stencil:false,
  powerPreference:'low-power',preserveDrawingBuffer:false
 });
 if(!context)return null;
 let renderer;
 try{
  renderer=new THREE.WebGLRenderer({canvas,context,alpha:true,antialias:false,
   powerPreference:'low-power'});
 }catch{
  canvas.remove();
  return null;
 }
 if(!host.isConnected){renderer.dispose();renderer.forceContextLoss();return null;}
 host.append(canvas);
 const scene=new THREE.Scene();
 const camera=new THREE.OrthographicCamera(-1,1,1,-1,0.01,10);
 camera.position.z=2;
 const geometry=new THREE.PlaneGeometry(2,2,1,1);
 const material=new THREE.ShaderMaterial({
  vertexShader:VERTEX,fragmentShader:FRAGMENT,
  transparent:true,depthTest:false,depthWrite:false
 });
 const plane=new THREE.Mesh(geometry,material);
 scene.add(plane);
 let destroyed=false;
 let observer=null;
 function redraw(){
  if(destroyed||!host.isConnected||document.hidden)return;
  const rect=host.getBoundingClientRect();
  const w=Math.max(1,Math.round(rect.width));
  const h=Math.max(1,Math.round(rect.height));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));
  renderer.setSize(w,h,false);
  renderer.render(scene,camera);
 }
 const visibility=()=>{if(!document.hidden)redraw();};
 const contextLost=event=>{event.preventDefault();};
 const contextRestored=()=>{if(!destroyed)redraw();};
 canvas.addEventListener('webglcontextlost',contextLost);
 canvas.addEventListener('webglcontextrestored',contextRestored);
 document.addEventListener('visibilitychange',visibility);
 if(typeof ResizeObserver==='function'){
  observer=new ResizeObserver(redraw);observer.observe(host);
 }else window.addEventListener('resize',redraw);
 redraw();
 return {destroy(){
  if(destroyed)return;
  destroyed=true;
  observer?.disconnect();
  if(!observer)window.removeEventListener('resize',redraw);
  document.removeEventListener('visibilitychange',visibility);
  canvas.removeEventListener('webglcontextlost',contextLost);
  canvas.removeEventListener('webglcontextrestored',contextRestored);
  geometry.dispose();material.dispose();
  renderer.dispose();renderer.forceContextLoss();
  canvas.remove();
 }};
}
