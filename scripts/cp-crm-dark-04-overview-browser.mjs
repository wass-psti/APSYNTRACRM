/** Dark-04: verify actual computed initial contrast and non-overlapping essentials. */
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const previous=execFileSync('git',['show','origin/main:frontend/apsyntra-styles.bundle.css'],{encoding:'utf8',maxBuffer:8*1024*1024});
const current=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
const destination='docs/visual/cp-crm-dark-04';mkdirSync(destination,{recursive:true});
const items=[['T','', 'Trade-Link'],['I','green','Inventory Material Requests'],['C','orange','Company Documents'],['F','pink','Files'],['P','blue','PWRI Project Completion Documents']];
const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"><div class="shell"><aside class="aps-sidebar"><div class="sidebar-brand-wrap"><a href="#/overview" class="brand">APSYNTRA CRM</a></div><div class="sidebar-nav-scroll"><div class="sidebar-recent-list">${items.map(([initial,tone,name])=>`<span class="sidebar-board-initial sidebar-tone-${tone||'indigo'}">${initial}</span>${name}`).join('')}</div></div></aside><main class="main aps-overview-shell"><div class="topbar">Overview</div><div class="main-content"><div class="aps-overview"><div class="section-header overview-section-heading"><h2 class="section-title">Your boards</h2></div><div class="card-grid overview-board-grid">${items.map(([initial,tone,name])=>`<article class="board-card"><div class="board-card-top"><span class="board-symbol ${tone}">${initial}</span></div><a class="board-card-main" href="#/boards"><h3>${name}</h3><p>Connected workspace updates</p><div class="board-card-footer"><span>299 items</span></div></a></article>`).join('')}</div><div class="section-header overview-section-heading overview-essentials-heading"><div class="overview-heading-copy"><span class="overview-section-eyebrow">FOUNDATION</span><h2 class="section-title">Workspace essentials</h2></div></div><section class="panel overview-essentials" aria-label="Workspace essentials"><div class="panel-body">${[['🔒','Supabase Auth connected','Your session is verified against the existing identity system.'],['🛡','Board permissions are centralized','Each board and action is checked against the authoritative workspace permissions.'],['▤','Native issue transactions','Issue records use the existing RLS view and atomic Supabase transaction RPC.']].map(([icon,title,description])=>`<div class="activity-item"><span class="activity-avatar" aria-hidden="true">${icon}</span><div><b>${title}</b><small>${description}</small></div><span class="overview-essentials-indicator" aria-hidden="true">✓</span></div>`).join('')}</div></section></div></div></main></div></div></body></html>`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/Applications/Chromium.app/Contents/MacOS/Chromium'});
let count=0;const check=(pass,description)=>{assert.ok(pass,description);count++};
const evaluate=()=>{
 const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
 const collide=(a,b)=>a.left<b.right-.5&&a.right>b.left+.5&&a.top<b.bottom-.5&&a.bottom>b.top+.5;
 const rgb=value=>{const m=value.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').slice(0,3).map(Number):null};
 const lum=color=>color.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));return Number(((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2))};
 const panel=document.querySelector('.overview-essentials'),panelRect=rect(panel),body=rect(panel.querySelector('.panel-body'));
 const gridCols=getComputedStyle(panel.querySelector('.panel-body')).gridTemplateColumns;
 const samples=Array.from(document.querySelectorAll('.overview-board-grid .board-symbol')).map(el=>({tone:el.className,color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,contrast:ratio(getComputedStyle(el).color,getComputedStyle(el).backgroundColor)}));
 const essentials=Array.from(document.querySelectorAll('.overview-essentials .activity-item')).map(el=>{
  const avatar=rect(el.querySelector('.activity-avatar')),text=rect(el.querySelector('div')),check=rect(el.querySelector('.overview-essentials-indicator')),r=rect(el),bold=rect(el.querySelector('b')),small=rect(el.querySelector('small'));
  return {r,avatar,text,check,bold,small,background:getComputedStyle(el).backgroundColor,headingBelowStatus:bold.top>=check.bottom+6,overlap:collide(avatar,text)||collide(text,check)||collide(avatar,check),contained:r.left>=panelRect.left-1&&r.right<=panelRect.right+1&&r.top>=panelRect.top-1&&r.bottom<=panelRect.bottom+1&&bold.left>=text.left-1&&small.right<=text.right+1};
 });
 return {panel:panelRect,body,gridCols,essentials,samples,overflow:document.documentElement.scrollWidth-innerWidth};
};
try{
 for(const width of [390,768,1024,1280,1440,1898])for(const theme of ['dark','light']){
  let base;
  for(const [version,css] of [['before',previous],['after',current]]){
   const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
   await page.setContent(html);await page.evaluate(value=>document.documentElement.dataset.apsMondayTheme=value,theme);
   await page.addStyleTag({content:css});await page.waitForTimeout(250);
   const data=await page.evaluate(evaluate);
   if(version==='after'){
    check(data.overflow<=1,`${theme} ${width} horizontal page overflow ${data.overflow}`);
    for(const [i,s] of data.essentials.entries()){
     check(!s.overlap,`${theme} ${width} essentials item ${i+1} content overlaps`);
     check(s.contained,`${theme} ${width} essentials item ${i+1} protrudes outside panel`);
     check(s.headingBelowStatus,`${theme} ${width} essentials item ${i+1}: check overlaps heading row`);
     check(s.background!=='rgba(0, 0, 0, 0)',`${theme} ${width} essentials item ${i+1}: no independent card surface`);
    }
    if(theme==='dark'){
     for(const s of data.samples){check(s.contrast>=4.5,`${width} ${s.tone} initial contrast ${s.contrast}`);check(s.background!=='rgb(239, 238, 255)',`${width} ${s.tone} retained light initial tile`);}
    }else{
     for(let i=0;i<data.samples.length;i++)check(data.samples[i].background===base.samples[i].background,`${width} light initial background changed`);
    }
   }else base=data;
   if(theme==='dark'&&(width===390||width===1440||width===1898)){
    await page.screenshot({path:`${destination}/overview-${version}-${width}.png`,fullPage:true});
   }
   if(theme==='dark'&&version==='after')console.log('LAYOUT',width,JSON.stringify({panel:data.panel,columns:data.gridCols,items:data.essentials.map(s=>({overlap:s.overlap,contained:s.contained,headingBelowStatus:s.headingBelowStatus})),initials:data.samples.map(s=>({tone:s.tone,contrast:s.contrast,background:s.background}))}));
   await page.close();
  }
 }
 console.log(`CP_CRM_DARK_04_BROWSER_PASS ${count} checks; screenshots ${destination}`);
}finally{await browser.close()}
