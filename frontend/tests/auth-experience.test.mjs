import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderAuthMarkup} from '../auth-markup.js';
import {mountAuthExperience} from '../auth-experience.js';

const markup=renderAuthMarkup({year:2026});
test('new login has stable credential field, submit and visibility hooks',()=>{
 assert.match(markup,/class="auth-layout aps-auth-v2"/);
 assert.match(markup,/id="login-form"/);
 assert.match(markup,/id="email" name="email" type="email"/);
 assert.match(markup,/autocomplete="username"/);
 assert.match(markup,/id="password" name="password" type="password"/);
 assert.match(markup,/autocomplete="current-password"/);
 assert.match(markup,/id="login-submit"/);
 assert.match(markup,/data-action="toggle-password"/);
 assert.match(markup,/aria-label="Show password" aria-pressed="false"/);
 assert.match(markup,/No new account is created/);
 assert.match(markup,/© 2026 APSYNTRA CRM/);
 assert.equal((markup.match(/id="login-form"/g)||[]).length,1);
});
test('credential errors remain escaped and announced to assistive technology',()=>{
 const html=renderAuthMarkup({
  message:'Invalid <script>alert("credential")</script> & check',year:2026
 });
 assert.match(html,/class="login-error" role="alert"/);
 assert.match(html,/Invalid &lt;script&gt;alert\(&quot;credential&quot;\)&lt;\/script&gt; &amp; check/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/aria-describedby="auth-login-description"/);
 assert.doesNotMatch(markup,/class="login-error"/);
});
test('marketing art is inert and explicitly illustrative, with accessible headings',()=>{
 assert.match(markup,/<main class="auth-panel"/);
 assert.match(markup,/<h1>Welcome back/);
 assert.match(markup,/aria-labelledby="auth-pitch-title"/);
 assert.match(markup,/id="auth-pitch-title"/);
 assert.match(markup,/aria-hidden="true"/);
 assert.match(markup,/ILLUSTRATIVE PREVIEW/);
 assert.match(markup,/data-auth-scene aria-hidden="true"/);
 assert.match(markup,/<svg class="auth-orbit-art"/);
 assert.doesNotMatch(markup,/\sonclick=|\sonsubmit=|\sonload=/);
 assert.doesNotMatch(markup,/\sstyle="/);
});
test('redesign is scoped to login, and authentication flow and expired session remain unchanged',()=>{
 const source=readFileSync('frontend/app.js','utf8');
 assert.match(source,/import \{renderAuthMarkup\} from '\.\/auth-markup\.js'/);
 assert.match(source,/import \{mountAuthExperience\} from '\.\/auth-experience\.js'/);
 assert.match(source,/root\.innerHTML=renderAuthMarkup\(\{message,notice,mode,registrationEnabled:REGISTRATION_ADMISSION_ENABLED,resetReady:/);
 assert.match(source,/authVisualController=mountAuthExperience\(root\.querySelector\('\.aps-auth-v2'\)\)/);
 assert.match(source,/function shell\(body\)\{\s*stopAuthVisuals\(\)/);
 assert.match(source,/if\(event\.target\.id==='login-form'\)\{event\.preventDefault\(\);login\(event\.target\)/);
 assert.match(source,/await auth\.signIn\(email,password\)/);
 assert.match(source,/await refreshWorkspace\(\)/);
 assert.match(source,/await auth\.signOut\(\)/);
 assert.match(source,/renderLogin\('Session expired\. Please sign in again\.'\)/);
 assert.match(source,/button\.setAttribute\('aria-pressed',String\(f\.type==='text'\)\)/);
});
test('auth styles are scoped, responsive, high-contrast and reduced-motion aware',()=>{
 const css=readFileSync('frontend/auth-experience.css','utf8');
 const html=readFileSync('index.html','utf8');
 assert.match(html,/frontend\/auth-experience\.css/);
 assert.match(css,/#app \.aps-auth-v2/);
 assert.match(css,/@media\(max-width:1020px\)/);
 assert.match(css,/@media\(max-width:540px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(prefers-contrast:more\)/);
 assert.match(css,/\.auth-right\{display:none\}/);
 assert.match(css,/\.auth-submit:disabled/);
 assert.match(css,/\.field input:focus/);
 assert.match(css,/--auth-accent:/);
 assert.doesNotMatch(html,/unsafe-eval|wasm-unsafe-eval/);
});
test('reduced-motion disables both animations and optional graphics',()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 const animations=[];
 globalThis.window={
  matchMedia:()=>({matches:true}),
  WebGL2RenderingContext:class{},requestIdleCallback(){throw Error('Must not initialize GPU in reduced motion');}
 };
 globalThis.document={hidden:false};
 try{
  const layout={
   isConnected:true,querySelectorAll(){return [{
    animate(){animations.push('bad');throw Error('Reduced motion must not animate');}
   }];},querySelector(){return {isConnected:true};}
  };
  const handle=mountAuthExperience(layout,{sceneLoader:async()=>{
   throw Error('Reduced motion must not import renderer');
  }});
  assert.deepEqual(animations,[]);
  handle.destroy();handle.destroy();
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;}
});
test('low-power login mounts immediately without entrance movement or GPU startup',()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 let queried=0,animated=0;
 globalThis.window={
  matchMedia:()=>({matches:false}),
  WebGL2RenderingContext:class{},
  requestIdleCallback(){throw Error('Low-power device must not schedule GPU work');}
 };
 globalThis.document={hidden:false};
 try{
  const layout={isConnected:true,querySelectorAll(){queried++;
    return [{animate(){animated++;}}];},
   querySelector:()=>({isConnected:true})};
  const handle=mountAuthExperience(layout,{device:{hardwareConcurrency:2}});
  assert.equal(queried,0,'login widgets must not be traversed for entrance effects');
  assert.equal(animated,0,'login widgets must appear in their final positions');
  handle.destroy();handle.destroy();
  const source=readFileSync('frontend/auth-experience.js','utf8');
  assert.doesNotMatch(source,/\.animate\s*\(|translate3d\(|auth-reveal/);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;}
});
test('scene loader is cancellable and never gates authentication',async()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 let load=null,loaded=0,destroyed=0;
 globalThis.window={
  matchMedia:query=>({matches:query==='(min-width: 1021px)'}),
  WebGL2RenderingContext:class{},
  requestIdleCallback(cb){load=cb;return 12;},
  cancelIdleCallback(id){assert.equal(id,12);},
  setTimeout(){throw Error('Unexpected timer');}
 };
 globalThis.document={hidden:false};
 try{
  const host={isConnected:true},layout={
   isConnected:true,
   querySelectorAll:()=>[],
   querySelector:()=>host
  };
  const handle=mountAuthExperience(layout,{device:{hardwareConcurrency:8,deviceMemory:8,connection:{saveData:false}},sceneLoader:async()=>{
   loaded++;
   return {createAuthScene:async()=>({destroy(){destroyed++;}})};
  }});
  assert.equal(typeof load,'function');
  handle.destroy();
  await load();
  assert.equal(loaded,0);
  assert.equal(destroyed,0);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;}
});
test('Three shader renders only on resize/visibility and releases GPU resources',()=>{
 const source=readFileSync('frontend/auth-scene.js','utf8');
 assert.match(source,/three@0\.170\.0/);
 assert.match(source,/getContext\('webgl2'/);
 assert.match(source,/new THREE\.ShaderMaterial/);
 assert.match(source,/const FRAGMENT=String\.raw/);
 assert.match(source,/renderer\.setSize\(w,h,false\)/);
 assert.match(source,/powerPreference:'low-power'/);
 assert.match(source,/ResizeObserver\(redraw\)/);
 assert.match(source,/contextLost/);
 assert.match(source,/geometry\.dispose\(\);material\.dispose\(\)/);
 assert.match(source,/renderer\.dispose\(\);renderer\.forceContextLoss\(\)/);
 assert.doesNotMatch(source,/requestAnimationFrame|setInterval|setTimeout/);
});
