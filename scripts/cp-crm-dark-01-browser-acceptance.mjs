/** CP-CRM-DARK-01: isolated computed-style and contrast verification. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const css=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
const previous=execFileSync('git',['show','origin/main:frontend/apsyntra-styles.bundle.css'],
 {encoding:'utf8',maxBuffer:8*1024*1024});
const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"><div class="shell"><aside class="aps-sidebar"><div class="sidebar-brand-wrap"><a class="brand" href="#/overview"><span class="brand-text">APSYNTRA CRM</span></a><span class="sidebar-brand-subtitle">WORKSPACE OPERATIONS</span></div><div class="workspace-switcher"><button class="ws01-switcher-button"><span class="workspace-name">Work Management</span></button></div><div class="sidebar-nav-scroll"><div class="side-section">Workspace</div><nav class="nav-list"><a class="nav-link active" aria-current="page" href="#/overview"><span class="nav-ico">◈</span>Overview</a><a class="nav-link" href="#/boards"><span class="nav-ico">▦</span>Boards</a></nav></div><div class="side-bottom"><div class="sidebar-profile-text"><span class="name">Workspace member</span></div></div></aside><main class="main aps-overview-shell"><header class="topbar">Workspace</header><div class="main-content"><div class="aps-overview"><div class="overview-hero"><h1>Overview</h1></div><div class="overview-stat-grid"><div class="stat-card"><div class="stat-label">Active boards</div><div class="stat-value">255</div></div></div></div></div></main></div></div><div class="ws01-overlay"><div class="ws01-menu-card"><div class="ws01-menu-heading">Workspace picker</div><input id="menu-search" aria-label="Search workspaces" placeholder="Search workspaces"><div class="ws01-menu-actions"><button type="button" id="menu-action">Create workspace</button></div></div></div><div class="ws01-overlay"><div class="ws01-browser-card"><header class="ws01-browser-top"><h2>All workspaces</h2><input aria-label="Find workspace"></header><div class="ws01-browser-body"><div class="ws01-browser-tabs"><button aria-pressed="true">Your workspaces</button><button class="ws01-add-button">Add</button></div><div class="ws01-browser-results"><h3>Connected workspace</h3><div class="ws01-entry"><button class="ws01-entry-button"><span class="ws01-entry-copy"><strong>Work Management</strong><small>Current workspace</small></span></button></div></div></div></div></div><div class="ws01-overlay"><div class="ws01-details-card"><div class="ws01-details-heading"><h2>Workspace settings</h2></div><p class="ws01-details-description">Manage your existing workspace</p><div class="ws01-details-note">Selected workspace remains unchanged.</div><div class="ws01-details-actions"><button>Cancel</button><button class="ws01-details-primary">Save</button></div><input aria-label="Workspace display name" value="Work Management"></div></div><div class="ws01-overlay ws01-create"><div class="ws01-create-card"><div class="ws01-create-heading"><h2>Create workspace</h2></div><p class="ws01-create-subtitle">Create a separate work area</p><form><input id="ws01-name" aria-label="Workspace name" type="text" placeholder="Workspace name"/><div class="ws01-create-safety">Only create workspaces when authorized.</div><footer class="ws01-create-footer"><button type="button">Cancel</button><button class="ws01-primary" type="button">Create</button></footer></form></div></div></body></html>`;
const allSamples={};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/Applications/Chromium.app/Contents/MacOS/Chromium'});
let passed=0;
const check=(value,msg)=>{assert.ok(value,msg);passed++};
const inspect=()=>{
 const ids=['.aps-sidebar','.sidebar-brand-subtitle','.workspace-switcher',
  '.nav-link.active','.nav-link:not(.active)','.ws01-menu-card','.ws01-menu-heading',
  '.ws01-browser-card','.ws01-browser-tabs','.ws01-entry-copy strong',
  '.ws01-details-card','.ws01-details-note','.ws01-create-card','.ws01-create-safety',
  '#menu-search','#ws01-name','.ws01-primary'];
 const rgb=value=>{const m=value.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').slice(0,3).map(x=>Number(x.trim())):null};
 const luminance=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,b,i)=>a+b*[.2126,.7152,.0722][i],0);
 const ratio=(c1,c2)=>{const a=luminance(c1),b=luminance(c2);return +( (Math.max(a,b)+.05)/(Math.min(a,b)+.05) ).toFixed(2)};
 const bg=el=>{let current=el;while(current){const c=getComputedStyle(current).backgroundColor;if(c.startsWith('rgb(')||/^rgba\([^)]*,\s*1\)$/.test(c))return c;current=current.parentElement}return 'rgb(255, 255, 255)'};
 return ids.map(selector=>{const el=document.querySelector(selector);const s=getComputedStyle(el),background=bg(el),foreground=s.color;return {selector,background,foreground,contrast:ratio(rgb(foreground),rgb(background))}});
};
try{
 for(const width of [390,768,1440]){
  for(const theme of ['light','dark']){
   for(const [version,source] of [['previous',previous],['new',css]]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.setContent(html);
    await page.evaluate(t=>document.documentElement.dataset.apsMondayTheme=t,theme);
    await page.addStyleTag({content:source});
    await page.waitForTimeout(260);
    const sample=await page.evaluate(inspect);
    const find=selector=>sample.find(v=>v.selector===selector);
    if(version==='new'){
     check(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,
      `${theme} ${width}: document horizontal overflow`);
     if(theme==='dark'){
      for(const selector of ['.ws01-menu-card','.ws01-browser-card','.ws01-details-card','.ws01-create-card']){
       check(find(selector).background==='rgb(36, 40, 50)',`${width} ${selector} not a dark panel: ${find(selector).background}`);
       check(find(selector).contrast>=4.5,`${width} ${selector} text ratio ${find(selector).contrast}`);
      }
      for(const selector of ['.sidebar-brand-subtitle','.nav-link:not(.active)',
       '.ws01-menu-heading','.ws01-entry-copy strong','.ws01-create-safety',
       '#menu-search','#ws01-name'])
       check(find(selector).contrast>=4.5,`${width} ${selector} ratio ${find(selector).contrast}`);
      await page.locator('#menu-search').focus();
      check(await page.locator('#menu-search').evaluate(el=>getComputedStyle(el).outlineStyle)!=='none',`${width}: workspace input keyboard focus missing`);
      await page.locator('#menu-action').focus();
      check(await page.locator('#menu-action').evaluate(el=>getComputedStyle(el).outlineStyle)!=='none',`${width}: workspace action keyboard focus missing`);
      await page.emulateMedia({reducedMotion:'reduce'});
      check(await page.locator('#menu-action').evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<=0.001),`${width}: reduced motion missing`);
     } else {
      // The new file is entirely dark-scoped: light computed styles must remain identical.
      const oldStyles=allSamples[width];
      if(version==='new') for(let index=0;index<sample.length;index++){
       check(sample[index].background===oldStyles[index].background,`${width}: light background modified ${sample[index].selector}`);
       check(sample[index].foreground===oldStyles[index].foreground,`${width}: light text modified ${sample[index].selector}`);
      }
     }
    }
    if(theme==='light'&&version==='previous')allSamples[width]=sample;
    if(width===1440&&theme==='dark'&&version==='new') console.log('DARK_COMPUTED_CONTRAST',JSON.stringify(sample));
    await page.close();
   }
  }
 }
 console.log(`CP_CRM_DARK_01_BROWSER_PASS ${passed} assertions (390/768/1440px, light and dark)`);
}finally{await browser.close();}
