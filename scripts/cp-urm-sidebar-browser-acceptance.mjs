import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const executablePath=process.env.CHROMIUM_PATH||
 (process.platform==='darwin'?'/Applications/Chromium.app/Contents/MacOS/Chromium':chromium.executablePath());
const browser=await chromium.launch({headless:true,executablePath});
try{
 const page=await browser.newPage();
 const makeSidebar=(admin=true)=>
  '<aside class="aps-sidebar">'+
  '<div class="workspace-switcher">Work Management</div>'+
  '<div class="side-section sidebar-nav-section">Workspace</div>'+
  '<div class="sidebar-recent-heading">Boards</div>'+
  '<nav aria-label="Primary">'+
  '<a class="nav-link" href="#/overview"><span class="nav-label">Overview</span></a>'+
  '<a class="nav-link" href="#/boards">My boards</a>'+
  '<a class="nav-link" href="#/time-tracker">TimeTracker</a>'+
  '<a class="nav-link" href="#/fund-tracker">Fund Tracker</a>'+
  '<a class="nav-link" href="#/fueltrack">FuelTrack+</a>'+
  '<a class="nav-link" href="#/tradelink">TradeLink</a>'+
  '<a class="nav-link" href="#/boards/11111111-1111-4111-8111-111111111111">Material Request Hub</a>'+
  (admin?'<div class="side-section sidebar-nav-section">Administration</div>'+
   '<a class="nav-link" href="#/role-configuration">Role Configuration</a>'+
   '<a class="nav-link" href="#/user-role-management">User Role Management</a>':'')+
  '<a class="nav-link" href="#/settings">Settings</a></nav>'+
  '<nav class="sidebar-recent-list"><a class="sidebar-recent-link" href="#/boards/22222222-2222-4222-8222-222222222222">Existing Board</a></nav>'+
  '</aside>';
 await page.setContent('<div id="app"><div class="shell">'+makeSidebar()+'</div></div>');
 await page.addScriptTag({path:'frontend/monday-inspired-ui.js'});
 const expected=['#/overview','#/boards','#/time-tracker','#/fund-tracker','#/fueltrack','#/tradelink',
  '#/boards/11111111-1111-4111-8111-111111111111','#/role-configuration','#/user-role-management','#/settings'];
 await page.waitForFunction(()=>document.querySelector('.aps-board-search-v3 input')!==null);
 let actual=await page.locator('.aps-sidebar nav[aria-label="Primary"] a').evaluateAll(
  nodes=>nodes.map(node=>node.getAttribute('href')));
 assert.deepEqual(actual,expected);
 assert.equal(await page.locator('nav[aria-label="Primary"] a[href="#/overview"]').innerText(),'Dashboard');
 await page.evaluate(markup=>{document.querySelector('.aps-sidebar').outerHTML=markup;},makeSidebar());
 await page.waitForFunction(()=>document.querySelector('.aps-board-search-v3 input')!==null);
 actual=await page.locator('.aps-sidebar nav[aria-label="Primary"] a').evaluateAll(
  nodes=>nodes.map(node=>node.getAttribute('href')));
 assert.deepEqual(actual,expected);
 await page.evaluate(markup=>{document.querySelector('.aps-sidebar').outerHTML=markup;},makeSidebar(false));
 await page.waitForFunction(()=>document.querySelector('.aps-board-search-v3 input')!==null);
 assert.equal(await page.locator('.aps-sidebar a[href="#/role-configuration"]').count(),0);
 assert.equal(await page.locator('.aps-sidebar a[href="#/user-role-management"]').count(),0);
 assert.equal(await page.locator('.aps-sidebar a[href="#/tradelink"]').count(),1);
 console.log('CP_URM_SIDEBAR_SIGNED_HOST_PRESENTATION_BROWSER_PASS');
}finally{await browser.close();}
