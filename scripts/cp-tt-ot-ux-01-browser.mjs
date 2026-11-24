import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {renderTimeTrackerOvertime} from '../frontend/time-tracker-overtime.js';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const now=new Date('2026-11-02T08:00:00Z');
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/frontend/apsyntra-styles.bundle.css'){
  res.writeHead(200,{'content-type':'text/css'});
  res.end(readFileSync(resolve(root,'frontend/apsyntra-styles.bundle.css')));
  return;
 }
 if(url.pathname==='/frontend/time-tracker-overtime.js'){
  res.writeHead(200,{'content-type':'text/javascript'});
  res.end(readFileSync(resolve(root,'frontend/time-tracker-overtime.js')));
  return;
 }
 if(url.pathname==='/frontend/time-tracker-duration-format.js'){
  res.writeHead(200,{'content-type':'text/javascript'});
  res.end(readFileSync(resolve(root,'frontend/time-tracker-duration-format.js')));
  return;
 }
 if(url.pathname==='/frontend/time-tracker-time-format.js'){
  res.writeHead(200,{'content-type':'text/javascript'});
  res.end(readFileSync(resolve(root,'frontend/time-tracker-time-format.js')));
  return;
 }
 const active=url.searchParams.get('inactive')!=='1';
 const markup=renderTimeTrackerOvertime({
  access:{bootstrapApprover:false,otContractActive:active},
  modalOpen:true,now
 });
 const html='<!doctype html><html><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css">'+
  '<style>html,body{margin:0;min-height:100%;font-family:Inter,system-ui,sans-serif}body{background:#f2f5fb}#app .aps-board-shell{min-height:100vh;padding:20px;box-sizing:border-box}#app .aps-board-shell .tt-native{max-width:100%;min-width:0}</style>'+
  '</head><body><div id="app"><main class="aps-board-shell"><div class="tt-native">'+markup+'</div></main></div>'+
  '<script type="module">import {updateTimeTrackerOvertimePreview} from "/frontend/time-tracker-overtime.js";const form=document.querySelector("#tt-ot-form");form?.addEventListener("input",()=>updateTimeTrackerOvertimePreview(form));</script>'+
  '</body></html>';
 res.writeHead(200,{'content-type':'text/html'});
 res.end(html);
});
await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
const address=server.address();
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto('http://127.0.0.1:'+address.port+'/',{waitUntil:'networkidle'});
 const dialog=page.getByRole('dialog',{name:'Submit overtime request'});
 await dialog.waitFor({state:'visible'});
 const desktop=await dialog.boundingBox();
 assert.ok(desktop&&desktop.width<=680.5,'desktop dialog must stay within the 680px design width');
 assert.equal(await page.locator('#tt-ot-start').getAttribute('type'),'time');
 assert.equal(await page.locator('#tt-ot-end').getAttribute('type'),'time');
 assert.equal(await page.locator('#tt-ot-date').getAttribute('min'),'2026-10-03');
 assert.equal(await page.locator('#tt-ot-date').getAttribute('max'),'2026-11-09');
 await page.locator('#tt-ot-start').fill('18:00');
 await page.locator('#tt-ot-end').fill('20:00');
 assert.equal(await page.locator('[data-tt-ot-duration-value]').textContent(),'2 hr 00 min');
 assert.equal(await page.locator('[data-tt-ot-duration-progress]').getAttribute('value'),'120');
 await page.locator('#tt-ot-reason').fill('Emergency maintenance work');
 assert.equal(await page.locator('[data-tt-ot-reason-count]').textContent(),'26 / 500');
 await page.locator('#tt-ot-end').fill('18:15');
 assert.match(await page.locator('#tt-ot-end').evaluate(node=>node.validationMessage),/30 minutes and 6 hours/);
 await page.locator('#tt-ot-end').fill('20:00');
 await page.locator('#tt-ot-reason').fill('Short');
 assert.match(await page.locator('#tt-ot-reason').evaluate(node=>node.validationMessage),/at least 10 characters/);
 await page.locator('#tt-ot-reason').fill('Emergency maintenance work');
 assert.equal(await page.locator('#tt-ot-reason').evaluate(node=>node.validationMessage),'');
 await page.setViewportSize({width:390,height:844});
 const mobile=await dialog.boundingBox();
 assert.ok(mobile&&mobile.x>=0&&mobile.width<=390,'mobile dialog must fit the viewport');
 assert.equal(await page.locator('.tt-ot-modal-footer button').count(),2);
 const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
 assert.equal(mobileOverflow,false,'mobile dialog must not cause horizontal page overflow');
 await page.locator('html').evaluate(node=>node.setAttribute('data-aps-monday-theme','dark'));
 const darkStyles=await dialog.evaluate(node=>({
  background:getComputedStyle(node).backgroundColor,
  text:getComputedStyle(node).color,
  heading:getComputedStyle(node.querySelector('h3')).color,
  inputBackground:getComputedStyle(node.querySelector('input')).backgroundColor,
  inputText:getComputedStyle(node.querySelector('input')).color,
  reasonBackground:getComputedStyle(node.querySelector('textarea')).backgroundColor,
  gateBackground:getComputedStyle(node.querySelector('.tt-ot-gate')).backgroundColor,
  gateText:getComputedStyle(node.querySelector('.tt-ot-gate')).color
 }));
 assert.notEqual(darkStyles.background,'rgb(255, 255, 255)');
 assert.equal(darkStyles.text,'rgb(239, 239, 241)');
 assert.equal(darkStyles.inputText,'rgb(239, 239, 241)');
 assert.notEqual(darkStyles.gateBackground,'rgba(0, 0, 0, 0)');
 await page.goto('http://127.0.0.1:'+address.port+'/?inactive=1',{waitUntil:'networkidle'});
 assert.equal(await page.getByRole('button',{name:'Submit OT request'}).isDisabled(),true);
 assert.match(await page.locator('.tt-ot-gate').textContent(),/temporarily unavailable/);
 assert.deepEqual(errors,[]);
 console.log('PASS: desktop dimensions, native time controls, live duration, range/reason validation, character counter, mobile layout, dark theme, inactive contract messaging, zero page errors');
}finally{
 await browser.close();
 await new Promise(resolveClose=>server.close(resolveClose));
}
