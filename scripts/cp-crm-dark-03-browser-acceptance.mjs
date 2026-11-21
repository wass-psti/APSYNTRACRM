/** Isolated screenshot/contrast acceptance against the previous deployed stylesheet. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const previous=execFileSync('git',['show','origin/main:frontend/apsyntra-styles.bundle.css'],{encoding:'utf8',maxBuffer:8*1024*1024});
const current=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
const output='docs/visual/cp-crm-dark-03';
mkdirSync(output,{recursive:true});
const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"><div class="shell"><aside class="sidebar aps-sidebar"><div class="sidebar-brand-wrap"><a href="#/overview" class="brand"><span class="brand-mark">A</span><span class="brand-text">APSYNTRA CRM</span></a><span class="sidebar-brand-subtitle">WORKSPACE OPERATIONS</span></div><button class="workspace-switcher"><span class="workspace-icon">W</span><span class="workspace-name">Work Management</span></button><div class="sidebar-nav-scroll"><div class="side-section">Workspace</div><div class="nav-list"><a class="nav-link active" aria-current="page" href="#/overview"><span class="nav-ico">◈</span><span class="nav-label">Dashboard</span></a><a class="nav-link" href="#/boards"><span class="nav-ico">▦</span><span class="nav-label">My Boards</span></a><a class="nav-link" href="#/tradelink"><span class="nav-ico">▤</span><span class="nav-label">TradeLink</span></a><a class="nav-link" href="#/settings"><span class="nav-ico">⚙</span><span class="nav-label">Settings</span></a></div></div><div class="side-bottom"><div class="profile"><span class="avatar">LM</span><div class="sidebar-profile-text"><span class="name">Workspace member</span></div></div><button class="sign-out">Sign out</button></div></aside><main class="main aps-overview-shell"><header class="topbar"><span class="breadcrumb"><strong>Overview</strong></span><span class="top-actions"><span class="top-pill">Connected</span></span></header><div class="main-content"><div class="aps-overview"><section class="page-head overview-hero" aria-labelledby="overview-title"><div class="overview-hero-copy"><span class="label-top"><span class="overview-hero-dot"></span>Workspace / Overview</span><h1 id="overview-title">Good to see you, Team 👋</h1><p>Everything in motion. One connected place to plan, organize and move your work forward.</p></div><div class="head-actions"><button class="secondary overview-refresh" type="button">Refresh</button><button class="primary overview-create" type="button">New board</button></div></section><section class="stat-grid overview-stat-grid" aria-label="Workspace statistics"><div class="stat-card"><span class="stat-icon">▦</span><div class="stat-label">Active boards</div><div class="stat-value">255</div><div class="stat-footer">Available to your account</div></div><div class="stat-card"><span class="stat-icon">▤</span><div class="stat-label">Board items</div><div class="stat-value">22,861</div><div class="stat-footer">Across your active boards</div></div><div class="stat-card"><span class="stat-icon">◉</span><div class="stat-label">Workspace status</div><div class="stat-value">Active</div><div class="stat-footer">Access context verified</div></div><div class="stat-card"><span class="stat-icon">◈</span><div class="stat-label">Your access</div><div class="stat-value">CRM Admin</div><div class="stat-footer">Work Management</div></div></section><div class="overview-command-grid"><section class="overview-board-section"><div class="section-header overview-section-heading"><div><span class="overview-section-eyebrow">YOUR WORKSPACE</span><h2 class="section-title">Your boards</h2><p class="overview-board-count">Showing 4 of 255 available boards</p></div><a class="inline-link" href="#/boards">View all boards</a></div><div class="card-grid overview-board-grid">${['TradeLink','TimeTracker','Material Request Hub','Fund Released Tracker'].map((name,i)=>`<article class="board-card"><div class="board-card-top"><span class="board-symbol">${name[0]}</span></div><a class="board-card-main" href="#/boards/${i}"><h3>${name}</h3><p>Connected records and workspace updates</p><div class="board-card-footer"><span>▤ ${i+12} items</span><span>Updated today</span></div></a></article>`).join('')}</div></section><aside class="overview-insight-rail"><div class="section-header overview-section-heading overview-essentials-heading"><div><span class="overview-section-eyebrow">FOUNDATION</span><h2 class="section-title">Workspace essentials</h2></div></div><section class="panel overview-essentials"><div class="panel-body">${['Session connected','Board permissions centralized','Native issue transactions'].map(label=>`<div class="activity-item"><span class="activity-avatar">✓</span><div><b>${label}</b><small>Current workspace service is available.</small></div></div>`).join('')}</div></section></aside></div></div></div></main></div></div></body></html>`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/Applications/Chromium.app/Contents/MacOS/Chromium'});
let passed=0;
const check=(value,message)=>{assert.ok(value,message);passed++};
const sample=()=>{
 const get=selector=>{const el=document.querySelector(selector),s=getComputedStyle(el);
  return {background:s.backgroundColor,backgroundImage:s.backgroundImage,color:s.color,
   shadow:s.boxShadow,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height};};
 const contrast=(foreground,background)=>{
  const rgb=text=>{const m=text.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').slice(0,3).map(Number):[0,0,0]};
  const light=c=>rgb(c).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
  const a=light(foreground),b=light(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 };
 const sidebar=get('.aps-sidebar'),active=get('.nav-link.active'),hero=get('.overview-hero'),
  heading=get('.overview-hero h1'),card=get('.overview-board-grid .board-card'),
  metric=get('.overview-stat-grid .stat-card'),topbar=get('.topbar');
 return {sidebar,active,hero,heading,card,metric,topbar,
  activeContrast:contrast(active.color,active.background),
  headingContrast:contrast(heading.color,hero.background),
  documentOverflow:document.documentElement.scrollWidth-innerWidth};
};
try{
 for(const width of [390,768,1440]){
  for(const theme of ['light','dark']){
   let before;
   for(const [version,css] of [['before',previous],['after',current]]){
    const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
    await page.setContent(html);
    await page.evaluate(t=>document.documentElement.dataset.apsMondayTheme=t,theme);
    await page.addStyleTag({content:css});await page.waitForTimeout(280);
    const result=await page.evaluate(sample);
    check(result.documentOverflow<=1,`${theme} ${width} ${version} document overflow: ${result.documentOverflow}`);
    if(version==='after'){
     if(theme==='dark'){


      check(result.sidebar.background==='rgb(24, 24, 24)',`${width} sidebar not charcoal: ${result.sidebar.background}`);
      check(result.active.background==='rgb(25, 60, 120)',`${width} active navigation not blue: ${result.active.background}`);
      check(result.hero.background==='rgb(32, 32, 32)',`${width} hero not flat charcoal: ${result.hero.background}`);
      check(result.hero.backgroundImage==='none',`${width} old hero gradient remains`);
      check(result.card.background==='rgb(41, 41, 41)',`${width} cards not charcoal: ${result.card.background}`);
      check(result.hero.height<=Math.max(340,before.hero.height+15),`${width} oversized hero: ${result.hero.height}`);
      check(result.headingContrast>=4.5,`${width} heading contrast ${result.headingContrast}`);
      check(result.activeContrast>=4.5,`${width} selected navigation contrast ${result.activeContrast}`);
      await page.locator('.nav-link').nth(1).focus();
      check(await page.locator('.nav-link').nth(1).evaluate(el=>getComputedStyle(el).outlineStyle)!=='none',`${width} focus not visible`);
      await page.emulateMedia({reducedMotion:'reduce'});
      check(await page.locator('.nav-link').nth(1).evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<=.001),`${width} motion not disabled`);
     }else{
      for(const key of ['sidebar','active','hero','heading','card','metric','topbar']){
       check(result[key].background===before[key].background,`${width} light ${key} background changed`);
       check(result[key].color===before[key].color,`${width} light ${key} text changed`);
      }
     }
    }else before=result;
    if(theme==='dark'&&(width===390||width===1440)){
     const filename=`${output}/fixture-${version}-${width}.png`;
     await page.screenshot({path:filename,fullPage:true});
     console.log(`VISUAL_${version.toUpperCase()}_${width}`,JSON.stringify(result));
    }
    await page.close();
   }
  }
 }
 console.log(`CP_CRM_DARK_03_BROWSER_PASS ${passed} checks; fixture previews at ${output}`);
}finally{await browser.close()}
