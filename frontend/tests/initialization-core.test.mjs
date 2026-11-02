/** CP-INIT-01: initialization is presentation-only and does not gate auth. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializationPhaseLabel,startInitialization,setInitializationPhase,finishInitialization} from '../initialization-core.js';

test('startup phases describe real work without invented progress or access success',()=>{
 assert.equal(initializationPhaseLabel('startup'),'Preparing frontend…');
 assert.equal(initializationPhaseLabel('authentication'),'Restoring signed session…');
 assert.equal(initializationPhaseLabel('authorization'),'Verifying workspace access…');
 assert.equal(initializationPhaseLabel('workspace'),'Opening authorized workspace…');
 assert.equal(initializationPhaseLabel('fake'),'Preparing frontend…');
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/if\(await auth\.restore\(\)\)/);
 assert.match(app,/setInitializationPhase\('authentication'\)/);
 assert.match(app,/setInitializationPhase\('authorization'\)/);
 assert.match(app,/await refreshWorkspace\(\);\s*setInitializationPhase\('workspace'\)/);
 assert.match(app,/finally\{finishInitialization\(\);\}/);
 assert.ok(app.lastIndexOf('finishInitialization()')>app.lastIndexOf('await onRoute()'));
 assert.doesNotMatch(app,/await startInitialization\(/);
});
test('WebGL starts optionally and is not required for startup completion',()=>{
 const html=readFileSync('index.html','utf8');
 const source=readFileSync('frontend/initialization-core.js','utf8');
 const renderer=readFileSync('frontend/initialization-neural-scene.js','utf8');
 const css=readFileSync('frontend/initialization-core.css','utf8');
 assert.match(html,/id="apsyntra-init"/);
 assert.match(html,/id="apsyntra-init-phase"/);
 assert.match(html,/id="app"><\/div>/);
 assert.match(source,/import\('\.\/initialization-neural-scene\.js'\)/);
 assert.match(source,/prefers-reduced-motion: reduce/);
 assert.match(source,/if\(finished\|\|!overlay\.isConnected\)/);
 assert.match(renderer,/getContext\('webgl2'/);
 assert.match(renderer,/ShaderMaterial/);
 assert.match(renderer,/new THREE\.BufferGeometry/);
 assert.match(renderer,/gsap@3\.12\.5/);
 assert.match(renderer,/three@0\.170\.0/);
 assert.match(renderer,/renderer\.setSize\(w,h,false\)/);
 assert.match(renderer,/renderer\.forceContextLoss\(\)/);
 assert.match(renderer,/geometry\.dispose\(\)/);
 assert.match(renderer,/document\.addEventListener\('visibilitychange'/);
 assert.match(renderer,/document\.removeEventListener\('visibilitychange'/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|access_token|role|permission/);
 assert.doesNotMatch(renderer,/fetch\(|XMLHttpRequest|access_token|role|permission/);
 assert.doesNotMatch(html,/data-progress="\d+"/);
});
test('reduced-motion fallback remains accessible and is removed immediately on readiness',()=>{
 let removed=false;
 const node={dataset:{},isConnected:true,
  classList:{add(v){assert.equal(v,'aps-init-exiting')}},
  setAttribute(k,v){assert.equal(k,'aria-hidden');assert.equal(v,'true')},
  querySelector(sel){assert.equal(sel,'#apsyntra-init-phase');return label},
  remove(){removed=true;this.isConnected=false;},
  addEventListener(){},removeEventListener(){}};
 const label={textContent:''};
 const host={isConnected:true};
 globalThis.document={hidden:false,getElementById(id){
  if(id==='apsyntra-init')return node;
  if(id==='apsyntra-init-scene')return host;
  return null;
 }};
 globalThis.window={WebGL2RenderingContext:function(){},
  matchMedia(){return {matches:true}},clearTimeout(){},setTimeout(){throw Error('Reduced motion must not defer readiness');}};
 startInitialization();
 assert.equal(node.dataset.graphics,'reduced');
 setInitializationPhase('authentication');
 assert.equal(label.textContent,'Restoring signed session…');
 finishInitialization();
 assert.equal(removed,true);
 assert.equal(node.inert,true);
 setInitializationPhase('workspace');
 assert.equal(label.textContent,'Restoring signed session…');
 delete globalThis.document;
 delete globalThis.window;
});
