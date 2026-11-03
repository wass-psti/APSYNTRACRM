import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSecurityAcceptance} from '../board-security-ui.js';
import {TARGET_WORKSPACE_ID} from '../board-security-targets.js';
import {mountSecurityMotion,stopSecurityMotion} from '../security-experience.js';
const app=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/security-experience.css','utf8');
const ui=readFileSync('frontend/board-security-ui.js','utf8');
const html=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const context={
 user_id:'11111111-1111-4111-8111-111111111111',
 workspace_id:'22222222-2222-4222-8222-222222222222',
 profile:{status:'active',platform_role:'employee'}
};
const target='33333333-3333-4333-8333-333333333333';

test('security visual refresh is isolated to #/security and preserves signed shell',()=>{
 const out=renderSecurityAcceptance({context});
 assert.ok(out.startsWith('<div class="aps-security">'));
 assert.ok(out.endsWith('</div>'));
 assert.ok(out.includes('class="page-head security-hero security-entrance"'));
 assert.ok(out.includes('aria-labelledby="security-title"'));
 assert.equal((out.match(/class="panel security-check-panel security-entrance"/g)||[]).length,9);
 assert.equal((out.match(/class="panel-header security-panel-header"/g)||[]).length,9);
 assert.equal((out.match(/<\/section>/g)||[]).length,10);
 assert.ok(out.includes('class="note security-note csp-u050 security-boundary-note" role="note"'));
 assert.ok(app.includes("classList.toggle('aps-security-shell',state.view==='security')"));
 assert.ok(app.includes("mountSecurityMotion(root.querySelector('.aps-security'),state.view)"));
 assert.ok(app.includes("stopSecurityMotion()"));
 assert.ok(html.includes('frontend/security-experience.css'));
 for(const asset of ['frontend/security-experience.css','frontend/security-experience.js']){
  assert.ok(smoke.includes("'"+asset+"'"),asset);
 }
});

test('all nine checkpoint cards and legacy action IDs remain intact',()=>{
 const out=renderSecurityAcceptance({context});
 for(const label of [
  'Existing signed session',
  'FRT centralized role and signed-session acceptance',
  'CI07 · Production signed FRT session check',
  'SEC14 · Signed restricted FRT reads',
  'SEC14 · Independent nonbootstrap / foreign-workspace denial',
  'CP-FRT-SEC07 · CRM platform-role activation',
  'CP-FRT-SEC09 · Signed platform-role acceptance',
  'Signed effective-permissions inspection · CP-FRT-SEC11',
  'CP-FRT-SEC10 · Controlled transition read-only probe'
 ])assert.ok(out.includes(label),label);
 for(const id of [
  'security-run-negative','security-frt-readonly',
  'security-ci07-readonly','security-sec14-readonly',
  'security-sec14-denial','security-sec07-readonly',
  'security-sec09-readonly','security-effective-access',
  'security-sec10-readonly'
 ]){
  assert.ok(out.includes('data-action="'+id+'"'),id);
  assert.ok(app.includes("case '"+id+"'"),id+' handler');
 }
 assert.ok(out.includes('id="sec10-board"'));
 assert.ok(out.includes('id="sec10-stage"'));
 assert.ok(out.includes('value="VIEWER"'));
 assert.ok(out.includes('value="SUPERVISOR"'));
 assert.ok(out.includes('value="RESTORED"'));
 assert.ok(out.includes('A PASS would be misleading')||out.includes('No impersonation, role switching'));
});

test('read-only denial semantics and administrator / bootstrap restrictions are not weakened',()=>{
 const out=renderSecurityAcceptance({context,sec10IsBootstrap:true,sec10Boards:[
  {id:target,name:'Existing board'}]});
 assert.ok(out.includes('data-action="security-sec10-readonly" disabled'));
 assert.ok(out.includes('This session is a verified bootstrap administrator'));
 assert.ok(out.includes('Sign out before testing.'));
 assert.ok(out.includes('It never performs an INSERT, UPDATE or DELETE.'));
 assert.ok(out.includes('No impersonation, role switching, or temporary accounts.'));
 assert.ok(out.includes('A successful negative result cannot substitute'));
 const administrator=renderSecurityAcceptance({context:{...context,workspace_id:TARGET_WORKSPACE_ID,profile:{status:'active',platform_role:'admin_general_manager'}}});
 assert.ok(administrator.includes('Administrator session — not eligible'));
 assert.ok(administrator.includes('data-action="security-run-negative" disabled'));
 assert.ok(ui.includes("eligible==='admin_not_eligible'"));
 assert.ok(ui.includes("busy||eligible==='not_eligible'||eligible==='admin_not_eligible'?'disabled'"));
 assert.ok(app.includes('PROVISION 12 BOARDS')||app.includes('security-sec10-readonly'));
});

test('dynamic reports and stage options continue to escape untrusted content',()=>{
 const out=renderSecurityAcceptance({
  context,
  sec10Boards:[{id:target,name:'<script>alert(1)</script>'}],
  sec10Result:{status:'BLOCKED',phase:'VIEWER',scenario:'NONBOOTSTRAP',
   reason:'<img src=x onerror=alert(1)>',checks:[]},
  sec14Result:{status:'BLOCKED',role:'<svg onload=alert(1)>',
   checks:[],reason:'Denied'}
 });
 assert.ok(out.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert.ok(out.includes('&lt;img src=x onerror=alert(1)&gt;'));
 assert.ok(out.includes('&lt;svg onload=alert(1)&gt;'));
 assert.doesNotMatch(out,/<script>|<img src=x|<svg onload=/);
 assert.doesNotMatch(out,/\sonclick=|\soninput=|\sstyle="/);
 assert.ok(out.includes('Signed scenario: NONBOOTSTRAP'));
 assert.ok(out.includes('SEC10 signed capability result: BLOCKED'));
 assert.ok(out.includes('Fresh Auth session independently verified: NO'));
});

test('scoped CSS provides accessible controls, responsive cards and no persistent animations',()=>{
 for(const rule of [
  '#app .aps-security-shell','#app .aps-security',
  '.security-panel-header','.security-boundary-note',
  '.sec10-select:focus-visible',
  '.security-check-panel button:focus-visible',
  '@media(max-width:950px)','@media(max-width:650px)',
  '@media(max-width:395px)','@media(prefers-reduced-motion:reduce)',
  '@media(prefers-contrast:more)'
 ])assert.ok(css.includes(rule),rule);
 assert.ok(css.includes('overflow-x:auto'));
 assert.ok(css.includes('counter-increment:security-checkpoint'));
 assert.doesNotMatch(css,/@import|url\(\s*https?:|animation:.*infinite/);
 const motion=readFileSync('frontend/security-experience.js','utf8');
 assert.doesNotMatch(motion,/WebGL|requestAnimationFrame|setInterval|fetch\(|XMLHttpRequest|new Worker/);
 assert.doesNotMatch(motion,/\.style\s*\.|\.cssText\s*=|setAttribute\s*\(\s*['"]style/);
});

test('short native entrance motion is cancellable and respects reduced motion and hidden document',()=>{
 const priorWindow=globalThis.window,priorDocument=globalThis.document;
 let starts=0,stops=0;
 const blocks=Array.from({length:3},()=>({animate(keys,options){
  starts++;assert.equal(keys.length,2);assert.equal(options.fill,'none');
  return {cancel(){stops++;}};
 }}));
 const root={isConnected:true,querySelectorAll(selector){
  assert.equal(selector,'.security-entrance');return blocks;
 }};
 try{
  globalThis.window={matchMedia:()=>({matches:false})};
  globalThis.document={hidden:false};
  stopSecurityMotion();
  mountSecurityMotion(root,'security');assert.equal(starts,3);
  mountSecurityMotion(root,'security');assert.equal(starts,3);
  assert.equal(stops,3);
  mountSecurityMotion(null,'boards');
  mountSecurityMotion(root,'security');assert.equal(starts,6);
  stopSecurityMotion();assert.equal(stops,6);
  globalThis.window={matchMedia:()=>({matches:true})};
  mountSecurityMotion(root,'security');assert.equal(starts,6);
  stopSecurityMotion();
  globalThis.window={matchMedia:()=>({matches:false})};
  globalThis.document={hidden:true};
  mountSecurityMotion(root,'security');assert.equal(starts,6);
 }finally{
  stopSecurityMotion();globalThis.window=priorWindow;globalThis.document=priorDocument;
 }
});
