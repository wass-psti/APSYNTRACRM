import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {settingsIcon,mountSettingsMotion,stopSettingsMotion} from '../settings-visuals.js';

const app=readFileSync('frontend/app.js','utf8');
const css=readFileSync('frontend/settings-experience.css','utf8');
const html=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');
const begin=app.indexOf('function settingsPage(){');
const end=app.indexOf('function preserveTimeTrackerLogExpansion(){');
assert.ok(begin>0&&end>begin,'Settings page must retain an identifiable function');
const functionSource=app.slice(begin,end);
const escaped=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

function render(overrides={}){
 const state={
  context:{user_id:'11111111-1111-4111-8111-111111111111',profile:{
   platform_role:'employee',email:'operator@example.invalid',status:'active'}},
  user:{email:'fallback@example.invalid'},
  acceptanceBusy:false,acceptance:null,boardTtSignedBusy:false,boardTtSignedResult:null,
  roleVerified:true, // Verified bootstrap session exercises the protected session controls.
  ...overrides
 };
 const name=()=>overrides.displayName??'Example Operator';
 const fn=runInNewContext('('+functionSource+')',{
  state,e:escaped,name,initials:()=> 'EO',
  workspaceName:()=>overrides.workspaceName??'Test Workspace',
  settingsIcon,summarizeAcceptance:items=>({
   total:items.length,passed:items.filter(item=>item.status==='pass').length
  })
 });
 return String(fn());
}
function count(html,pattern){return (html.match(pattern)||[]).length;}

test('scope, page header, topbar, stylesheet and exact-commit smoke assets are integrated',()=>{
 const page=render();
 assert.ok(page.startsWith('<div class="aps-settings">'));
 assert.ok(page.endsWith('</div>'));
 assert.match(page,/class="page-head settings-hero settings-entrance" aria-labelledby="settings-title"/);
 assert.match(page,/id="settings-title"/);
 assert.match(page,/class="settings-hero-status"/);
 assert.match(page,/class="settings-grid"/);
 assert.match(page,/aria-labelledby="settings-profile-heading"/);
 assert.match(page,/aria-labelledby="settings-session-heading"/);
 assert.match(app,/classList\.toggle\('aps-settings-shell',state\.view==='settings'\)/);
 assert.match(app,/mountSettingsMotion\(root\.querySelector\('\.aps-settings'\),state\.view\)/);
 assert.match(app,/stopSettingsMotion\(\)/);
 assert.match(html,/frontend\/settings-experience\.css/);
 for(const asset of ['frontend/settings-experience.css','frontend/settings-visuals.js']){
  assert.ok(smoke.includes("'"+asset+"'"),asset);
 }
 assert.match(app,/else if\(state\.view==='settings'\)shell\(settingsPage\(\)\)/);
});

test('profile preserves authoritative identity fields, user ID and signed workspace context',()=>{
 const page=render();
 assert.match(page,/Profile information/);
 assert.match(page,/Supabase Auth/);
 assert.match(page,/Example Operator/);
 assert.match(page,/operator@example.invalid/);
 assert.match(page,/11111111-1111-4111-8111-111111111111/);
 assert.match(page,/Test Workspace/);
 assert.match(page,/employee/);
 assert.match(page,/class="status done">active<\/span>/);
 assert.equal(count(page,/class="settings-detail(?:\s|")/g),5); // four profile fields plus one session authentication field
 assert.equal(count(page,/class="panel settings-profile-panel/g),1);
 assert.equal(count(page,/class="panel settings-session-panel/g),1);
});

test('Settings redesign preserves all four original action handlers and restricted warnings',()=>{
 const page=render();
 for(const action of ['copy-token','logout','board-tt-signed-verify','verify-backend']){
  assert.equal(count(page,new RegExp('data-action="'+action+'"','g')),1,action);
 }
 for(const action of ['copy-token','logout','board-tt-signed-verify','verify-backend']){
  assert.ok(app.includes("case '"+action+"'"),action);
 }
 assert.match(page,/Anyone holding it may act as your account until it expires/);
 assert.match(page,/Never share it in chat or commit it/);
 assert.match(page,/permissions are enforced by the existing workspace RPCs and row-level security/i);
 assert.match(page,/read-only checks using your current authenticated browser session/);
 assert.match(page,/will not edit boards, clock attendance, revoke sessions, or display employee GPS coordinates/);
 assert.match(page,/No token copying or database write required/);
 assert.match(page,/href="#\/acceptance"/);
 assert.doesNotMatch(page,/Bearer\s+|eyJ[A-Za-z0-9_-]{15,}|service_role|private_key/);
 assert.match(app,/if\(!confirm\('Copy your short-lived access token\?/);
});

test('busy controls remain disabled and verification output remains data-driven',()=>{
 const base=render({boardTtSignedBusy:true,acceptanceBusy:true});
 assert.match(base,/data-action="board-tt-signed-verify" disabled/);
 assert.match(base,/Verifying signed access…/);
 assert.match(base,/data-action="verify-backend" disabled/);
 assert.match(base,/Verifying…/);
 const checks=render({
  boardTtSignedResult:{status:'PASS',checks:[
   {id:'SIGNED-READ',status:'PASS',detail:'Verified scope'},
   {id:'DENIED',status:'FAIL',detail:'Denied by RLS'}
  ]},
  acceptance:[
   {title:'Session identity',status:'pass',detail:'Authorized response'},
   {title:'Workspace isolation',status:'pending',detail:'Not yet verified'}
  ]
 });
 assert.match(checks,/Signed integration: PASS — 1 \/ 2 checks passed/);
 assert.match(checks,/SIGNED-READ/);
 assert.match(checks,/DENIED/);
 assert.match(checks,/1 of 2 read-only checks passed/);
 assert.match(checks,/Session identity/);
 assert.match(checks,/Workspace isolation/);
 assert.match(checks,/Read-only session checks do not certify Clock-In\/Out persistence/);
});

test('all user-provided names, emails, workspace and backend text remain safely escaped',()=>{
 const page=render({
  displayName:'<script>alert(1)</script>',
  workspaceName:'<img src=x onerror=alert(2)>',
  context:{user_id:'<svg onload=alert(3)>',profile:{
   platform_role:'<b>admin</b>',email:'<button onclick=alert(4)>',status:'<iframe>'}},
  boardTtSignedResult:{status:'<svg>',checks:[{
   id:'<svg onload=alert(5)>',status:'PASS',detail:'<img src=x onerror=alert(6)>'}
  ]}
 });
 assert.doesNotMatch(page,/<script>|<img src=x|<svg onload=|<button onclick=|<iframe>/);
 assert.match(page,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(page,/&lt;img src=x onerror=alert\(2\)&gt;/);
 assert.match(page,/&lt;svg onload=alert\(3\)&gt;/);
 assert.match(page,/&lt;b&gt;admin&lt;\/b&gt;/);
 assert.match(page,/&lt;button onclick=alert\(4\)&gt;/);
 assert.match(page,/&lt;iframe&gt;/);
 assert.match(page,/&lt;svg onload=alert\(5\)&gt;/);
 assert.match(page,/&lt;img src=x onerror=alert\(6\)&gt;/);
 assert.doesNotMatch(page,/<(?:button|div|section|span|input|a|svg|p|label|strong|h1|h3)[^>]*\s(?:onload|onclick|oninput|style)=/i);
});

test('DOM sections, controls and profile grid are balanced and semantically labeled',()=>{
 const page=render();
 for(const tag of ['div','section','span','strong','h3','button','a','p']){
  const opens=count(page,new RegExp('<'+tag+'(?:\\s|>)','g'));
  const closes=count(page,new RegExp('</'+tag+'>','g'));
  assert.equal(opens,closes,tag+' closing tags');
 }
 assert.equal(count(page,/<section class="panel settings-/g),2);
 assert.equal(count(page,/csp-u006 settings-verify-block/g),2);
 assert.equal(count(page,/settings-persistence-link/g),1);
 assert.match(page,/class="settings-profile-fields"/);
 assert.match(page,/class="csp-u015 settings-session-actions"/);
 assert.match(page,/class="note security-note settings-token-warning"/);
 assert.match(page,/class="note settings-session-callout"/);
});

test('visuals provide semantic static SVG without external graphics loops or dependencies',()=>{
 for(const kind of ['shield','user','lock','email','check','building','fingerprint','copy','logout','activity']){
  const icon=settingsIcon(kind);
  assert.match(icon,/^<svg class="settings-icon"/);
  assert.match(icon,/aria-hidden="true"/);
  assert.doesNotMatch(icon,/<script|\sonload=|\sstyle=/);
 }
 assert.equal(settingsIcon('unknown'),settingsIcon('shield'));
 const visuals=readFileSync('frontend/settings-visuals.js','utf8');
 assert.doesNotMatch(visuals,/WebGL|requestAnimationFrame|setInterval|fetch\(|XMLHttpRequest|new Worker/);
 assert.doesNotMatch(visuals,/\.style\s*\.|\.cssText\s*=|setAttribute\s*\(\s*['"]style/);
});

test('route-scoped responsive, reduced-motion, high-contrast and keyboard rules are present',()=>{
 for(const rule of [
  '#app .aps-settings-shell','#app .aps-settings',
  '.settings-profile-panel','.settings-session-panel','.settings-hero',
  '.settings-profile-fields','.settings-token-warning','.settings-session-actions',
  '.settings-session-actions button:focus-visible',
  '.settings-verify-block a:focus-visible',
  '.settings-verify-block button:focus-visible',
  '@media(max-width:1200px)','@media(max-width:800px)',
  '@media(max-width:600px)','@media(max-width:380px)',
  '@media(prefers-reduced-motion:reduce)','@media(prefers-contrast:more)'
 ])assert.ok(css.includes(rule),rule);
 assert.doesNotMatch(css,/@import|url\(\s*https?:|animation:.*infinite/);
 assert.match(css,/grid-template-columns:1fr/);
 assert.match(css,/overflow-wrap:anywhere/);
});

test('mounted settings components remain stationary on entry and refresh',()=>{
 let queries=0,animations=0;
 const node={isConnected:true,querySelectorAll(){queries++;return [{animate(){animations++;}}]},
  animate(){animations++;}};
 stopSettingsMotion();
 mountSettingsMotion(node,'settings');
 mountSettingsMotion(node,'settings');
 mountSettingsMotion(null,'overview');
 mountSettingsMotion(node,'settings');
 stopSettingsMotion();
 assert.equal(queries,0,'no entrance element traversal');
 assert.equal(animations,0,'no mount-time animations');
 const source=readFileSync('frontend/settings-visuals.js','utf8');
 assert.doesNotMatch(source,/\.animate\s*\(|translate3d\(|requestAnimationFrame\s*\(/);
});

// Nonbootstrap accounts retain self-service account settings without privileged session tools.
test('unverified role hides bootstrap-only session controls without suppressing password management',()=>{
 const page=render({roleVerified:false});
 assert.match(page,/Profile information/);
 assert.match(page,/settings-change-password-form/);
 assert.match(page,/settings-new-password/);
 assert.match(page,/settings-confirm-password/);
 assert.doesNotMatch(page,/settings-session-panel|data-action="copy-token"|data-action="verify-backend"/);
 assert.equal(count(page,/class="panel settings-profile-panel/g),1);
});
