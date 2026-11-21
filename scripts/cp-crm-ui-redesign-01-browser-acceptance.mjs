/** Isolated Chromium visual contract. No production account or browser profile. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

const css=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
const browser=await chromium.launch({headless:true,
 executablePath:process.env.CHROMIUM_EXECUTABLE||'/Applications/Chromium.app/Contents/MacOS/Chromium'});
const fixture=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Redesign QA</title></head><body><div id="app"><div class="shell"><aside class="sidebar aps-sidebar"><div class="side-section">Navigation</div><nav><a class="nav-link active" aria-current="page" href="#overview">Overview</a><a class="nav-link" href="#boards">Boards</a></nav><button class="workspace-switcher">Workspace</button></aside><main class="main aps-overview-shell"><header class="topbar"><strong>CRM</strong></header><div class="main-content"><section class="aps-overview"><div class="page-head"><h1>Overview</h1><p>Workspace status</p></div><div class="stat-card">12 boards</div><a href="#boards" class="board-card">Board</a></section><section class="aps-board-shell"><button class="primary">Create</button><button class="secondary">Refresh</button><button class="secondary" disabled>Disabled</button><div class="field"><label for="search">Search</label><input id="search" placeholder="Search boards"></div><details class="aps-action-surface"><summary>Menu</summary><div class="aps-action-popover"><button role="menuitem">Export</button></div></details><div class="board-group-panel"><table class="board-table-custom"><tbody><tr><td><button>Item</button></td></tr></tbody></table></div></section><div class="fm1-app"><div class="fm1-panel">Support</div></div><div class="tb-panel">TalkBox</div></div></main></div></div></body></html>`;
let checks=0;
const verify=(ok,message)=>{assert.ok(ok,message);checks++;};
try{
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:850}});
  await page.setContent(fixture);
  await page.addStyleTag({content:css});
  await page.waitForTimeout(260); // allow CSS transitions to settle before visual assertions
  const initial=await page.evaluate(()=>({
   overflow:document.documentElement.scrollWidth-innerWidth,
   primary:getComputedStyle(document.querySelector('.primary')).backgroundColor,
   radius:getComputedStyle(document.querySelector('.primary')).borderRadius,
   active:getComputedStyle(document.querySelector('.nav-link.active')).boxShadow,
   row:document.querySelector('.board-table-custom tr').getBoundingClientRect().height,
   disabled:getComputedStyle(document.querySelector('.secondary:disabled')).cursor,
  }));
  verify(initial.overflow<=1,`${width}: horizontal document overflow ${initial.overflow}`);
  verify(initial.primary==='rgb(102, 103, 171)',`${width}: shared accent missing: ${initial.primary}`);
  verify(initial.radius!=='0px',`${width}: control radius missing`);
  verify(initial.active.includes('inset'),`${width}: visible active navigation missing`);
  verify(initial.row>0,`${width}: board table row collapsed`);
  verify(initial.disabled==='not-allowed',`${width}: disabled native state missing`);
  await page.locator('#search').focus();
  verify(await page.locator('#search').evaluate(el=>getComputedStyle(el).outlineStyle)!=='none',
   `${width}: input focus not visible`);
  const menu=page.locator('details.aps-action-surface');
  await menu.locator('summary').focus();
  await page.keyboard.press('Enter');
  verify(await menu.evaluate(el=>el.open),`${width}: keyboard menu activation broken`);
  await page.emulateMedia({reducedMotion:'reduce'});
  verify(await page.locator('.primary').evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration))<=0.001,
   `${width}: reduced motion not respected`);
  await page.evaluate(()=>document.documentElement.dataset.apsMondayTheme='dark');
  await page.waitForTimeout(260);
  verify(await page.locator('.secondary:not(:disabled)').evaluate(el=>
   getComputedStyle(el).backgroundColor)==='rgb(40, 42, 49)',
   `${width}: dark surface tokens missing`);
  await page.close();
 }
 console.log(`CP_CRM_UI_REDESIGN_01_BROWSER_PASS ${checks} assertions at 390/768/1440px`);
}finally{await browser.close();}
