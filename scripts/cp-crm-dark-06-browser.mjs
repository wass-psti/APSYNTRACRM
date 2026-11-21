/** Compare real Chromium dark/light computed styles for global search and Settings. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const beforeCss=execFileSync('git',['show','origin/main:frontend/apsyntra-styles.bundle.css'],{encoding:'utf8',maxBuffer:8*1024*1024});
const afterCss=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
const output='docs/visual/cp-crm-dark-06';mkdirSync(output,{recursive:true});
const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<div class="aps-global-search-backdrop"><section class="aps-global-search-dialog" role="dialog"><header class="aps-global-search-heading"><div><h2>Search APSYNTRA</h2><p>Search boards, contacts and native documents</p></div><button class="aps-global-search-close">×</button></header><label class="aps-global-search-input-wrap"><span class="aps-global-search-glyph">⌕</span><input class="aps-global-search-input" placeholder="Search everything"/></label><p class="aps-global-search-status">Showing suggestions</p><div class="aps-global-search-results"><div class="aps-global-search-option is-active" role="option" tabindex="0"><span class="aps-global-search-option-icon">T</span><div class="aps-global-search-option-copy"><div class="aps-global-search-option-title">TradeLink Document</div><div class="aps-global-search-option-subtitle">Native documents</div></div><span class="aps-global-search-option-kind">Application</span><div class="aps-global-search-option-excerpt">Quotation record</div></div></div><footer class="aps-global-search-footer"><span>Navigate <kbd>↑↓</kbd></span></footer></section></div>
<div class="native-search-detail-backdrop" style="position:relative;inset:auto;padding:15px"><section class="native-search-detail-drawer"><header class="native-search-detail-header"><div><h2>Record details</h2><p>Read-only preview</p></div></header><div class="native-search-detail-scroll"><dl class="native-search-detail-fields"><div class="native-search-detail-field"><dt>Document</dt><dd>Quotation</dd></div></dl></div><footer class="native-search-detail-footer"><button>Close preview</button></footer></section></div>
<div id="app"><main class="main aps-settings-shell"><div class="topbar"><span class="breadcrumb">Workspace <strong>Settings</strong></span><span class="top-pill">Secure session</span></div><div class="main-content"><section class="aps-settings"><section class="settings-profile-panel"><header class="settings-panel-header"><div class="settings-panel-title"><span>◉</span><h3>Profile information</h3></div><span class="settings-auth-provider">Supabase Auth</span></header><div class="settings-panel-body"><div class="settings-profile-identity"><div class="settings-profile-copy"><strong class="name">Example Employee</strong><span class="role">Workspace member</span></div></div><div class="settings-profile-fields"><div class="settings-detail"><label>Employee</label><strong>Example</strong></div></div></div></section><section class="settings-session-panel"><header class="settings-panel-header"><h3>Session security</h3></header><div class="settings-panel-body"><div class="settings-session-intro"><p>Your signed-in session</p></div><div class="settings-session-callout">Existing identity is verified.</div><div class="settings-token-warning"><b>Session note</b></div><div class="settings-session-actions"><button>Refresh session</button></div><div class="settings-verify-block"><h3>Identity verification</h3><p class="muted">Status can be checked</p><div class="csp-u048"><div class="csp-u028">Verified state</div><div class="csp-u008">Read-only result</div><div class="csp-u058">Workspace detail</div></div><span class="settings-readonly-chip">Read-only</span></div></div></section></section></div></main></div></body></html>`;
const selectors=['.aps-global-search-dialog','.aps-global-search-heading h2','.aps-global-search-heading p','.aps-global-search-close','.aps-global-search-input-wrap','.aps-global-search-input','.aps-global-search-status','.aps-global-search-option.is-active','.aps-global-search-option-title','.aps-global-search-option-subtitle','.aps-global-search-option-icon','.aps-global-search-option-kind','.aps-global-search-footer','.native-search-detail-drawer','.native-search-detail-header h2','.native-search-detail-header p','.native-search-detail-field','.native-search-detail-field dt','.native-search-detail-field dd','.aps-settings-shell','.settings-profile-panel','.settings-panel-header h3','.settings-profile-copy .name','.settings-profile-copy .role','.settings-detail','.settings-detail strong','.settings-session-callout','.settings-token-warning','.settings-token-warning b','.settings-session-actions button','.settings-verify-block h3','.settings-verify-block .csp-u048','.settings-verify-block .csp-u028','.settings-verify-block .csp-u008','.settings-readonly-chip'];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/Applications/Chromium.app/Contents/MacOS/Chromium'});
let total=0;const check=(value,label)=>{assert.ok(value,label);total++};
const inspect=selectors=>{
 const rgb=s=>{const m=s.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').slice(0,3).map(Number):null};
 const lum=arr=>arr.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);
 const bg=el=>{for(let node=el;node;node=node.parentElement){const color=getComputedStyle(node).backgroundColor;if(color.startsWith('rgb('))return color}return 'rgb(255, 255, 255)'};
 return selectors.map(selector=>{const el=document.querySelector(selector),s=getComputedStyle(el),background=bg(el),a=lum(rgb(s.color)),b=lum(rgb(background));return {selector,color:s.color,background:s.backgroundColor,ratio:+((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2)};});
};
try{
 for(const width of [390,768,1440])for(const theme of ['light','dark']){
  let original;
  for(const [label,css] of [['before',beforeCss],['after',afterCss]]){
   const page=await browser.newPage({viewport:{width,height:1000}});
   await page.setContent(html);await page.evaluate(t=>document.documentElement.dataset.apsMondayTheme=t,theme);
   await page.addStyleTag({content:css});await page.waitForTimeout(270);
   const values=await page.evaluate(inspect,selectors);
   if(label==='after'){
    if(theme==='light')for(let i=0;i<values.length;i++)for(const prop of ['color','background'])check(values[i][prop]===original[i][prop],`${width} light ${values[i].selector} ${prop}`);
    if(theme==='dark'){
     for(const sel of ['.aps-global-search-dialog','.aps-global-search-input-wrap','.aps-global-search-close','.aps-global-search-option.is-active','.native-search-detail-drawer','.native-search-detail-field','.settings-session-callout','.settings-session-actions button','.settings-verify-block .csp-u048','.settings-verify-block .csp-u008']){
      const v=values.find(x=>x.selector===sel);check(v.background.startsWith('rgb(')&&!['rgb(255, 255, 255)','rgb(251, 252, 255)','rgb(250, 251, 255)'].includes(v.background),`${width} ${sel} is light ${v.background}`);
     }
     for(const sel of ['.aps-global-search-heading h2','.aps-global-search-heading p','.aps-global-search-option-title','.aps-global-search-option-subtitle','.native-search-detail-header h2','.native-search-detail-field dd','.settings-panel-header h3','.settings-profile-copy .name','.settings-detail strong','.settings-verify-block h3','.settings-verify-block .csp-u028']){
      const v=values.find(x=>x.selector===sel);check(v.ratio>=4.5,`${width} ${sel} contrast ${v.ratio}`);
     }
     await page.locator('.aps-global-search-input').focus();check(await page.locator('.aps-global-search-input-wrap').evaluate(el=>getComputedStyle(el).outlineStyle)!=='none',`${width} search focus`);
     await page.emulateMedia({reducedMotion:'reduce'});check(await page.locator('.aps-global-search-dialog').evaluate(el=>getComputedStyle(el).animationName)==='none',`${width} reduced motion`);
    }
   }else original=values;
   if(theme==='dark'&&width===1440)await page.screenshot({path:`${output}/${label}-1440.png`,fullPage:true});
   await page.close();
  }
 }
 console.log(`CP_CRM_DARK_06_BROWSER_PASS ${total} checks`);
}finally{await browser.close()}
