// Repository-hosted static asset + Chromium fixture; no real credentials or production traffic.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
import {fixture,workspaceId,userId,boardId} from './fixtures/cp-ms-crm-03-fixture.mjs';
const cwd=process.cwd();
const html='<!doctype html><html lang="en" data-aps-monday-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"><link rel="stylesheet" href="/frontend/apps/MaterialSourcing/native-screen.css"></head><body><div id="app"><div class="shell"><aside class="aps-sidebar"><nav><a href="#/overview">Overview</a></nav></aside><main class="main aps-board-shell"><header class="topbar"><div class="breadcrumb"><strong>Material Request Hub</strong></div></header><div class="main-content"></div></main></div></div></body></html>';
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  const path=decodeURIComponent(new URL(req.url,'http://fixture.invalid').pathname);
  if(path==='/'){res.writeHead(200,{'content-type':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; style-src-attr 'none'; img-src 'self' data:; connect-src 'self'; object-src 'none'"});res.end(html);return;}
  const file=resolve(cwd,'.'+path);
  if(!file.startsWith(cwd+sep)||!mime[extname(file)])throw Error('invalid path');
  res.writeHead(200,{'content-type':mime[extname(file)]});res.end(await readFile(file));
 }catch{if(!res.headersSent)res.writeHead(404);res.end();}
});
let browser;
const results=[];
const check=(condition,name)=>{assert.ok(condition,name);results.push(name);console.log('PASS '+name);};
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[],foreign=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin+'/')&&!r.url().startsWith('data:'))foreign.push(r.url());});
 await page.goto(origin+'/#/boards/'+boardId+'/sourcing');
 await page.evaluate(async({detail,workspaceId,userId,boardId})=>{
  const native=await import('/frontend/apps/MaterialSourcing/native-screen.js');
  const host=document.querySelector('.main-content');
  let active=true,deny=false,delay=null,reads=0;
  const auth={isSignedIn:true,userId,getVerifiedUser:async()=>({id:auth.userId})};
  const api={context:async()=>({user_id:userId,workspace_id:workspaceId,profile:{status:'active'}}),
   allowed:async()=>!deny,rpc:async(name,args)=>{
    if(name!=='mrh_sourcing_board_viewer_read'||args.p_board_id!==boardId)throw Error('wrong signed read');
    reads++;if(delay)await delay.promise;
    return {'Buying Price':{value:123.45,revision:1},'Currency':{value:'USD',revision:1},'Vendor Details':{value:'<synthetic vendor>',revision:1},'Selling Price (VAT-EX)':{value:190,revision:2}};
   }};
  const render=(filters={},options={})=>{host.innerHTML=native.renderNativeMaterialSourcing(detail,filters,new Date('2026-11-27T12:00:00Z'),{workspaceId,canCreate:true,...options});};
  host.addEventListener('click',e=>{
   const button=e.target.closest('button[data-action]');if(!button)return;
   if(button.dataset.action==='mrh-native-sort')native.sortNativeMaterials(button);
   if(button.dataset.action==='mrh-native-commercial')void native.loadNativeCommercialRow(button,{api,auth,workspaceId,boardId,isCurrent:()=>active&&auth.isSignedIn&&auth.userId===userId});
   if(button.dataset.action==='mrh-add-view')render({}, {view:'add'});
   if(button.dataset.action==='mrh-show-items')render();
  });
  window.msFixture={render,deny:()=>{deny=true;},allow:()=>{deny=false;},reads:()=>reads,
   delay:()=>{let resolve;const promise=new Promise(r=>resolve=r);delay={promise,resolve};},release:()=>{delay.resolve();delay=null;},
   leave:()=>{active=false;host.innerHTML='<h1>Overview</h1>';},return:()=>{active=true;render();}};
  render();
 },{detail:fixture(),workspaceId,userId,boardId});
 const rows=page.locator('tr[data-ms-item]');
 check(await rows.count()===3,'native projection displays all three synthetic UUID records');
 check(await page.locator('thead th[data-ms-col]').count()===24,'24 reference columns');
 check(await page.evaluate(()=>window.msFixture.reads())===0,'no commercial calls on initial render');
 await page.getByRole('button',{name:'Sort by Part number',exact:true}).click();
 check((await rows.first().innerText()).includes('SYNTHETIC-A'),'public sorting works');
 const first=rows.first(),load=first.getByRole('button',{name:/Load commercial values/});
 await load.click();await first.getByText('Stored values loaded').waitFor();
 check(await first.locator('[data-ms-commercial="buyingPrice"]').textContent()==='123.45','existing signed reader populates selected row');
 check(await first.locator('[data-ms-commercial="vendor"]').textContent()==='<synthetic vendor>','commercial text is inert');
 check(await rows.nth(1).locator('[data-ms-commercial="buyingPrice"]').textContent()==='—','other row remains unloaded');
 check(await first.locator('[data-ms-col="totalLanded"]').textContent()==='—','derived values never fabricated');
 await page.evaluate(()=>window.msFixture.deny());await load.click();await first.getByText('Commercial values unavailable. Retry.').waitFor();
 check(await first.locator('[data-ms-commercial="buyingPrice"]').textContent()==='—','failed reload clears previously displayed value');
 await page.evaluate(()=>{window.msFixture.allow();window.msFixture.delay();});
 await load.click();await page.waitForFunction(()=>window.msFixture.reads()===2);
 await page.evaluate(()=>{window.msFixture.leave();window.msFixture.release();});
 await page.getByRole('heading',{name:'Overview'}).waitFor();
 check(await page.locator('.ms-native-sourcing').count()===0,'navigation discards delayed read and row');
 await page.evaluate(()=>window.msFixture.return());
 check(await rows.first().locator('[data-ms-commercial="buyingPrice"]').textContent()==='—','return does not cache commercial data');
 await page.getByRole('button',{name:/Add Material/}).click();
 check(await page.locator('#mrh-add-material-form').isVisible(),'existing add form reachable');
 await page.getByRole('button',{name:/All items/i}).click();
 check(await rows.count()===3,'existing return to list');
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:900});
  const layout=await page.evaluate(()=>{const host=document.querySelector('.ms-native-sourcing'),scroller=host.querySelector('.ms-native-table-scroll');return {host:host.getBoundingClientRect().width,scroll:scroller.scrollWidth,client:scroller.clientWidth,document:document.documentElement.scrollWidth,viewport:innerWidth};});
  check(layout.host<=width&&layout.scroll>layout.client&&layout.document<=width+1,'contained horizontal scroll at '+width+'px');
 }
 const before=await page.locator('.ms-native-metric').first().evaluate(n=>getComputedStyle(n).backgroundColor);
 await page.evaluate(()=>document.documentElement.dataset.apsMondayTheme='dark');
 const after=await page.locator('.ms-native-metric').first().evaluate(n=>getComputedStyle(n).backgroundColor);
 check(before!==after,'CRM dark theme applied');
 check(await page.evaluate(()=>document.documentElement.dataset.apsMondayTheme)==='dark','screen does not replace CRM theme');
 assert.deepEqual(errors,[]);assert.deepEqual(foreign,[]);
 console.log('CP_MS_CRM_03_BROWSER_PASS '+results.length+' checks; no uncaught errors or external traffic');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
