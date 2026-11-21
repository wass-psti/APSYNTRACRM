/** Dark-only native modules: real Chromium computed color, contrast and focus. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const previous=execFileSync('git',['show','origin/main:frontend/apsyntra-styles.bundle.css'],{encoding:'utf8',maxBuffer:8*1024*1024});
const current=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="app"><main class="main"><div class="main-content">
<section class="aps-tradelink-app tl-reference-portal"><header class="tl-reference-topbar"><a class="tl-reference-brand"><strong>TradeLink</strong></a><nav class="tl-reference-portal-links"><a href="#new" class="tl-reference-create">Create</a></nav></header><div class="tl-app-layout"><nav class="tl-app-nav"><a class="active" href="#draft">Documents</a></nav><div class="tl-app-main"><div class="tl-content-panel"><h2>Document overview</h2><p>Existing records</p></div><div class="tl-draft-workspace"><div class="tl-draft-panel"><div class="tl-reference-document-topcard"><div class="tl-reference-document-title"><h3>Quotation</h3></div><div class="tl-reference-document-toolbar"><button>Save</button></div></div><div class="tl-reference-editor-content"><label>Remarks<input id="tl-input" placeholder="Remarks"/></label></div></div></div></div></div></section>
<section class="frt-ref frt-native"><div class="frt-ref-nav"><span>Overview</span></div><div class="frt-ref-hero"><div class="frt-ref-hero-title"><h2>Fund Tracker</h2><p>Executive overview</p></div></div><div class="frt-ref-metrics"><div class="frt-ref-metric"><div><span>Vouchers</span><strong>123</strong></div></div></div><div class="frt-ref-analytics"><div class="frt-ref-chart"><header><strong>Progress chart</strong><small>Monthly activity</small></header></div></div><div class="frt-ref-table-card"><div class="frt-ref-filters"><label>Filter</label><select aria-label="Filter"><option>All</option></select></div><div class="frt-ref-table-scroll"><table class="frt-ref-table"><thead><tr><th>Voucher</th></tr></thead><tbody><tr><td class="frt-ref-request-name">Purchase request</td></tr></tbody></table></div></div><div class="frt-ref-more-menu"><button id="frt-menu-button">View voucher</button></div></section>
<section class="ft3-app"><div class="ft3-panel"><header class="ft3-panel-head"><h3>FuelTrack+</h3><p>Requests</p></header></div></section>
<section class="tb-app"><div class="tb-panel"><div class="tb-panel-heading"><h3>TalkBox</h3></div></div></section>
<section class="aps-board-shell aps-time-tracker-shell"><div class="tt-native"><div class="fm1-app"><div class="fm1-panel">TimeTracker attendance</div></div></div></section>
</div></main></div></body></html>`;
const targets=['.aps-tradelink-app','.tl-reference-topbar','.tl-content-panel','.tl-content-panel h2','.tl-content-panel p','.tl-draft-panel','.tl-reference-document-topcard','.tl-reference-document-title h3','.tl-reference-document-toolbar button','.tl-reference-editor-content','#tl-input','.frt-ref','.frt-ref-nav','.frt-ref-hero','.frt-ref-hero-title h2','.frt-ref-hero-title p','.frt-ref-metric','.frt-ref-metric strong','.frt-ref-chart','.frt-ref-chart header strong','.frt-ref-table-card','.frt-ref-table td','.frt-ref-filters select','.frt-ref-more-menu','#frt-menu-button','.ft3-panel','.ft3-panel-head h3','.tb-panel','.tb-panel-heading h3','.fm1-panel'];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/Applications/Chromium.app/Contents/MacOS/Chromium'});
let checks=0;const check=(ok,message)=>{assert.ok(ok,message);checks++};
try{
 for(const width of [390,768,1440]){
  for(const theme of ['light','dark']){
   const all=[];
   for(const [version,css] of [['before',previous],['after',current]]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.setContent(html);await page.evaluate(t=>document.documentElement.dataset.apsMondayTheme=t,theme);
    await page.addStyleTag({content:css});await page.waitForTimeout(270);
    const data=await page.evaluate(selectors=>{
     const rgb=v=>{const m=v.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').slice(0,3).map(Number):null};
     const lum=arr=>arr.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
     const contrast=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));return +((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2)};
     const background=element=>{for(let node=element;node;node=node.parentElement){const b=getComputedStyle(node).backgroundColor;if(b.startsWith('rgb('))return b;}return 'rgb(255, 255, 255)'};
     return selectors.map(selector=>{const el=document.querySelector(selector);if(!el)return {selector,missing:true};const style=getComputedStyle(el),bg=background(el);return {selector,color:style.color,background:bg,contrast:contrast(style.color,bg)};});
    },targets);
    all.push(data);
    if(version==='after'){
     if(theme==='light'){
      for(let i=0;i<data.length;i++){
       check(data[i].color===all[0][i].color,`${width} light foreground changed: ${data[i].selector}`);
       check(data[i].background===all[0][i].background,`${width} light background changed: ${data[i].selector}`);
      }
     }else{
      for(const selector of ['.tl-content-panel','.tl-draft-panel','.tl-reference-document-topcard','.tl-reference-editor-content','.frt-ref-table-card','.frt-ref-metric','.frt-ref-chart','.ft3-panel','.tb-panel','.fm1-panel']){
       const v=data.find(x=>x.selector===selector);
       check(v.background!=='rgb(255, 255, 255)'&&v.background!=='rgb(250, 252, 255)',`${width} dark ${selector} remains light ${v.background}`);
       check(v.contrast>=4.5,`${width} dark ${selector} contrast ${v.contrast}`);
      }
      for(const selector of ['.tl-content-panel h2','.tl-content-panel p','.tl-reference-document-title h3','.frt-ref-hero-title h2','.frt-ref-metric strong','.frt-ref-table td','.ft3-panel-head h3','.tb-panel-heading h3']){
       const v=data.find(x=>x.selector===selector);
       check(v.contrast>=4.5,`${width} dark ${selector} contrast ${v.contrast}`);
      }
      await page.locator('#tl-input').focus();
      check(await page.locator('#tl-input').evaluate(el=>getComputedStyle(el).outlineStyle)!=='none',`${width} TradeLink focus missing`);
      await page.locator('#frt-menu-button').focus();
      check(await page.locator('#frt-menu-button').evaluate(el=>getComputedStyle(el).outlineStyle)!=='none',`${width} Fund Tracker focus missing`);
      await page.emulateMedia({reducedMotion:'reduce'});
      check(await page.locator('#frt-menu-button').evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<=.001),`${width} reduced motion missing`);
      if(width===1440)console.log('DARK_NATIVE_CONTRAST',JSON.stringify(data));
     }
    }
    await page.close();
   }
  }
 }
 console.log(`CP_CRM_DARK_02_BROWSER_PASS ${checks} checks across 390/768/1440px in light and dark`);
}finally{await browser.close()}
