import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPagesAcceptance} from '../pages-acceptance-ui.js';
import {pagesAcceptanceIcon,mountPagesAcceptanceMotion,stopPagesAcceptanceMotion} from '../pages-acceptance-visuals.js';

const app=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/pages-acceptance-experience.css','utf8');
const ui=readFileSync('frontend/pages-acceptance-ui.js','utf8');
const html=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const qaBoard={id:'11111111-1111-4111-8111-111111111111',name:'APSYNTRA QA'};
function count(body,regex){return (body.match(regex)||[]).length}

test('five annotated regions are routed and visually scoped to Pages acceptance',()=>{
 const page=renderPagesAcceptance({qaBoard});
 assert.ok(page.startsWith('<div class="aps-pages-acceptance">'));
 assert.ok(page.endsWith('</div>'));
 assert.match(page,/class="page-head pages-hero pages-entrance" aria-labelledby="pages-title"/);
 assert.match(page,/class="panel pages-backend-panel pages-entrance"/);
 assert.match(page,/id="pages-title"/);
 assert.match(page,/id="pages-backend-title"/);
 assert.match(page,/class="pages-hero-tags"/);
 assert.match(page,/class="pages-test-grid"/);
 assert.match(app,/classList\.toggle\('aps-pages-shell',state\.view==='acceptance'\)/);
 assert.match(app,/mountPagesAcceptanceMotion\(root\.querySelector\('\.aps-pages-acceptance'\),state\.view\)/);
 assert.match(app,/stopPagesAcceptanceMotion\(\)/);
 assert.match(app,/else if\(state\.view==='acceptance'\)shell\(renderPagesAcceptance\(/);
 assert.ok(html.includes('frontend/pages-acceptance-experience.css'));
 for(const asset of ['frontend/pages-acceptance-experience.css','frontend/pages-acceptance-visuals.js'])
  assert.ok(smoke.includes("'"+asset+"'"),asset);
});

test('exact QA board remains the only display path for signed write test actions',()=>{
 const page=renderPagesAcceptance({qaBoard});
 assert.equal(count(page,/data-action="run-pages-acceptance"/g),1);
 assert.equal(count(page,/data-action="run-native-acceptance"/g),1);
 assert.ok(page.includes('APSYNTRA QA'));
 assert.ok(page.includes('QA only'));
 assert.ok(page.includes('Isolated board')===false); // uppercase, accessible board label remains present
 assert.ok(page.includes('ISOLATED BOARD'));
 assert.match(page,/You must confirm that this board is isolated from production work/);
 assert.match(page,/explicit, real-write acceptance test/);
 assert.match(page,/No test account or privileged API key is used/);
 for(const action of ['run-pages-acceptance','run-native-acceptance']){
  assert.ok(app.includes("case '"+action+"'"),action);
 }
 assert.match(app,/Type APSYNTRA QA to confirm/);
 assert.match(app,/String\(fd\.get\('ack'\)\|\|''\)\.trim\(\)!==QA_BOARD_NAME/);
 assert.match(app,/runPagesPersistenceAcceptance\(db,\{board:qa,context:state\.context\}\)/);
 assert.match(app,/runNativeQa\(db,\{board:qa,context:state\.context\}\)/);
});

test('missing QA board hides both mutation buttons and links to existing boards',()=>{
 const page=renderPagesAcceptance();
 assert.match(page,/No active board named <strong>APSYNTRA QA<\/strong> is available/);
 assert.match(page,/Create a dedicated, isolated nonproduction board/);
 assert.match(page,/href="#\/boards"/);
 assert.doesNotMatch(page,/data-action="run-pages-acceptance"|data-action="run-native-acceptance"/);
 assert.doesNotMatch(page,/pages-test-secondary/);
 assert.doesNotMatch(page,/QA only/);
 assert.match(page,/role="status"/);
});

test('busy and idle buttons preserve existing dispatch IDs and disabled states',()=>{
 const idle=renderPagesAcceptance({qaBoard});
 assert.match(idle,/data-action="run-pages-acceptance" >.*Run signed persistence acceptance/s);
 assert.match(idle,/data-action="run-native-acceptance" >.*Verify hosted native transactions/s);
 const busy=renderPagesAcceptance({qaBoard,running:true,nativeRunning:true});
 assert.match(busy,/data-action="run-pages-acceptance" disabled>/);
 assert.match(busy,/data-action="run-native-acceptance" disabled>/);
 assert.match(busy,/Running acceptance…/);
 assert.match(busy,/Running native verification…/);
});

test('real persisted acceptance results retain totals, checks, caveats and cleanup warnings',()=>{
 const page=renderPagesAcceptance({qaBoard,
  result:{status:'pass',passed:2,total:2,steps:[
   {name:'Signed add',detail:'Created QA item'},{name:'Audit',detail:'Recorded'}]},
  nativeResult:{status:'pass',passed:1,total:1,steps:[
   {name:'Native create',detail:'Protected'}]}
 });
 assert.match(page,/Result: PASS — 2\/2 checks/);
 assert.match(page,/Native transaction result: PASS — 1\/1/);
 assert.match(page,/Signed add/);
 assert.match(page,/Native create/);
 assert.match(page,/CAS denial, tombstones and audit records passed/);
 assert.match(page,/remaining application boards are outside this test/);
 assert.match(page,/other application boards and role-revocation scenarios remain separate acceptance requirements/);
 assert.match(page,/aria-live="polite"/);
 assert.match(page,/aria-relevant="additions text"/);
 const fail=renderPagesAcceptance({qaBoard,
  result:{status:'fail',passed:1,total:3,steps:[],error:'Write conflict',cleanupConfirmed:false},
  nativeResult:{status:'fail',passed:0,total:1,steps:[],error:'Forbidden',cleanupConfirmed:true}
 });
 assert.match(fail,/Write conflict/);
 assert.match(fail,/QA test issue may remain for review/);
 assert.match(fail,/QA issue was tombstoned/);
 assert.equal(count(fail,/role="alert"/g),2);
});

test('server-derived board names and results never render untrusted markup',()=>{
 const page=renderPagesAcceptance({
  qaBoard:{id:qaBoard.id,name:'<img src=x onerror=alert(1)>'},
  result:{status:'pass',passed:1,total:1,steps:[
   {name:'<svg onload=alert(2)>',detail:'<script>throw 1</script>'}],
   error:'<iframe srcdoc=bad>',cleanupConfirmed:false},
  nativeResult:{status:'fail',passed:0,total:1,steps:[
   {name:'<b>name</b>',detail:'<button onclick=alert(3)>'}],
   error:'<img src=x onerror=alert(4)>',cleanupConfirmed:true}
 });
 for(const bad of ['<img src=x','<svg onload=','<script>','<iframe','<button onclick=','<b>name</b>'])
  assert.ok(!page.includes(bad),bad);
 for(const good of ['&lt;img src=x onerror=alert(1)&gt;',
  '&lt;svg onload=alert(2)&gt;','&lt;script&gt;throw 1&lt;/script&gt;',
  '&lt;iframe srcdoc=bad&gt;','&lt;b&gt;name&lt;/b&gt;',
  '&lt;button onclick=alert(3)&gt;','&lt;img src=x onerror=alert(4)&gt;'])
  assert.ok(page.includes(good),good);
 assert.doesNotMatch(page,/<(?:div|span|button|section|h1|h2|h3|a|p|svg)[^>]*\s(?:onclick|oninput|onload|style)=/i);
});

test('static SVGs and native WAAPI keep privileged acceptance UI free of animation loops',()=>{
 for(const kind of ['shield','database','checks','arrows','lock','warning','play','check','layers','external']){
  const svg=pagesAcceptanceIcon(kind);
  assert.match(svg,/^<svg class="pages-icon"/);
  assert.match(svg,/aria-hidden="true"/);
  assert.doesNotMatch(svg,/onload|onclick|<script|style=/);
 }
 assert.equal(pagesAcceptanceIcon('invalid'),pagesAcceptanceIcon('shield'));
 const visuals=readFileSync('frontend/pages-acceptance-visuals.js','utf8');
 assert.doesNotMatch(visuals,/WebGL|requestAnimationFrame|setInterval|fetch\(|XMLHttpRequest|new Worker/);
 assert.doesNotMatch(visuals,/\.style\s*\.|\.cssText\s*=|setAttribute\s*\(\s*['"]style/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage|fetch\(|XMLHttpRequest|new Worker/);
});

test('responsive, focus-visible, reduced motion and high contrast are route-scoped',()=>{
 for(const rule of ['#app .aps-pages-shell','#app .aps-pages-acceptance',
  '.pages-hero','.pages-test-grid','.pages-run-primary:focus-visible',
  '.pages-run-secondary:focus-visible','.pages-open-boards:focus-visible',
  '@media(max-width:1190px)','@media(max-width:800px)',
  '@media(max-width:600px)','@media(max-width:380px)',
  '@media(prefers-reduced-motion:reduce)','@media(prefers-contrast:more)'])
  assert.ok(css.includes(rule),rule);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.match(css,/grid-template-columns:1fr/);
 assert.doesNotMatch(css,/@import|url\(\s*https?:|animation:.*infinite/);
});

test('one-shot route entrance cancels on rerender, leave, hidden tab and reduced motion',()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 let started=0,canceled=0;
 const nodes=Array.from({length:3},()=>({animate(frames,options){
  started++;assert.equal(frames.length,2);assert.equal(options.fill,'none');
  return {cancel(){canceled++}};
 }}));
 const section={isConnected:true,querySelectorAll(selector){
  assert.equal(selector,'.pages-entrance');return nodes;
 }};
 try{
  globalThis.window={matchMedia:()=>({matches:false})};
  globalThis.document={hidden:false};
  stopPagesAcceptanceMotion();
  mountPagesAcceptanceMotion(section,'acceptance');assert.equal(started,3);
  mountPagesAcceptanceMotion(section,'acceptance');assert.equal(started,3);
  assert.equal(canceled,3);
  mountPagesAcceptanceMotion(null,'overview');
  mountPagesAcceptanceMotion(section,'acceptance');assert.equal(started,6);
  stopPagesAcceptanceMotion();assert.equal(canceled,6);
  globalThis.window={matchMedia:()=>({matches:true})};
  mountPagesAcceptanceMotion(section,'acceptance');assert.equal(started,6);
  stopPagesAcceptanceMotion();
  globalThis.window={matchMedia:()=>({matches:false})};
  globalThis.document={hidden:true};
  mountPagesAcceptanceMotion(section,'acceptance');assert.equal(started,6);
 }finally{
  stopPagesAcceptanceMotion();
  globalThis.window=oldWindow;
  globalThis.document=oldDocument;
 }
});

test('QA page markup is structurally balanced and uses no inline click handlers',()=>{
 for(const page of [renderPagesAcceptance(),renderPagesAcceptance({qaBoard}),
  renderPagesAcceptance({qaBoard,result:{status:'fail',passed:0,total:0,steps:[]}})]){
  for(const tag of ['div','section','span','p','h1','h2','h3','button','a']){
   const opened=count(page,new RegExp('<'+tag+'(?:\\s|>)','g'));
   const closed=count(page,new RegExp('</'+tag+'>','g'));
   assert.equal(opened,closed,tag+' tags');
  }
  assert.doesNotMatch(page,/\son(click|load|input)=|style=/i);
 }
});
