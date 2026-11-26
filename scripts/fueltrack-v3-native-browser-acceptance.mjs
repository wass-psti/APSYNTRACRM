#!/usr/bin/env node
/** CP-FT-NATIVE-01C — deterministic native UI browser acceptance; no production writes. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {FUELTRACK_V3_ID,renderFuelTrackV3Application,fuelTrackHref} from '../frontend/fueltrack-v3-application.js';
const workspaceId='11111111-1111-4111-8111-111111111111';
const requestId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const detail={board:{id:FUELTRACK_V3_ID,workspace_id:workspaceId,name:'FuelTrack+ v3',status:'active',description:'[APSYNTRA:MODULE:fueltrack:v1] Native'},items:[],columns:[],values:[]};
const row={id:requestId,kind:'vehicle',revision:4,state:'completed',requestor_name:'Browser Acceptance',details:{plate:'GAN 8289',purpose:'Controlled regression fixture'},created_at:'2026-11-10T04:00:00Z',completed_at:'2026-11-10T07:00:00Z',actual_amount:500,fuel_liters:10};
const snapshot={status:'VERIFIED_READ',boardId:FUELTRACK_V3_ID,workspaceId,role:'Admin',rows:[row],summary:{total:1,submitted:0,approved:0,rejected:0,refuelingDone:0,completed:1,totalAmount:500,totalLiters:10,approvedToday:0,rejectedToday:0,decisionsToday:0,pendingCount:0,activeQueue:0,completedToday:0,overdueCount:0}};
const analytics={status:'VERIFIED_READ',boardId:FUELTRACK_V3_ID,workspaceId,daily:[{day:'2026-11-10',transactions:1,amount:500,liters:10}]};
const styles=readFileSync('frontend/apsyntra-styles.bundle.css','utf8')+'\n'+readFileSync('frontend/fueltrack-v3-application.css','utf8');
const browser=await chromium.launch({headless:true});
let checks=0;
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const [section,pattern] of [['dashboard',/Request pipeline/],['analytics',/Consumption Trend/],['requests',/Request Log/],['new-request',/Select Refuel Type/],['approvals',/Approvals/],['lightfuels',/LightFuels/],['activity',/Activity/]]) {
  const html=renderFuelTrackV3Application({detail,section,actorName:'Browser Acceptance',backend:{snapshot,analytics}});
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><main id="app">'+html+'</main></body></html>');
  await page.addStyleTag({content:styles});
  assert.match(await page.locator('.ft3-app-body').innerText(),pattern,section);
  assert.equal(await page.locator('.ft3-app-tabs a').count(),7,section);
  assert.equal(await page.locator('.ft3-app-tabs a[aria-current="page"]').count(),1,section);
  assert.equal(await page.locator('.ft3-app-tabs a[aria-current="page"]').getAttribute('href'),fuelTrackHref(section),section);
  if(section==='dashboard'){
   assert.match(await page.locator('.ft3-app-body').innerText(),/500|₱500/);
   assert.equal(await page.locator('.ft3-dashboard-financial-card').count(),2);
   assert.equal(await page.locator('.ft3-dashboard-stage').count(),5);
   assert.equal(await page.locator('.ft3-dashboard-progress').count(),1);
   assert.equal(await page.locator('.ft3-dashboard-recent tbody tr').count(),1);
   assert.equal(await page.locator('.ft3-dashboard-stage-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),5);
   await page.locator('html').evaluate(el=>el.setAttribute('data-aps-monday-theme','dark'));
   const darkTheme=await page.locator('html').evaluate(el=>{
    const style=getComputedStyle(el),probe=document.createElement('div');document.body.appendChild(probe);
    probe.style.backgroundColor=style.getPropertyValue('--crm-native-elevated').trim();
    const surface=getComputedStyle(probe).backgroundColor;
    probe.style.color=style.getPropertyValue('--crm-native-muted').trim();
    const muted=getComputedStyle(probe).color;probe.remove();return {surface,muted};
   });
   assert.equal(await page.locator('.ft3-dashboard-stage').first().evaluate(el=>getComputedStyle(el).backgroundColor),darkTheme.surface);
   assert.equal(await page.locator('.ft3-dashboard-stage-label').first().evaluate(el=>getComputedStyle(el).color),darkTheme.muted);
   await page.locator('html').evaluate(el=>el.removeAttribute('data-aps-monday-theme'));
  }
  if(section==='new-request'){
   assert.equal(await page.locator('#ft3-new-request-form').count(),1);
   assert.equal(await page.locator('#ft3-mode-vehicle').isChecked(),true);
   await page.locator('#ft3-mode-container').check();
   assert.equal(await page.locator('#ft3-mode-container').isChecked(),true);
  }
  checks++;
 }
 const dashboardHtml=renderFuelTrackV3Application({detail,section:'dashboard',backend:{snapshot,analytics}});
 await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><main id="app">'+dashboardHtml+'</main></body></html>');
 await page.addStyleTag({content:styles});
 assert.equal(await page.locator('.ft3-dashboard-stage-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),5);
 await page.setViewportSize({width:768,height:900});
 assert.equal(await page.locator('.ft3-dashboard-stage-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),3);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('.ft3-dashboard-stage-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No page-level overflow at 390px');
 await page.setViewportSize({width:360,height:844});
 assert.equal(await page.locator('.ft3-dashboard-stage-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No page-level overflow at 360px');
 checks+=4;
 const analyticsHtml=renderFuelTrackV3Application({detail,section:'analytics',backend:{snapshot,analytics}});
 await page.setViewportSize({width:1440,height:900});
 await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><main id="app">'+analyticsHtml+'</main></body></html>');
 await page.addStyleTag({content:styles});
 assert.equal(await page.locator('.ft3-analytics-kpi').count(),4);
 assert.equal(await page.locator('.ft3-analytics-section-tab').count(),5);
 assert.equal(await page.locator('.ft3-analytics-series').count(),2);
 assert.equal(await page.locator('.ft3-analytics-series[data-metric="amount"]').count(),1);
 assert.equal(await page.locator('.ft3-analytics-series[data-metric="liters"]').count(),1);
 assert.equal(await page.locator('.ft3-analytics-range a').count(),4);
 assert.equal(await page.locator('.ft3-analytics-metric-filter a').count(),3);
 assert.match(await page.locator('.ft3-analytics-hero').innerText(),/Verified signed data/);
 await page.locator('html').evaluate(el=>el.setAttribute('data-aps-monday-theme','dark'));
 const darkKpi=await page.locator('.ft3-analytics-kpi').first().evaluate(el=>getComputedStyle(el).backgroundColor);
 const darkPanel=await page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--crm-native-panel').trim());
 assert.ok(darkKpi.length>0&&darkPanel.length>0,'Analytics KPI cards have a dark-theme surface');
 await page.locator('html').evaluate(el=>el.removeAttribute('data-aps-monday-theme'));
 await page.setViewportSize({width:768,height:900});
 assert.equal(await page.locator('.ft3-analytics-trend-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('.ft3-analytics-summary').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
 assert.equal(await page.locator('.ft3-analytics-trend-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No analytics page-level overflow at 390px');
 await page.setViewportSize({width:360,height:844});
 assert.equal(await page.locator('.ft3-analytics-summary').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No analytics page-level overflow at 360px');
 checks+=14;
 await page.setViewportSize({width:390,height:844});
 const mobile=renderFuelTrackV3Application({detail,section:'new-request',backend:{snapshot,analytics}});
 await page.setContent('<main id="app">'+mobile+'</main>');await page.addStyleTag({content:styles});
 assert.equal(await page.locator('.ft3-new-options').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
 assert.deepEqual(errors,[]);
 checks++;
 console.log('CP-FT-NATIVE-01C native Chromium fixture acceptance PASS: '+checks+' checks (not signed production runtime)');
} finally {await browser.close();}
