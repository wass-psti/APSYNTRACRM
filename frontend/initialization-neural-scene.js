/**
 * APSYNTRA Neural Core — self-contained optional WebGL 2 scene.
 * Renders only while the startup overlay exists. No app-state access.
 */
const THREE_URL='https://unpkg.com/three@0.170.0/build/three.module.js';
const GSAP_URL='https://unpkg.com/gsap@3.12.5/index.js';
const CORE_VERTEX=String.raw`
 uniform float uTime;
 varying vec3 vNormal;
 varying vec3 vWorld;
 void main(){
  vec3 p=position+normal*(0.028*sin(uTime*1.9+position.x*7.0+position.y*6.0));
  vNormal=normalize(normalMatrix*normal);
  vWorld=p;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
 }
`;
const CORE_FRAGMENT=String.raw`
 uniform float uTime;
 uniform float uReveal;
 uniform float uActivity;
 varying vec3 vNormal;
 varying vec3 vWorld;
 void main(){
  vec3 norm=normalize(vNormal);
  float fresnel=pow(1.0-abs(norm.z),2.2);
  float energy=0.5+0.5*sin(3.5*vWorld.y+uTime*1.5);
  vec3 dark=vec3(0.015,0.055,0.20);
  vec3 cyan=vec3(0.04,0.85,1.0);
  vec3 blue=vec3(0.25,0.26,1.0);
  vec3 color=mix(dark,mix(blue,cyan,energy),0.16+fresnel*0.9);
  color+=cyan*0.13*(0.5+0.5*sin(uTime*2.0+vWorld.x*4.0));
  gl_FragColor=vec4(color,(0.65+fresnel*0.34)*uReveal*(0.6+uActivity*0.4));
 }
`;
const PARTICLE_VERTEX=String.raw`
 attribute float aSeed;
 uniform float uTime;
 uniform float uReveal;
 varying float vAlpha;
 void main(){
  vec3 p=position;
  float angle=uTime*(0.14+0.16*aSeed);
  float s=sin(angle),c=cos(angle);
  p.xz=mat2(c,-s,s,c)*p.xz;
  p.y+=0.07*sin(uTime*1.2+aSeed*21.0);
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=min(6.0,1.5+8.0/(-mv.z))*uReveal;
  vAlpha=uReveal*(0.4+0.6*abs(sin(aSeed*27.0+uTime)));
 }
`;
const PARTICLE_FRAGMENT=String.raw`
 uniform float uActivity;
 varying float vAlpha;
 void main(){
  vec2 uv=gl_PointCoord-vec2(0.5);
  float glow=smoothstep(0.5,0.03,length(uv));
  gl_FragColor=vec4(0.20,0.78,1.0,glow*vAlpha*uActivity);
 }
`;
const PREFERENCE_LOW=()=>Boolean((navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||
 (navigator.deviceMemory&&navigator.deviceMemory<=4));
export async function createNeuralScene(host){
 if(!host?.isConnected||typeof window==='undefined')return null;
 const canvas=document.createElement('canvas');
 canvas.className='aps-init-canvas';
 canvas.setAttribute('aria-hidden','true');
 const context=canvas.getContext('webgl2',{alpha:true,antialias:false,
  depth:true,powerPreference:'low-power',preserveDrawingBuffer:false});
 if(!context)return null;
 const [THREE,gsapBundle]=await Promise.all([
  import(THREE_URL),import(GSAP_URL).catch(()=>null)
 ]);
 if(!host.isConnected)return null;
 let renderer;
 try{
  renderer=new THREE.WebGLRenderer({canvas,context,alpha:true,antialias:false,
   powerPreference:'low-power'});
 }catch{return null;}
 host.append(canvas);
 const scene=new THREE.Scene();
 const camera=new THREE.PerspectiveCamera(40,1,0.1,50);
 camera.position.set(0,0,8);
 const group=new THREE.Group();
 scene.add(group);
 const uniforms={uTime:{value:0},uReveal:{value:0},uActivity:{value:0.45}};
 const geometry=new THREE.IcosahedronGeometry(1.27,4);
 const material=new THREE.ShaderMaterial({
  uniforms,vertexShader:CORE_VERTEX,fragmentShader:CORE_FRAGMENT,
  transparent:true,depthWrite:false,side:THREE.DoubleSide
 });
 const core=new THREE.Mesh(geometry,material);
 group.add(core);
 const cageGeometry=new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.59,1));
 const cageMaterial=new THREE.LineBasicMaterial({color:0x31abff,transparent:true,opacity:0.35});
 const cage=new THREE.LineSegments(cageGeometry,cageMaterial);
 group.add(cage);
 const rings=[];
 for(const [radius,angle] of [[2.05,0.22],[2.43,-0.5],[2.72,1.2]]){
  const mesh=new THREE.Mesh(
   new THREE.TorusGeometry(radius,0.007,4,112),
   new THREE.MeshBasicMaterial({color:0x30baff,transparent:true,opacity:0.33,
    blending:THREE.AdditiveBlending,depthWrite:false})
  );
  mesh.rotation.set(angle,0.4+angle,angle*0.5);
  group.add(mesh);rings.push(mesh);
 }
 const count=PREFERENCE_LOW()?120:280;
 const positions=new Float32Array(count*3);
 const seeds=new Float32Array(count);
 for(let i=0;i<count;i++){
  const a=i*2.399963229728653;
  const v=(i+0.5)/count;
  const elevation=Math.acos(1-2*v);
  const radius=2.6+0.9*((i*37%97)/97);
  positions[3*i]=radius*Math.sin(elevation)*Math.cos(a);
  positions[3*i+1]=radius*Math.cos(elevation)*0.76;
  positions[3*i+2]=radius*Math.sin(elevation)*Math.sin(a);
  seeds[i]=((i*41)%count)/count;
 }
 const pointGeometry=new THREE.BufferGeometry();
 pointGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 pointGeometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
 const pointMaterial=new THREE.ShaderMaterial({
  uniforms,vertexShader:PARTICLE_VERTEX,fragmentShader:PARTICLE_FRAGMENT,
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending
 });
 group.add(new THREE.Points(pointGeometry,pointMaterial));
 const activity={target:0.45,value:0.45};
 const progress={reveal:0};
 const gsap=gsapBundle?.gsap;
 const timeline=gsap?.timeline?.({paused:false})||null;
 timeline?.to(progress,{reveal:1,duration:0.85,ease:'power2.out'});
 if(!timeline)progress.reveal=1;
 let active=true;
 let start=performance.now();
 let raf=0;
 let observer=null;
 function resize(){
  if(!active)return;
  const rect=host.getBoundingClientRect();
  const w=Math.max(1,Math.round(rect.width));
  const h=Math.max(1,Math.round(rect.height));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,PREFERENCE_LOW()?1:1.7));
  renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.updateProjectionMatrix();
 }
 const tick=()=>{
  if(!active||document.hidden)return;
  const elapsed=Math.min((performance.now()-start)/1000,3600);
  uniforms.uTime.value=elapsed;
  uniforms.uReveal.value=progress.reveal;
  activity.value+=(activity.target-activity.value)*0.08;
  uniforms.uActivity.value=activity.value;
  for(const ring of rings)ring.material.opacity=0.1+activity.value*0.26;
  group.rotation.y=elapsed*(0.065+0.04*activity.value);
  group.rotation.x=0.18+0.07*Math.sin(elapsed*0.36);
  core.rotation.y=-elapsed*0.17;
  cage.rotation.set(0.3,elapsed*-0.11,elapsed*0.055);
  for(let i=0;i<rings.length;i++)rings[i].rotation.z+=0.0005*(i%2?1:-1);
  renderer.render(scene,camera);
  raf=window.requestAnimationFrame(tick);
 };
 const visibility=()=>{
  if(document.hidden)window.cancelAnimationFrame(raf);
  else if(active){start=performance.now()-uniforms.uTime.value*1000;raf=window.requestAnimationFrame(tick);}
 };
 const lost=event=>{event.preventDefault();window.cancelAnimationFrame(raf);};
 const restored=()=>{if(active){resize();raf=window.requestAnimationFrame(tick);}};
 canvas.addEventListener('webglcontextlost',lost);
 canvas.addEventListener('webglcontextrestored',restored);
 document.addEventListener('visibilitychange',visibility);
 if(window.ResizeObserver){observer=new ResizeObserver(resize);observer.observe(host);}
 else window.addEventListener('resize',resize);
 resize();
 raf=window.requestAnimationFrame(tick);
 return {setPhase(phase){
  activity.target=({startup:0.45,authentication:0.62,
   authorization:0.80,workspace:1})[phase]??0.45;
 },destroy(){
  if(!active)return;
  active=false;
  timeline?.kill?.();
  window.cancelAnimationFrame(raf);
  observer?.disconnect();
  if(!observer)window.removeEventListener('resize',resize);
  document.removeEventListener('visibilitychange',visibility);
  canvas.removeEventListener('webglcontextlost',lost);
  canvas.removeEventListener('webglcontextrestored',restored);
  geometry.dispose();material.dispose();
  cage.geometry.dispose();cage.material.dispose();
  pointGeometry.dispose();pointMaterial.dispose();
  for(const mesh of rings){mesh.geometry.dispose();mesh.material.dispose();}
  renderer.dispose();renderer.forceContextLoss();
  canvas.remove();
 }};
}
