/** Real Chromium element-level dark/light acceptance; representative DOM only. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const previous=execFileSync('git',['show','origin/main:frontend/apsyntra-styles.bundle.css'],{encoding:'utf8',maxBuffer:8*1024*1024});
const current=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
const markup=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"><div class="shell"><aside class="aps-sidebar"><div class="sidebar-brand-wrap"><a href="#/overview" class="brand"><span class="brand-text">APSYNTRA CRM</span></a><button class="sidebar-layout-toggle" aria-label="Collapse navigation">◀</button></div><div class="aps-board-search-v3"><label class="aps-board-search-field"><input placeholder="Search boards" aria-label="Search boards"/></label></div><div class="workspace-switcher"><button class="ws01-switcher-button"><span class="workspace-name">Work Management</span></button><button class="aps-workspace-add-board" aria-label="Create board">+</button></div><nav class="nav-list"><a class="nav-link active" aria-current="page" href="#/overview"><span class="nav-ico">▦</span>Overview</a><a class="nav-link" href="#/boards">My Boards</a></nav></aside><main class="main aps-overview-shell"><header class="topbar"><div class="breadcrumb">Workspace / Overview</div><div class="top-actions"><button class="aps-global-search-trigger"><span class="aps-global-search-trigger-icon">⌕</span><span class="aps-global-search-trigger-label">Search</span><kbd>⌘ K</kbd></button><button class="aps-monday-top-icon" aria-label="Notifications">☆</button><span class="top-pill">Secure session</span><button class="aps-sync" data-sync-state="synchronized"><span class="aps-sync-orbit"></span><span class="aps-sync-caption">Live synced</span></button><button class="secondary topbar-signout">Sign out</button></div></header><div class="main-content"><div class="aps-overview"><section class="overview-board-grid"><article class="board-card"><div class="board-card-top"><details class="board-card-actions"><summary aria-label="Board options">⋮</summary><div class="board-card-actions-list"><button>Rename</button></div></details></div><a class="board-card-main" href="#/boards/1"><h3>TradeLink</h3><p>Recent work</p><div class="board-card-footer"><span>299 items</span></div></a></article></section><section class="aps-boards"><div class="boards-catalog-grid"><article class="board-card"><details class="board-card-actions"><summary aria-label="More actions">⋮</summary></details><a href="#/boards/2">Work board</a><div class="board-card-footer"><span>850 items</span></div></article></div></section><label class="field">Title<input placeholder="Enter title" aria-label="Title"/></label><button class="primary">Save</button><button class="secondary" disabled>Disabled</button></div></div></main></div></div></body></html>`;
const selectors=['.aps-board-search-field','.aps-board-search-field input','.sidebar-layout-toggle','.aps-workspace-add-board','.topbar','.aps-global-search-trigger','.aps-global-search-trigger kbd','.top-pill','.aps-sync','.topbar-signout','.aps-monday-top-icon','.overview-board-grid .board-card-actions>summary','.boards-catalog-grid .board-card-actions>summary','.overview-board-grid .board-card-footer span:first-child','.field input'];
const colorsEquivalent=(a,b)=>{if(a===b)return true;const parse=v=>{const m=v.match(/^rgba?\((\d+), (\d+), (\d+)(?:, 1)?\)$/);return m?[+m[1],+m[2],+m[3]]:null};const x=parse(a),y=parse(b);return !!(x&&y&&x.every((v,i)=>Math.abs(v-y[i])<=1));};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/Applications/Chromium.app/Contents/MacOS/Chromium'});
let assertions=0;const ok=(value,msg)=>{assert.ok(value,msg);assertions++};
try{
 for(const width of [390,768,1440]){
  for(const theme of ['light','dark']){
   let base;
   for(const [version,css] of [['before',previous],['after',current]]){
    const page=await browser.newPage({viewport:{width,height:920}});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.setContent(markup);await page.evaluate(t=>document.documentElement.dataset.apsMondayTheme=t,theme);
    await page.addStyleTag({content:css});await page.waitForTimeout(300);
    const states=await page.evaluate(items=>items.map(selector=>{const el=document.querySelector(selector);const s=getComputedStyle(el);return {selector,color:s.color,background:s.backgroundColor,border:s.borderColor,outline:s.outlineStyle}}),selectors);
    const get=selector=>states.find(x=>x.selector===selector);
    if(version==='after'){
     if(theme==='light'){
      for(let i=0;i<states.length;i++)for(const field of ['color','background','border'])
       ok(colorsEquivalent(states[i][field],base[i][field]),`${width}: light-mode ${states[i].selector} ${field} changed ${base[i][field]} => ${states[i][field]}`);
     }else{
      ok(get('.aps-board-search-field').background==='rgb(36, 36, 36)',`${width}: sidebar search still light`);
      ok(get('.aps-global-search-trigger').background==='rgb(41, 41, 41)',`${width}: topbar search still light`);
      ok(get('.aps-global-search-trigger kbd').background==='rgb(52, 52, 52)',`${width}: shortcut key still light`);
      ok(get('.top-pill').background==='rgb(41, 41, 41)',`${width}: security pill still light`);
      ok(get('.aps-sync').background==='rgb(37, 56, 47)',`${width}: sync pill lacks readable semantic background`);
      ok(get('.topbar-signout').background==='rgb(41, 41, 41)',`${width}: signout still light`);
      ok(get('.sidebar-layout-toggle').background==='rgb(41, 41, 41)',`${width}: sidebar collapse still light`);
      ok(get('.aps-workspace-add-board').background==='rgb(41, 41, 41)',`${width}: add board still light`);
      ok(['rgb(53, 53, 53)','rgb(56, 56, 56)'].includes(get('.overview-board-grid .board-card-footer span:first-child').background),`${width}: board count chip not adapted ${get('.overview-board-grid .board-card-footer span:first-child').background}`);
      for(const selector of ['.aps-board-search-field input','.aps-global-search-trigger','.sidebar-layout-toggle','.overview-board-grid .board-card-actions>summary','.field input']){
       const el=page.locator(selector);await el.focus();
       ok(await el.evaluate((node,selector)=>selector==='.aps-board-search-field input'?getComputedStyle(node.closest('.aps-board-search-field')).borderColor==='rgb(169, 198, 255)':getComputedStyle(node).outlineStyle!=='none',selector),`${width}: no visible focus for ${selector}`);
      }
      await page.locator('.aps-sync').evaluate(el=>el.setAttribute('data-sync-state','offline'));await page.waitForTimeout(240);
      ok(await page.locator('.aps-sync').evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(70, 48, 47)',`${width}: offline state missing`);
      await page.locator('.aps-board-search-field').hover();await page.waitForTimeout(200);
      ok(await page.locator('.aps-board-search-field').evaluate(el=>getComputedStyle(el).borderColor)==='rgb(119, 119, 119)',`${width}: search hover missing`);
      await page.emulateMedia({reducedMotion:'reduce'});
      ok(await page.locator('.sidebar-layout-toggle').evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<=.001),`${width}: reduced motion missing`);
     }
    }else base=states;
    await page.close();
   }
  }
 }
 console.log(`CP_CRM_DARK_03_ELEMENTS_PASS ${assertions} assertions at 390/768/1440; dark and light`);
}finally{await browser.close()}
