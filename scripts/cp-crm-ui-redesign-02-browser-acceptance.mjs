/** Real Chromium computed-style and keyboard acceptance with isolated module fixtures. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const css=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
const browser=await chromium.launch({headless:true,
 executablePath:process.env.CHROMIUM_EXECUTABLE||'/Applications/Chromium.app/Contents/MacOS/Chromium'});
let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const view=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"><div class="aps-board-shell">
<section class="aps-tradelink-app tl-reference-portal"><div class="tl-content-panel"><h2>TradeLink</h2><div class="tl-draft-panel"><form class="tl-draft-form-grid"><label class="tl-draft-field">Document number<input aria-label="Document number" value="QA-1"></label><label class="tl-draft-field">Remarks<textarea aria-label="Remarks">Test</textarea></label></form><div class="tl-draft-actions"><button type="button" id="tl-save">Save Draft</button></div><div class="tl-records-scroll"><table class="tl-records-table"><tbody><tr><td><button type="button">Document</button></td></tr></tbody></table></div></div></div></section>
<section class="aps-board-shell aps-time-tracker-shell"><div class="tt-native"><div class="fm1-app"><div class="tt-navigation fm1-tabs"><button class="tt-nav-tab fm1-tab is-current">Attendance</button><button class="tt-nav-tab fm1-tab">My Hours</button></div><div class="fm1-panel">Attendance</div></div></div></section>
<section class="frt-native"><div class="frt-app-header">Fund Tracker</div><div class="frt-ref-table-card"><table><tbody><tr><td><button type="button">Voucher</button></td></tr></tbody></table></div></section>
<section class="ft3-app"><nav class="ft3-app-tabs"><button class="ft3-app-tab is-active">Overview</button><button class="ft3-app-tab">Requests</button></nav><div class="ft3-app-body"><button class="ft3-soft-action" id="fuel-refresh">Refresh</button><div class="ft3-panel">FuelTrack</div><div class="ft3-recent-scroll"><table class="ft3-recent-table"><tbody><tr><td><button type="button">Request</button></td></tr></tbody></table></div></div></section>
<section class="tb-app"><div class="tb-panel"><div class="tb-filter"><label for="tb-query">Search Issues</label><input id="tb-query" value=""></div><div class="tb-scroll"><table><tbody><tr><td><button class="tb-issue-link">Issue</button></td></tr></tbody></table></div></div></section>
<section class="board-group-panel"><div class="board-group-scroll" style="overflow-x:auto"><table class="board-table-custom" style="min-width:650px"><tbody><tr><td><button>Board item</button></td></tr></tbody></table></div></section>
</div></div></body></html>`;
try{
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.setContent(view);
  await page.addStyleTag({content:css});
  await page.waitForTimeout(280);
  const baseline=await page.evaluate(()=>({
   viewport:document.documentElement.scrollWidth-innerWidth,
   tlPanel:getComputedStyle(document.querySelector('.tl-draft-panel')).borderColor,
   tlFocusBefore:getComputedStyle(document.querySelector('.tl-draft-field input')).outlineStyle,
   timeTab:getComputedStyle(document.querySelector('.tt-nav-tab.is-current')).boxShadow,
   fuelTab:getComputedStyle(document.querySelector('.ft3-app-tab.is-active')).boxShadow,
   boardHeight:document.querySelector('.board-table-custom tr').getBoundingClientRect().height,
   boardScroll:document.querySelector('.board-group-scroll').scrollWidth>
    document.querySelector('.board-group-scroll').clientWidth,
  }));
  check(baseline.viewport<=1,`${width}: page overflow ${baseline.viewport}`);
  check(baseline.tlPanel!=='rgba(0, 0, 0, 0)',`${width}: TradeLink panel missing`);
  check(baseline.timeTab.includes('inset'),`${width}: TimeTracker current tab not distinct`);
  check(baseline.fuelTab.includes('inset'),`${width}: FuelTrack active tab not distinct`);
  check(baseline.boardHeight>0,`${width}: board row geometry broken`);
  if(width===390)check(baseline.boardScroll,`${width}: board horizontal scroll missing`);
  await page.locator('.tl-draft-field input').focus();
  check(await page.locator('.tl-draft-field input').evaluate(el=>
   getComputedStyle(el).outlineStyle)!=='none',`${width}: TradeLink keyboard focus missing`);
  await page.locator('#tb-query').focus();
  check(await page.locator('#tb-query').evaluate(el=>
   getComputedStyle(el).outlineStyle)!=='none',`${width}: TalkBox keyboard focus missing`);
  await page.locator('#fuel-refresh').focus();
  check(await page.locator('#fuel-refresh').evaluate(el=>
   getComputedStyle(el).outlineStyle)!=='none',`${width}: FuelTrack keyboard focus missing`);
  await page.emulateMedia({reducedMotion:'reduce'});
  check(await page.locator('.tt-nav-tab').first().evaluate(el=>
   parseFloat(getComputedStyle(el).transitionDuration)<=0.001),
   `${width}: native tab ignores reduced motion`);
  await page.evaluate(()=>document.documentElement.dataset.apsMondayTheme='dark');
  await page.waitForTimeout(260);
  check(await page.locator('.tl-draft-panel').evaluate(el=>
   getComputedStyle(el).borderColor)==='rgb(76, 80, 90)',
   `${width}: dark mode module border missing`);
  await page.close();
 }
 console.log(`CP_CRM_UI_REDESIGN_02_BROWSER_PASS ${checks} assertions at 390/768/1440px`);
}finally{await browser.close();}
