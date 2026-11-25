import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {chromium} from 'playwright';
import {BOARD_MODULES} from '../frontend/board/services/manifest.js';
import {WORK_MANAGEMENT_APPLICATIONS} from '../frontend/workspace-application-ownership.js';
import {WORK_MANAGEMENT_WORKSPACE_ID} from '../frontend/workspace-identity.js';
import {workspaceApplicationsForNavigation} from '../frontend/workspace-application-routing.js';

const board={id:'10000000-0000-4000-8000-000000000001',name:'TimeTracker',status:'active'};
const applications=workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID,
 WORK_MANAGEMENT_APPLICATIONS.filter(x=>x.boardId).map(x=>({id:x.boardId})));
const source=await readFile('frontend/app.js','utf8');
assert.match(source,/active\(application.navigationKey\),\{application:true\}/);
assert.match(source,/application\?' data-global-search-application="true"'/);
const css=await readFile('frontend/apsyntra-styles.bundle.css','utf8');
const frontend=resolve('frontend');
const markup='<div id="app"><aside class="aps-sidebar"><nav><a href="#/overview">Overview</a>'+
 applications.map(a=>'<a data-global-search-application="true" href="'+a.href+'">'+a.label+'</a>').join('')+
 '<a href="#/boards/'+board.id+'">TimeTracker</a></nav></aside><main class="main-content"><a href="#/time-tracker">TimeTracker</a></main></div>';
const runtime=`import {startGlobalSearch} from '/global-search.js';
window.selected=[];
window.controller=startGlobalSearch({
 getScope:()=>({userId:'test-user',workspaceId:'test-workspace'}),
 getBoards:async()=>[${JSON.stringify(board)}],
 searchRecords:async query=>query==='timetracker'?[{board_id:'${board.id}',board_name:'TimeTracker',item_id:'test-record',item_title:'TimeTracker',group_title:'Test'}, {native:true,id:'session',title:'TimeTracker',href:'#/time-tracker/attendance/qa',recordType:'Attendance session',score:0}]:[],
 navigate:item=>window.selected.push(item)
});`;
function contrast(fg,bg){
 const luminance=color=>{
  const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 };
 const a=luminance(fg),b=luminance(bg);
 return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
const browser=await chromium.launch({headless:true});
try{
 for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width:theme==='light'?1366:390,height:844}});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!=='http://localhost')return route.abort();
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html data-aps-monday-theme="'+theme+'"><head><style>'+css+'</style></head><body>'+markup+'<script type="module" src="/runtime.js"></script></body></html>'});
   if(url.pathname==='/runtime.js')return route.fulfill({contentType:'text/javascript',body:runtime});
   const path=resolve(frontend,'.'+url.pathname);
   if(!path.startsWith(frontend+sep)||!path.endsWith('.js'))return route.abort();
   return route.fulfill({contentType:'text/javascript',body:await readFile(path,'utf8')});
  });
  await page.goto('http://localhost');await page.waitForFunction(()=>!!window.controller);
  await page.evaluate(()=>window.controller.open());
  const input=page.getByRole('combobox');
  const options=page.getByRole('option');
  const kind=row=>row.locator('.aps-global-search-option-kind');
  assert.ok(await page.locator('.aps-global-search-option-kind.is-application').count()>0);
  for(const app of applications){
   await input.fill(app.label);
   await page.waitForFunction(()=>/\d+ results/.test(document.querySelector('.aps-global-search-status').textContent));
   const row=options.filter({has:page.locator('.aps-global-search-option-title').getByText(app.label,{exact:true})}).filter({has:page.locator('.is-application')});
   assert.ok(await row.count()>0,app.label);
  }
  for(const module of BOARD_MODULES){
   await input.fill(module.name);
   await page.waitForFunction(()=>/\d+ results/.test(document.querySelector('.aps-global-search-status').textContent));
   const row=options.filter({has:page.locator('.aps-global-search-option-title').getByText(module.name,{exact:true})}).filter({has:page.locator('.is-application')});
   assert.ok(await row.count()>0,module.name);
  }
  await input.fill('TimeTracker');
  await page.waitForFunction(()=>/\d+ results/.test(document.querySelector('.aps-global-search-status').textContent));
  const labels=await page.locator('.aps-global-search-option-kind').allTextContents();
  for(const label of ['Application','Board','Record','Attendance session'])assert.ok(labels.includes(label),label);
  const appRow=options.filter({has:page.locator('.aps-global-search-option-title').getByText('TimeTracker',{exact:true})}).filter({has:page.locator('.is-application')}).first();
  const colors=await kind(appRow).evaluate(el=>{const s=getComputedStyle(el);return [s.color,s.backgroundColor];});
  assert.ok(contrast(...colors)>=4.5);
  const bounds=await appRow.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.querySelector('.is-application').getBoundingClientRect();return b.left>=a.left&&b.right<=a.right;});
  assert.ok(bounds);
  const index=Number(await appRow.getAttribute('data-result-index'));
  for(let i=0;i<=index;i++)await input.press('ArrowDown');
  assert.equal(await appRow.getAttribute('aria-selected'),'true');
  await input.press('Enter');
  assert.equal(await page.evaluate(()=>window.selected.at(-1).href),'#/time-tracker');
  await page.evaluate(()=>window.controller.open());
  await input.fill('TimeTracker');await page.waitForFunction(()=>/\d+ results/.test(document.querySelector('.aps-global-search-status').textContent));
  await options.filter({has:page.getByText('Attendance session',{exact:true})}).filter({has:page.locator('.aps-global-search-option-kind')}).last().click();
  assert.equal(await page.evaluate(()=>window.selected.at(-1).type),'native-record');
  console.log('PASS',theme,applications.length,'application launch links;',BOARD_MODULES.length,'module titles; same-name record distinctions; keyboard and mouse navigation; label contrast',contrast(...colors).toFixed(2));
  await page.close();
 }
}finally{await browser.close()}
