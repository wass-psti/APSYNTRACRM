/** Visual structure, responsive behavior and before/after fixture evidence. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const current=readFileSync('frontend/apsyntra-styles.bundle.css','utf8');
const previous=execFileSync('git',['show','origin/main:frontend/apsyntra-styles.bundle.css'],{encoding:'utf8',maxBuffer:8*1024*1024});
const output='/tmp/cp-crm-ui-redesign-03-evidence';
mkdirSync(output,{recursive:true});
const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"><div class="shell"><aside class="sidebar aps-sidebar"><div class="sidebar-brand-wrap"><a href="#/overview" class="brand"><span class="brand-mark">A</span><span class="brand-text">APSYNTRA CRM</span></a><span class="sidebar-brand-subtitle">WORKSPACE OPERATIONS</span></div><button class="workspace-switcher"><span class="workspace-icon">W</span><span class="workspace-name">Work Management</span></button><div class="sidebar-nav-scroll"><div class="side-section">Workspace</div><div class="nav-list"><a class="nav-link active" aria-current="page" href="#/overview"><span class="nav-ico">◈</span><span class="nav-label">Dashboard</span></a><a class="nav-link" href="#/boards"><span class="nav-ico">▦</span><span class="nav-label">My Boards</span></a><a class="nav-link" href="#/tradelink"><span class="nav-ico">▤</span><span class="nav-label">TradeLink</span></a><a class="nav-link" href="#/settings"><span class="nav-ico">⚙</span><span class="nav-label">Settings</span></a></div></div><div class="side-bottom"><div class="profile"><span class="avatar">LM</span><div class="sidebar-profile-text"><span class="name">Workspace member</span></div></div><button class="sign-out">Sign out</button></div></aside><main class="main aps-overview-shell"><header class="topbar"><span class="breadcrumb"><strong>Overview</strong></span><span class="top-actions"><span class="top-pill">Connected</span></span></header><div class="main-content"><div class="aps-overview"><section class="page-head overview-hero" aria-labelledby="overview-title"><div class="overview-hero-index" aria-hidden="true"><span>APSYNTRA</span><strong>01 / WORKSPACE</strong></div><div class="overview-hero-copy"><span class="label-top"><span class="overview-hero-dot"></span>Workspace / Overview</span><h1 id="overview-title">Good to see you, Team 👋</h1><p>Everything in motion. One connected place to plan, organize and move your work forward.</p></div><div class="head-actions"><button class="secondary overview-refresh" type="button">Refresh</button><button class="primary overview-create" type="button">New board</button></div></section><section class="stat-grid overview-stat-grid" aria-label="Workspace statistics"><div class="stat-card"><span class="stat-icon">▦</span><div class="stat-label">Active boards</div><div class="stat-value">255</div><div class="stat-footer">Available to your account</div></div><div class="stat-card"><span class="stat-icon">▤</span><div class="stat-label">Board items</div><div class="stat-value">22,861</div><div class="stat-footer">Across your active boards</div></div><div class="stat-card"><span class="stat-icon">◉</span><div class="stat-label">Workspace status</div><div class="stat-value">Active</div><div class="stat-footer">Access context verified</div></div><div class="stat-card"><span class="stat-icon">◈</span><div class="stat-label">Your access</div><div class="stat-value">CRM Admin</div><div class="stat-footer">Work Management</div></div></section><div class="overview-command-grid"><section class="overview-board-section"><div class="section-header overview-section-heading"><div><span class="overview-section-eyebrow">YOUR WORKSPACE</span><h2 class="section-title">Your boards</h2><p class="overview-board-count">Showing 4 of 255 available boards</p></div><a class="inline-link" href="#/boards">View all boards</a></div><div class="card-grid overview-board-grid">${['TradeLink','TimeTracker','Material Request Hub','Fund Released Tracker'].map((name,i)=>`<article class="board-card"><div class="board-card-top"><span class="board-symbol">${name[0]}</span></div><a class="board-card-main" href="#/boards/${i}"><h3>${name}</h3><p>Connected records and workspace updates</p><div class="board-card-footer"><span>▤ ${i+12} items</span><span>Updated today</span></div></a></article>`).join('')}</div></section><aside class="overview-insight-rail"><div class="section-header overview-section-heading overview-essentials-heading"><div><span class="overview-section-eyebrow">FOUNDATION</span><h2 class="section-title">Workspace essentials</h2></div></div><section class="panel overview-essentials"><div class="panel-body">${['Session connected','Board permissions centralized','Native issue transactions'].map(label=>`<div class="activity-item"><span class="activity-avatar">✓</span><div><b>${label}</b><small>Current workspace service is available.</small></div></div>`).join('')}</div></section></aside></div></div></div></main></div></div></body></html>`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/Applications/Chromium.app/Contents/MacOS/Chromium'});
let count=0;
const check=(ok,msg)=>{assert.ok(ok,msg);count++};
try{
 for(const width of [390,768,1440]){
  for(const [version,css] of [['before',previous],['after',current]]){
   const page=await browser.newPage({viewport:{width,height:960},deviceScaleFactor:1});
   await page.setContent(html);await page.addStyleTag({content:css});await page.waitForTimeout(350);
   const data=await page.evaluate(()=>{
    const color=(sel)=>getComputedStyle(document.querySelector(sel)).backgroundColor;
    const rect=(sel)=>{const r=document.querySelector(sel).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
    return {heroDisplay:getComputedStyle(document.querySelector('.overview-hero')).display,metricDisplay:getComputedStyle(document.querySelector('.stat-card')).display,heroMatches:document.querySelector('.overview-hero').matches('#app .aps-overview .overview-hero'),metricMatches:document.querySelector('.stat-card').matches('#app .aps-overview .stat-card:first-child'),sidebar:color('.aps-sidebar'),sidebarImage:getComputedStyle(document.querySelector('.aps-sidebar')).backgroundImage,hero:color('.overview-hero'),heroImage:getComputedStyle(document.querySelector('.overview-hero')).backgroundImage,metric:color('.stat-card'),metricImage:getComputedStyle(document.querySelector('.stat-card')).backgroundImage,
     command:getComputedStyle(document.querySelector('.overview-command-grid')).gridTemplateColumns,
     board:rect('.overview-board-section'),aside:rect('.overview-insight-rail'),
     overflow:document.documentElement.scrollWidth-innerWidth};
   });
   check(data.overflow<=1,`${width} ${version} overflow ${data.overflow}`);
   if(version==='after'){
    check(data.sidebarImage.includes('rgb(17, 29, 51)'),`${width} new dark sidebar missing: ${data.sidebar}`);
    check(data.heroImage.includes('linear-gradient')&&data.metric==='rgb(25, 40, 64)',`${width} new lead metric treatment missing: ${data.metric}`);
    if(width===1440)check(data.aside.x>=data.board.x+data.board.width-1,`desktop insight panel not positioned beside boards`);
    else check(data.aside.y>=data.board.y+data.board.height-1,`${width}: insight panel not stacked below boards`);
    await page.locator('.nav-link').nth(1).focus();
    check(await page.locator('.nav-link').nth(1).evaluate(el=>getComputedStyle(el).outlineStyle)!=='none',`${width}: keyboard navigation focus invisible`);
    await page.emulateMedia({reducedMotion:'reduce'});
    check(await page.locator('.overview-create').evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)<=.001),`${width}: reduced motion missing`);
   }
   await page.screenshot({path:`${output}/overview-${version}-${width}.png`,fullPage:true});
   console.log(`VISUAL_${version.toUpperCase()}_${width}: ${JSON.stringify(data)}`);
   await page.close();
  }
 }
 console.log(`CP_CRM_UI_REDESIGN_03_BROWSER_PASS ${count} assertions; screenshots: ${output}`);
}finally{await browser.close();}
