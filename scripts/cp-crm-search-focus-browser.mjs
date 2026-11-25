import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {chromium,firefox,webkit} from 'playwright';

const frontend=resolve('frontend');
const css=await readFile('frontend/apsyntra-styles.bundle.css','utf8');
const markup='<div id="app"><button data-global-search-open>Search CRM</button><aside class="aps-sidebar"><nav aria-label="Primary"><a href="#/time-tracker" data-global-search-application="true">TimeTracker</a></nav><div class="workspace-switcher"></div><nav class="sidebar-recent-list"><a class="sidebar-recent-link" href="#/boards/test">Example board</a></nav></aside><main class="main-content"><button id="origin">Dashboard</button><input id="editor" aria-label="Document field"></main></div>';
const runtime=order=>`
let releaseBoards;
window.queries=[];window.selected=[];
window.scope={userId:'qa-user',workspaceId:'qa-workspace'};
async function setup(){
 const {startGlobalSearch}=await import('/global-search.js');
 window.controller=startGlobalSearch({getScope:()=>window.scope,
  getBoards:()=>new Promise(resolve=>{releaseBoards=()=>resolve([]);}),
  searchRecords:async query=>{window.queries.push(query);return [];},
  navigate:item=>window.selected.push(item)});
}
if('${order}'==='legacy-first'){await import('/monday-inspired-ui.js');await setup();}
else{await setup();await import('/monday-inspired-ui.js');}
window.releaseBoards=()=>releaseBoards?.();
window.ready=true;`;
const engines=process.env.SEARCH_FOCUS_BASELINE==='1'?[['chromium',chromium]]:[['chromium',chromium],['firefox',firefox],['webkit',webkit]];
for(const [engine,launcher] of engines){
 const browser=await launcher.launch({headless:true});
 try{
  for(const [platform,key] of [['MacIntel','Meta+k'],['Win32','Control+k'],['Linux x86_64','Control+k']]){
   for(const order of ['legacy-first','global-first']){
    const page=await browser.newPage();
    await page.addInitScript(platform=>{
     Object.defineProperty(navigator,'platform',{get:()=>platform});
     Object.defineProperty(navigator,'userAgentData',{get:()=>undefined});
    },platform);
    await page.route('**/*',async route=>{
     const url=new URL(route.request().url());
     if(url.origin!=='http://localhost')return route.abort();
     if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>'+css+'</style></head><body>'+markup+'<script type="module" src="/runtime.js"></script></body></html>'});
     if(url.pathname==='/runtime.js')return route.fulfill({contentType:'text/javascript',body:runtime(order)});
     const path=resolve(frontend,'.'+url.pathname);
     if(!path.startsWith(frontend+sep)||!path.endsWith('.js'))return route.abort();
     return route.fulfill({contentType:'text/javascript',body:await readFile(path,'utf8')});
    });
    await page.goto('http://localhost');await page.waitForFunction(()=>window.ready);
    const input=page.locator('.aps-global-search-input');
    await page.locator('#origin').focus();
    await page.keyboard.press(key);
    const focused=await page.evaluate(()=>document.activeElement?.className);
    assert.equal(focused,'aps-global-search-input',engine+' '+platform+' '+order+' shortcut focus; got '+focused);
    // Type immediately, before the outstanding board request resolves.
    await page.keyboard.type('TimeTracker');
    assert.equal(await input.inputValue(),'TimeTracker');
    await page.evaluate(()=>window.releaseBoards());
    await page.waitForFunction(()=>window.queries.includes('timetracker'));
    assert.equal(await input.evaluate(el=>el===document.activeElement),true);
    await page.getByRole('button',{name:'Close search'}).focus();
    await page.keyboard.press(key);
    assert.equal(await input.evaluate(el=>el===document.activeElement),true);
    assert.equal(await input.inputValue(),'TimeTracker');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#origin').evaluate(el=>el===document.activeElement),true);
    const sidebar=page.locator('#aps-sidebar-board-search');
    await sidebar.fill('Example');await sidebar.focus();
    await page.keyboard.press(key);
    assert.equal(await input.evaluate(el=>el===document.activeElement),true);
    await page.keyboard.type('TimeTracker');
    await page.evaluate(()=>window.releaseBoards());
    await page.waitForFunction(()=>/\d+ results/.test(document.querySelector('.aps-global-search-status').textContent));
    const application=page.getByRole('option').filter({has:page.locator('.aps-global-search-option-title').getByText('TimeTracker',{exact:true})}).first();
    const index=Number(await application.getAttribute('data-result-index'));
    for(let i=0;i<=index;i++)await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>window.selected.at(-1)?.href),'#/time-tracker');
    assert.equal(await sidebar.inputValue(),'Example');
    // Existing form-editing and modal shortcut exclusions remain in force.
    await page.locator('#editor').focus();
    await page.keyboard.press(key);
    assert.equal(await page.locator('#editor').evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.locator('.aps-global-search-backdrop').isVisible(),false);
    await page.locator('#origin').focus();
    await page.keyboard.press(platform==='MacIntel'?'Control+k':'Meta+k');
    assert.equal(await page.locator('.aps-global-search-backdrop').isVisible(),false);
    console.log('PASS',engine,platform,order,'immediate typing, refocus, Escape, sidebar, navigation, editor guard');
    await page.close();
   }
  }
 }finally{await browser.close();}
}
