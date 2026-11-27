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
 assert.match(app,/if\(await startupVerifiedRead\(async\(\)=>await auth\.restore\(\)\)\)/);
 assert.match(app,/state\.user=auth\.session\.user;\s*await restoreSavedWorkspacePreference\(\);\s*startupCriticalPath\.phase\('workspace-authorization'\)/);
 assert.match(app,/await auth\.signIn\(email,password\);\s*await restoreSavedWorkspacePreference\(\);\s*await refreshWorkspace\(\)/);
 assert.match(app,/setInitializationPhase\('authentication'\)/);
 assert.match(app,/setInitializationPhase\('authorization'\)/);
 assert.match(app,/await startupVerifiedRead\(async\(\)=>await refreshWorkspace\(\),\{/);
 assert.match(app,/startupRecoveryStage='route';\s*setInitializationPhase\('workspace'\)/);
 assert.match(app,/finally\{\s*startupCriticalPath\.end\(\{authenticated:outcome==='AUTHENTICATED'\}\);\s*window\.__APSYNTRA_STARTUP\?\.resolve\(outcome\);\s*finishInitialization\(\);\s*startupBusy=false;/);
 assert.match(app,/if\(pendingExternalSignIn\)/);
 assert.match(app,/if\(workspacePreferenceSyncQueued\)/);
 assert.ok(app.lastIndexOf('finishInitialization()')>app.lastIndexOf('await onRoute()'));
 assert.doesNotMatch(app,/await startInitialization\(/);
});
test('first paint matches the existing TimeTracker shared loader',()=>{
 const html=readFileSync('index.html','utf8');
 const source=readFileSync('frontend/initialization-core.js','utf8');
 const css=readFileSync('frontend/initialization-core.css','utf8');
 const shared=readFileSync('frontend/board/presentation/loading.js','utf8');
 const markup=html.slice(html.indexOf('<div id="apsyntra-init"'),html.indexOf('<div id="app">'));
 for(const cls of ['apx-loader','apx-loader__inner','apx-loader__logo','apx-loader__title','apx-loader__sub','apx-loader__track','apx-loader__bar']){
  assert.ok(markup.includes(cls),cls);
  assert.ok(shared.includes(cls),cls);
 }
 assert.ok(markup.includes('APSYNTRA <span>CRM</span>'));
 assert.ok(markup.includes('Loading your workspace…'));
 assert.ok(markup.includes('apsyntra-logo.webp'));
 assert.ok(markup.includes('aria-atomic="true"'));
 assert.ok(markup.includes('id="apsyntra-init-phase"'));
 assert.ok(html.includes('<div id="app"></div>'));
 assert.ok(!markup.includes('aps-init-orb'));
 assert.ok(!source.includes('initialization-neural-scene'));
 assert.ok(!source.includes('WebGL'));
 assert.ok(css.includes('min-height:100dvh'));
 assert.ok(css.includes('prefers-reduced-motion:reduce'));
 assert.ok(css.includes('.aps-init-retry:focus-visible'));
 const app=readFileSync('frontend/app.js','utf8');
 assert.ok(app.includes('if(initialAccountRoleReadPending){root.innerHTML=sharedApplicationLoading();return;}'));
 assert.equal(app.split('startInitialization();').length,2);
});
test('reduced-motion readiness removes the overlay and its visibility listener without remounting it',()=>{
 let removed=false,listener=null;
 const node={dataset:{phase:'startup'},isConnected:true,
  classList:{add(v){assert.equal(v,'aps-init-exiting')}},
  setAttribute(k,v){assert.equal(k,'aria-hidden');assert.equal(v,'true')},
  querySelector(sel){assert.equal(sel,'#apsyntra-init-phase');return label},
  remove(){removed=true;this.isConnected=false;},
  addEventListener(){},removeEventListener(){}};
 const label={textContent:''};
 globalThis.document={hidden:false,getElementById(id){return id==='apsyntra-init'&&!removed?node:null;},
  addEventListener(type,fn){assert.equal(type,'visibilitychange');listener=fn;},
  removeEventListener(type,fn){assert.equal(type,'visibilitychange');assert.equal(fn,listener);listener=null;}};
 globalThis.window={matchMedia(){return {matches:true}},clearTimeout(){},setTimeout(){throw Error('Reduced motion must not defer readiness');}};
 try{
  startInitialization();
  assert.equal(node.dataset.paused,'false');
  document.hidden=true;listener();
  assert.equal(node.dataset.paused,'true');
  document.hidden=false;listener();
  assert.equal(node.dataset.paused,'false');
  setInitializationPhase('authentication');
  assert.equal(label.textContent,'Restoring signed session…');
  finishInitialization();
  assert.equal(removed,true);
  assert.equal(node.inert,true);
  assert.equal(listener,null);
  startInitialization();
  setInitializationPhase('workspace');
  assert.equal(label.textContent,'Restoring signed session…');
 }finally{delete globalThis.document;delete globalThis.window;}
});
test('fatal startup recovery is still actionable and stops the loading animation',()=>{
 const guard=readFileSync('frontend/startup-guard.js','utf8');
 assert.ok(guard.includes("node.dataset.paused='true'"));
 assert.ok(guard.includes("node.querySelector('.aps-init-content')"));
 assert.ok(guard.includes("button.className='aps-init-retry'"));
 assert.ok(guard.includes('window.location.reload()'));
});
