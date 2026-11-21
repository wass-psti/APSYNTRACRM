/** Compare actual computed invitation colors against the previous production CSS. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const oldCss=execFileSync('git',['show','origin/main:frontend/apsyntra-styles.bundle.css'],{encoding:'utf8',maxBuffer:8*1024*1024});
const newCss=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
const preview='docs/visual/cp-crm-dark-invite-01';mkdirSync(preview,{recursive:true});
const pageHtml=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="ws01-overlay ws01-invite"><section class="ws02-invite-card" role="dialog" aria-modal="true" aria-labelledby="ws02-invite-title"><header class="ws02-invite-heading"><div><p class="ws02-eyebrow">WORKSPACE INVITATION</p><h2 id="ws02-invite-title">Invite people to Work Management</h2></div><button data-ws01-close aria-label="Close">×</button></header><p class="ws02-invite-subtitle">Send an email invitation. People with an APSYNTRA account can sign in and accept; new users can request account access first.</p><form id="ws02-invite-preview"><div class="ws02-invite-field"><label for="ws02-invite-email">Email address</label><input type="email" id="ws02-invite-email" placeholder="name@company.com"/><small>We will send a one-time invitation link to this address.</small></div><div class="ws02-invite-field"><label for="ws02-invite-message">Message <span>(optional)</span></label><textarea id="ws02-invite-message" placeholder="Add a short note"></textarea></div><div class="ws02-invite-access"><span class="ws02-invite-access-icon">✓</span><span><strong>Workspace access</strong><small>Member</small></span></div><p class="ws02-invite-feedback">Ready to send</p><footer class="ws02-invite-footer"><button type="button" class="ws02-secondary">Cancel</button><button type="submit" class="ws02-send">Send invitation</button></footer></form><section class="ws11-manage"><div class="ws11-manage-heading"><h3>Invitations</h3><button>Refresh</button></div><p class="ws11-manage-feedback">Invitations</p><div class="ws11-invite-list"><div class="ws11-invite-row"><div><strong>example@company.com</strong><small>Pending invitation</small></div><span class="ws02-invite-state is-pending">Pending</span><button class="ws02-invite-revoke">Revoke</button></div></div></section></section></div></body></html>`;
const selectors=['.ws02-invite-card','.ws02-invite-heading h2','.ws02-invite-subtitle','.ws02-eyebrow','.ws02-invite-field label','.ws02-invite-field small','#ws02-invite-email','#ws02-invite-message','.ws02-invite-access','.ws02-invite-access strong','.ws02-invite-access small','.ws02-invite-feedback','.ws02-invite-footer','.ws02-secondary','.ws02-send','.ws11-manage-heading h3','.ws11-invite-row','.ws11-invite-row strong','.ws02-invite-state.is-pending','.ws02-invite-revoke'];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/Applications/Chromium.app/Contents/MacOS/Chromium'});
let passed=0;const check=(v,msg)=>{assert.ok(v,msg);passed++};
const analyze=elements=>{
 const rgb=v=>{const m=v.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').slice(0,3).map(Number):null};
 const l=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const bg=el=>{for(let p=el;p;p=p.parentElement){const c=getComputedStyle(p).backgroundColor;if(/^rgb\(/.test(c))return c}return 'rgb(255, 255, 255)'};
 return elements.map(selector=>{const el=document.querySelector(selector),style=getComputedStyle(el),back=bg(el),a=l(rgb(style.color)),b=l(rgb(back));return {selector,background:style.backgroundColor,actualBackground:back,color:style.color,ratio:+((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2)}});
};
try{
 for(const width of [390,768,1440])for(const theme of ['light','dark']){
  let before;
  for(const [version,css] of [['before',oldCss],['after',newCss]]){
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.setContent(pageHtml);await page.evaluate(t=>document.documentElement.dataset.apsMondayTheme=t,theme);
   await page.addStyleTag({content:css});await page.waitForTimeout(220);
   const data=await page.evaluate(analyze,selectors);
   if(version==='after'){
    if(theme==='light')for(let i=0;i<data.length;i++)for(const key of ['color','background'])check(data[i][key]===before[i][key],`${width} light-mode ${data[i].selector} ${key} changed`);
    else{
     for(const selector of ['.ws02-invite-card','#ws02-invite-email','#ws02-invite-message','.ws02-invite-access','.ws02-secondary','.ws02-invite-revoke']){
      const v=data.find(x=>x.selector===selector);
      check(v.background.startsWith('rgb(')&&!['rgb(255, 255, 255)','rgb(251, 252, 255)'].includes(v.background),`${width} ${selector} remained light: ${v.background}`);
     }
     for(const v of data)if(!['.ws02-eyebrow','.ws02-invite-state.is-pending'].includes(v.selector))check(v.ratio>=4.5,`${width} ${v.selector}: contrast ${v.ratio}`);
     await page.locator('#ws02-invite-email').focus();
     check(await page.locator('#ws02-invite-email').evaluate(el=>getComputedStyle(el).outlineStyle)!=='none',`${width} focus missing`);
     await page.emulateMedia({reducedMotion:'reduce'});
     check(await page.locator('.ws02-send').evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)===0),`${width} reduced motion missing`);
     console.log('DARK_INVITE',width,JSON.stringify(data));
    }
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${theme} horizontal overflow`);
   }else before=data;
   if(theme==='dark'&&width===1440)await page.screenshot({path:`${preview}/${version}-1440.png`,fullPage:true});
   await page.close();
  }
 }
 console.log(`CP_CRM_DARK_INVITE_PASS ${passed} checks`);
}finally{await browser.close()}
