/** Role Configuration theme: computed Chromium surfaces, accessibility, and light-mode isolation. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const previous=execFileSync('git',['show','origin/main:frontend/apsyntra-styles.bundle.css'],{encoding:'utf8',maxBuffer:8*1024*1024});
const current=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
const output='docs/visual/cp-crm-dark-03';mkdirSync(output,{recursive:true});
const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"><div class="shell"><aside class="aps-sidebar"><div class="sidebar-brand-wrap"><a class="brand">APSYNTRA CRM</a></div><nav class="nav-list"><a class="nav-link active" href="#/role-configuration">Role Configuration</a></nav></aside><main class="main aps-role-config-shell"><header class="topbar"><div class="breadcrumb"><strong>Role Configuration</strong></div><div class="top-actions"><span class="top-pill">Secure session</span></div></header><div class="main-content"><div class="aps-role-configuration"><section class="role-config-hero"><div class="role-hero-copy"><span class="label-top">ADMINISTRATION / ROLE CONFIGURATION</span><h1>Role Configuration</h1><p>Manage role references and native application access.</p></div><button class="role-refresh-button">Refresh</button></section><div class="role-staged-note"><strong>Reference roles</strong><span>Changes are reviewed before activation.</span></div><section class="role-stat-grid">${['Reference roles','Workspace users','Accessible boards','Pending proposals'].map((n,i)=>`<div class="role-stat-card"><span class="stat-label">${n}</span><div class="stat-value">${[6,24,255,3][i]}</div></div>`).join('')}</section><div class="role-config-tabs"><button class="role-tab-button secondary">Role catalog</button><button class="role-tab-button primary">Native Application Access</button><button class="role-tab-button secondary">Change history</button></div><div class="role-section-header"><strong>Native Application Access</strong></div><div class="role-info-note">Assign access to the selected native applications.</div><div class="role-search-wrap"><input class="role-search" aria-label="Search roles" placeholder="Search roles" /></div><div class="role-table-panel"><div class="role-table-scroll" tabindex="0"><table class="role-data-table"><thead><tr><th>Role</th><th>State</th><th>Action</th></tr></thead><tbody><tr><td><strong>CRM Admin</strong></td><td><span class="status done">Assigned</span></td><td><button class="secondary">Edit</button></td></tr><tr><td><strong>Employee</strong></td><td><span class="status todo">Pending</span></td><td><button class="secondary">Edit</button></td></tr></tbody></table></div></div><section class="native-application-access"><div class="user-role-selection-panel"><header class="panel-header"><h3>Individual access</h3></header><div class="panel-body"><label>Choose user <select class="user-role-account-select" aria-label="Choose user"><option>Workspace member</option></select></label></div></div><div class="user-role-native-app-picker"><legend>Native applications</legend><div class="user-role-native-app-list"><div class="user-role-native-app-row"><label class="user-role-native-app-choice"><input type="checkbox" checked/><span><strong>TradeLink</strong><small>Native application</small></span></label><label class="user-role-native-app-role">Access level<select aria-label="TradeLink role"><option>Manager</option></select></label></div></div></div><div class="user-role-batch-panel"><header class="user-role-batch-heading"><h3>Bulk configuration</h3></header><div class="user-role-batch-users"><div class="user-role-batch-user-list"><label><input type="checkbox" checked/>Selected workspace user</label></div></div><div class="user-role-batch-fields"><label class="user-role-native-batch-action">Application role<select aria-label="Bulk application role"><option>Member</option></select></label></div><div class="user-role-batch-summary"><strong>Review changes</strong><button class="user-role-batch-review">Review assignments</button></div></div></section></div></div></main></div></div></body></html>`;
const selectors=['.aps-role-config-shell','.aps-role-config-shell>.topbar','.role-config-hero','.role-config-hero h1','.role-staged-note','.role-stat-card','.role-stat-card .stat-value','.role-config-tabs','.role-config-tabs .role-tab-button.primary','.role-info-note','.role-search','.role-table-panel','.role-data-table th','.role-data-table td','.role-data-table td strong','.user-role-selection-panel','.user-role-account-select','.user-role-native-app-picker','.user-role-native-app-row','.user-role-native-app-choice strong','.user-role-native-app-role select','.user-role-batch-panel','.user-role-batch-users','.user-role-batch-user-list label','.user-role-native-batch-action select'];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/Applications/Chromium.app/Contents/MacOS/Chromium'});
let passed=0;const check=(yes,message)=>{assert.ok(yes,message);passed++};
try{
 for(const width of [390,768,1440]){
  for(const theme of ['light','dark']){
   let old;
   for(const [version,css] of [['before',previous],['after',current]]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.setContent(html);await page.evaluate(t=>document.documentElement.dataset.apsMondayTheme=t,theme);
    await page.addStyleTag({content:css});await page.waitForTimeout(220);
    const data=await page.evaluate(sels=>{
     const rgb=str=>{const m=str.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').slice(0,3).map(Number):null};
     const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,b,i)=>a+b*[.2126,.7152,.0722][i],0);
     const bg=el=>{for(let n=el;n;n=n.parentElement){const c=getComputedStyle(n).backgroundColor;if(c.startsWith('rgb('))return c}return 'rgb(255, 255, 255)'};
     return sels.map(sel=>{const e=document.querySelector(sel);if(!e)return {sel,missing:true};const s=getComputedStyle(e),b=bg(e),a=lum(rgb(s.color)),c=lum(rgb(b));return {sel,bg:b,color:s.color,contrast:+((Math.max(a,c)+.05)/(Math.min(a,c)+.05)).toFixed(2),height:e.getBoundingClientRect().height}});
    },selectors);
    if(version==='after'){
     if(theme==='light')for(let i=0;i<data.length;i++){
      check(data[i].bg===old[i].bg,`${width} changed light background ${data[i].sel}`);
      check(data[i].color===old[i].color,`${width} changed light text ${data[i].sel}`);
     }
     else{
      for(const sel of ['.role-config-hero','.role-stat-card','.role-config-tabs','.role-table-panel','.user-role-selection-panel','.user-role-native-app-picker','.user-role-native-app-row','.user-role-batch-panel']){
       const v=data.find(x=>x.sel===sel);check(v.bg.startsWith('rgb(')&&v.bg!=='rgb(255, 255, 255)'&&v.bg!=='rgb(250, 250, 250)',`${width} white surface ${sel}: ${v.bg}`);check(v.contrast>=4.5,`${width} unreadable ${sel}: ${v.contrast}`);
      }
      for(const sel of ['.role-config-hero h1','.role-stat-card .stat-value','.role-data-table td strong','.user-role-native-app-choice strong','.user-role-batch-user-list label']){
       const v=data.find(x=>x.sel===sel);check(v.contrast>=4.5,`${width} text contrast ${sel}: ${v.contrast}`);
      }
      await page.locator('.user-role-account-select').focus();check(await page.locator('.user-role-account-select').evaluate(el=>getComputedStyle(el).outlineStyle)!=='none',`${width} select focus`);
      await page.locator('.role-tab-button.primary').focus();check(await page.locator('.role-tab-button.primary').evaluate(el=>getComputedStyle(el).outlineStyle)!=='none',`${width} tab focus`);
      await page.emulateMedia({reducedMotion:'reduce'});check(await page.locator('.role-stat-card').first().evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<.001),`${width} reduced motion`);
     }
    }else old=data;
    if(theme==='dark'&&(width===390||width===1440))await page.screenshot({path:`${output}/role-${version}-${width}.png`,fullPage:true});
    if(theme==='dark'&&version==='after'&&width===1440)console.log('ROLE_DARK_CONTRAST',JSON.stringify(data));
    await page.close();
   }
  }
 }
 console.log(`CP_CRM_DARK_ROLE_BROWSER_PASS ${passed} checks`);
}finally{await browser.close()}
