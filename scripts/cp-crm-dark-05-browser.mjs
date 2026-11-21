/** Share & access dark-mode fixture: actual Chromium computed-style acceptance. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const beforeCss=execFileSync('git',['show','origin/main:frontend/apsyntra-styles.bundle.css'],{encoding:'utf8',maxBuffer:8*1024*1024});
const afterCss=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
const folder='docs/visual/cp-crm-dark-05';mkdirSync(folder,{recursive:true});
const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="board-share-stage-overlay"><div class="board-share-stage-frame"><section class="board-share-stage" role="dialog" aria-modal="true" aria-labelledby="board-share-stage-heading"><header class="board-share-stage-heading"><div class="board-share-stage-title"><h2 id="board-share-stage-heading">Share &amp; access</h2><p class="board-share-stage-board">Trade-Link</p></div><button class="board-share-stage-close" aria-label="Close sharing panel">×</button></header><div class="board-share-stage-section"><div class="board-share-stage-row"><span class="board-share-stage-icon">♧</span><div class="board-share-stage-copy"><strong>Board privacy</strong><p>Workspace members with access</p></div><span class="board-share-stage-pill">Workspace</span></div><p class="board-share-stage-caption">Signed sharing policy</p></div><div class="board-share-stage-section"><div class="board-share-stage-row"><span class="board-share-stage-icon">♙</span><div class="board-share-stage-copy"><strong>People with access</strong><p>Assigned members</p></div><button class="board-share-stage-secondary">View people</button></div></div><div class="board-share-stage-section"><div class="bs09-board-access"><div class="bs09-picker-head"><strong>Assign people or groups</strong><small>Select existing workspace members</small></div><div class="bs09-picker-tabs"><button aria-pressed="true">People</button><button aria-pressed="false">Groups</button></div><label for="picker-search">Search people</label><input id="picker-search" placeholder="Search people"/><div class="bs09-access-results"><div class="bs09-access-result"><span>Example User</span><small>Workspace member</small><button disabled>Assigned</button></div></div><p class="bs09-access-note">Select a board member.</p><button class="bs09-group-create" disabled>Create group</button></div></div><div class="board-share-stage-section"><div class="board-share-stage-row"><span class="board-share-stage-icon">✉</span><div class="board-share-stage-copy"><strong>Invite someone new</strong><p>Workspace owners can send invitations</p></div></div><button class="board-share-stage-secondary bs09-workspace-invite">Open workspace invitations</button></div><div class="board-share-stage-form"><label for="recipient">Email address</label><input id="recipient" placeholder="name@company.com"/><button class="board-share-stage-primary" disabled>Invite unavailable</button></div></section></div></div></body></html>`;
const selectors=['.board-share-stage-frame','.board-share-stage-title h2','.board-share-stage-board','.board-share-stage-copy strong','.board-share-stage-copy p','.board-share-stage-pill','.board-share-stage-icon','.board-share-stage-caption','.board-share-stage-close','.board-share-stage-secondary','.board-share-stage-primary','.board-share-stage-form input','.bs09-picker-head strong','.bs09-picker-head small','.bs09-picker-tabs button','.bs09-board-access input','.bs09-access-result>span','.bs09-access-result>small','.bs09-access-result>button','.bs09-group-create'];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/Applications/Chromium.app/Contents/MacOS/Chromium'});
let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++};
const inspect=selectors=>{
 const rgb=v=>{const m=v.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').slice(0,3).map(Number):null};
 const lum=arr=>arr.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
 const parentBg=el=>{for(let n=el;n;n=n.parentElement){const c=getComputedStyle(n).backgroundColor;if(c.startsWith('rgb('))return c}return 'rgb(255, 255, 255)'};
 return selectors.map(selector=>{const el=document.querySelector(selector),s=getComputedStyle(el),back=parentBg(el);const a=lum(rgb(s.color)),b=lum(rgb(back));return {selector,color:s.color,background:s.backgroundColor,contrast:+((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2)};});
};
try{
 for(const width of [390,768,1440])for(const theme of ['light','dark']){
  let baseline;
  for(const [version,css] of [['before',beforeCss],['after',afterCss]]){
   const page=await browser.newPage({viewport:{width,height:900}});
   await page.setContent(html);await page.evaluate(x=>document.documentElement.dataset.apsMondayTheme=x,theme);
   await page.addStyleTag({content:css});await page.waitForTimeout(240);
   const results=await page.evaluate(inspect,selectors);
   if(version==='after'){
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${theme} horizontal overflow`);
    if(theme==='light')for(let i=0;i<results.length;i++)for(const key of ['color','background'])
     check(results[i][key]===baseline[i][key],`${width} light ${results[i].selector} ${key} changed`);
    if(theme==='dark'){
     for(const v of results){
      if(['.board-share-stage-title h2','.board-share-stage-board','.board-share-stage-copy strong','.board-share-stage-copy p','.board-share-stage-caption','.bs09-picker-head strong','.bs09-picker-head small','.bs09-access-result>span','.bs09-access-result>small'].includes(v.selector))check(v.contrast>=4.5,`${width} ${v.selector} contrast ${v.contrast}`);
     }
     for(const selector of ['.board-share-stage-frame','.board-share-stage-close','.board-share-stage-secondary','.board-share-stage-form input','.bs09-board-access input','.bs09-access-result>button']){
      const v=results.find(x=>x.selector===selector);
      check(v.background.startsWith('rgb(')&&!['rgb(255, 255, 255)','rgb(249, 250, 255)','rgb(245, 246, 250)'].includes(v.background),`${width} ${selector} still bright ${v.background}`);
     }
     await page.locator('#picker-search').focus();check(await page.locator('#picker-search').evaluate(el=>getComputedStyle(el).outlineStyle)!=='none',`${width} keyboard focus`);
     await page.emulateMedia({reducedMotion:'reduce'});check(await page.locator('.board-share-stage-secondary').first().evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<=.001),`${width} reduced motion duration ${await page.locator('.board-share-stage-secondary').first().evaluate(el=>getComputedStyle(el).transitionDuration)}`);
    }
   }else baseline=results;
   if(theme==='dark'&&width===1440)await page.screenshot({path:`${folder}/${version}-1440.png`,fullPage:true});
   await page.close();
  }
 }
 console.log(`CP_CRM_DARK_05_BROWSER_PASS ${checks} checks`);
}finally{await browser.close()}
