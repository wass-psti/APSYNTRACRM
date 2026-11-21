/** Native dark-mode comparison: GPS, My Hours and TradeLink draft/finance. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const baseline=execFileSync('git',['show','origin/main:frontend/apsyntra-styles.bundle.css'],{encoding:'utf8',maxBuffer:9*1024*1024});
const candidate=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
const folder='docs/visual/cp-crm-dark-07';mkdirSync(folder,{recursive:true});
const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"><div class="aps-board-shell"><div class="tt-native"><div class="tt-gps"><section class="tt-gps-controls"><label>Employee<input placeholder="Search employee"/></label><label>Date<select><option>Today</option></select></label><button>Load coordinates</button></section><div class="tt-gps-map-shell"><div class="tt-gps-map-stats"><div class="tt-gps-kpi"><span>Clocked in</span><strong>17</strong></div><button class="tt-gps-refresh">↻</button></div><div class="tt-gps-map-modes"><button class="is-active">Street</button><button>Satellite</button><button disabled>Unavailable</button></div><div class="tt-gps-map-zoom"><button>+</button><button>−</button></div><div class="tt-gps-map-footer"><span>Last location update</span></div></div><section class="tt-gps-panel"><header class="tt-gps-panel-head"><h4>Attendance locations</h4><p>Signed records</p></header><ul class="tt-gps-records"><li><div class="tt-gps-record-person"><strong>Employee</strong><small>Location recorded</small></div><a class="tt-gps-record-link" href="#/timetracker">View record</a></li></ul></section><div class="tt-gps-kpis"><div class="tt-gps-kpi"><span>Records</span><strong>17</strong></div></div><p class="tt-gps-note">Records are subject to existing workspace access.</p></div><div class="tt-my-hours-command"><div class="tt-hours-week-nav"><span>This week</span><div><button>Previous</button><strong>Nov 16–22</strong><button>Next</button></div></div><div class="tt-hours-month-nav"><button>November</button></div><div class="tt-hours-kpis"><div><span>Working hours</span><strong>40h</strong></div></div></div></div></div><section class="aps-tradelink-app tl-reference-portal"><div class="tl-draft-panel"><div class="tl-draft-finance"><div class="tl-draft-finance-inputs"><div class="tl-draft-field"><label>Amount<input value="100.00"/></label></div></div><div class="tl-draft-finance-results"><div><dt>Total</dt><dd>100.00</dd></div></div></div><div class="tl-draft-summary"><h4>Document preview</h4><dl class="tl-draft-summary-rows"><div><dt>Type</dt><dd>Quotation</dd></div></dl></div></div><section class="tl-finance-preview"><div class="tl-finance-fields"><input value="100.00"/></div><div class="tl-finance-results"><div>Preview total</div></div></section><div class="tl-analytics-kpis"><article>Financial metric</article></div></section></div></body></html>`;
const selectors=['.tt-gps-controls','.tt-gps-controls input','.tt-gps-controls label','.tt-gps-controls button','.tt-gps-map-stats','.tt-gps-map-modes','.tt-gps-map-modes button.is-active','.tt-gps-map-modes button:disabled','.tt-gps-map-zoom','.tt-gps-map-zoom button','.tt-gps-map-footer span','.tt-gps-panel','.tt-gps-panel-head h4','.tt-gps-record-person strong','.tt-gps-record-person small','.tt-gps-kpis .tt-gps-kpi','.tt-gps-kpis .tt-gps-kpi strong','.tt-hours-week-nav','.tt-hours-week-nav strong','.tt-hours-week-nav button','.tt-hours-month-nav button','.tt-hours-kpis>div','.tt-hours-kpis strong','.tl-draft-finance','.tl-draft-field input','.tl-draft-finance-results>div','.tl-draft-finance-results dt','.tl-draft-finance-results dd','.tl-draft-summary','.tl-draft-summary h4','.tl-draft-summary-rows>div','.tl-draft-summary-rows dd','.tl-finance-preview','.tl-finance-fields input','.tl-finance-results>div','.tl-analytics-kpis article'];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/Applications/Chromium.app/Contents/MacOS/Chromium'});
let checked=0;const check=(value,message)=>{assert.ok(value,message);checked++};
const inspect=selectors=>{
 const rgb=text=>{const match=text.match(/rgba?\(([^)]+)\)/);return match?match[1].split(',').slice(0,3).map(Number):null};
 const lum=parts=>parts.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
 const bg=el=>{for(let p=el;p;p=p.parentElement){const value=getComputedStyle(p).backgroundColor;if(value.startsWith('rgb('))return value}return 'rgb(255, 255, 255)'};
 return selectors.map(selector=>{const el=document.querySelector(selector),style=getComputedStyle(el),background=bg(el),a=lum(rgb(style.color)),b=lum(rgb(background));return {selector,color:style.color,background:style.backgroundColor,ratio:+((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2)};});
};
try{
 for(const width of [390,768,1440])for(const theme of ['light','dark']){
  let before;
  for(const [version,css] of [['before',baseline],['after',candidate]]){
   const page=await browser.newPage({viewport:{width,height:960}});
   await page.setContent(html);await page.evaluate(x=>document.documentElement.dataset.apsMondayTheme=x,theme);
   await page.addStyleTag({content:css});await page.waitForTimeout(250);
   const values=await page.evaluate(inspect,selectors);
   if(version==='after'){
    if(theme==='light')for(let i=0;i<values.length;i++)for(const key of ['color','background'])check(values[i][key]===before[i][key],`${width} light ${values[i].selector} ${key} differs`);
    else{
     for(const selector of ['.tt-gps-controls','.tt-gps-controls input','.tt-gps-map-stats','.tt-gps-map-modes','.tt-gps-map-zoom','.tt-gps-panel','.tt-gps-kpis .tt-gps-kpi','.tt-hours-week-nav','.tt-hours-week-nav button','.tt-hours-kpis>div','.tl-draft-finance','.tl-draft-finance-results>div','.tl-draft-summary','.tl-draft-summary-rows>div','.tl-finance-preview','.tl-finance-results>div','.tl-analytics-kpis article']){
      const v=values.find(x=>x.selector===selector);check(v.background==='rgb(41, 41, 41)'||['rgb(32, 32, 32)','rgb(52, 52, 52)','rgb(53, 53, 53)','rgb(25, 60, 120)'].includes(v.background),`${width} ${selector} not dark: ${v.background}`);
     }
     for(const selector of ['.tt-gps-controls label','.tt-gps-panel-head h4','.tt-gps-record-person strong','.tt-hours-week-nav strong','.tt-hours-kpis strong','.tl-draft-finance-results dd','.tl-draft-summary-rows dd']){
      const v=values.find(x=>x.selector===selector);check(v.ratio>=4.5,`${width} ${selector} contrast ${v.ratio}`);
     }
     await page.locator('.tt-gps-controls input').focus();check(await page.locator('.tt-gps-controls input').evaluate(el=>getComputedStyle(el).outlineStyle)!=='none',`${width} focus missing`);
     await page.emulateMedia({reducedMotion:'reduce'});check(await page.locator('.tt-hours-week-nav button').first().evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<=.001),`${width} reduced motion`);
    }
   }else before=values;
   if(theme==='dark'&&width===1440)await page.screenshot({path:`${folder}/${version}-1440.png`,fullPage:true});
   await page.close();
  }
 }
 console.log(`CP_CRM_DARK_07_BROWSER_PASS ${checked} assertions`);
}finally{await browser.close()}
