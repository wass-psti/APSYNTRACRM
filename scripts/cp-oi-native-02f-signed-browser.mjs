import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createServer as createVite} from 'vite';
import {chromium} from 'playwright';

// Private loopback-only harness, real signed API reads proxied by Playwright.
// Never embeds a business dataset or auth token in static assets.
export async function verifySignedRegistryBrowser({workspaceId,signedAuth}) {
 const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"></head><body><main class="main aps-order-intake-shell"><div class="main-content" id="host"></div></main><script type="module">
import {OrderIntakeRegistryClient} from '/frontend/order-intake-registry-client.js';
import {parseOrderIntakeRoute,orderIntakeHref} from '/frontend/order-intake-route.js';
import {createOrderIntakeReadState,filterOrderIntakeRows} from '/frontend/order-intake-read-state.js';
import {orderTablePage,orderExportCsv} from '/frontend/order-intake-search.js';
import {renderOrderIntake} from '/frontend/order-intake-ui.js';
const auth={isSignedIn:true,userId:'disposable-browser',authorized:async path=>{const response=await fetch(path);if(!response.ok)throw Error('Read failed');return response.json();}};
const client=new OrderIntakeRegistryClient({auth,api:{},workspaceId:${JSON.stringify(workspaceId)}});
const host=document.querySelector('#host');
let route=parseOrderIntakeRoute(location.hash),record=null,run=0;
const state=createOrderIntakeReadState({isCurrent:()=>true,onChange:render,clientFor:()=>client});
const tableState={page:0,selected:new Set(),results:[],busy:false};
function render(){host.innerHTML=renderOrderIntake({route,snapshot:state.read('fixture'),record,tableState});}
async function navigate(){const current=++run;route=parseOrderIntakeRoute(location.hash);tableState.page=0;tableState.selected.clear();record=route.recordId?{busy:true}:null;render();if(route.recordId){try{const row=await client.detail(route.recordId);if(current===run)record={row};}catch(error){if(current===run)record={error:error.message};}if(current===run)render();}await state.open('fixture',true);}
window.addEventListener('hashchange',()=>void navigate());
host.addEventListener('submit',e=>{e.preventDefault();location.hash=orderIntakeHref(route.section,Object.fromEntries(new FormData(e.target)));});
host.addEventListener('click',e=>{const action=e.target.closest('[data-oi-action]')?.dataset.oiAction;if(action==='more')void state.more('fixture');if(action==='refresh')void state.refresh('fixture',true);const matching=filterOrderIntakeRows(state.read('fixture')?.rows||[],route.filters);if(action==='next-page'){tableState.page++;render();}if(action==='select-page'){for(const row of orderTablePage(matching,tableState.page).rows)tableState.selected.add(row.id);render();}if(action==='export'){const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([orderExportCsv(matching)],{type:'text/csv'}));link.download='orders.csv';link.click();}});
void navigate();
</script></body></html>`;
 const vite=await createVite({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
 const server=createServer((req,res)=>{
  if(req.url==='/__oi'){res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(html);return;}
  vite.middlewares(req,res,()=>{res.writeHead(404);res.end();});
 });
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.setDefaultTimeout(10000);
  const errors=[];let requests=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/rest/v1/order_intake_registry?*',async route=>{
   const url=new URL(route.request().url());requests++;
   try{const rows=await signedAuth.authorized(url.pathname+url.search);await route.fulfill({json:rows});}
   catch(error){await route.fulfill({status:error.status||500,json:{error:'Registry request failed'}});}
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/__oi#/order-intake');
  await page.getByText('910 matching of 910 loaded orders',{exact:false}).waitFor();
  assert.equal(requests,10);
  await page.getByText('All available registry pages retrieved.',{exact:false}).waitFor();
  await page.getByRole('link',{name:'All Orders',exact:true}).click();
  await page.locator('.oi-tabs a[aria-current=page]',{hasText:'All Orders'}).waitFor();
  assert.equal(await page.locator('.oi-table-scroll tbody tr').count(),25);
  await page.getByRole('button',{name:'Select page',exact:true}).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('button',{name:'Select page',exact:true}).click();
  await page.getByText('50 selected · 910 matching',{exact:true}).waitFor();
  await page.getByRole('link',{name:'Dashboard',exact:true}).click();
  await page.locator('.oi-table-scroll[aria-label="historical financial totals"] tbody tr').filter({has:page.getByRole('rowheader',{name:'USD',exact:true})}).locator('td').first().getByText('USD 185352.889',{exact:false}).waitFor();
  await page.getByText('Monthly orders by date received',{exact:true}).waitFor();
  assert.equal(requests,10);
  await page.locator('select[name=year]').selectOption('2026');
  await page.getByRole('button',{name:'Apply filters'}).click();
  await page.getByText('166 matching of 910 loaded orders',{exact:false}).waitFor();
  await page.getByRole('link',{name:'Clear',exact:true}).click();
  await page.getByText('910 matching of 910 loaded orders',{exact:false}).waitFor();
  assert.equal(requests,10);
  await page.getByRole('link',{name:'Workflow',exact:true}).click();
  await page.locator('.oi-stage').filter({hasText:'Please select'}).waitFor();
  await page.getByRole('link',{name:'Search',exact:true}).click();
  await page.locator('.oi-tabs a[aria-current=page]',{hasText:'Search'}).waitFor();
  await page.locator('select[name=currency]').selectOption('Unknown currency');
  await page.getByRole('button',{name:'Apply filters'}).click();
  await page.getByText('728 matching of 910 loaded orders',{exact:false}).waitFor();
  assert.equal(requests,10);
  await page.locator('.oi-table-scroll tbody tr a').first().click();
  await page.getByText('Historical record — original reported financial values',{exact:false}).waitFor();
  assert.equal(requests,11);
  await page.getByRole('link',{name:'Close details'}).click();
  await page.getByRole('heading',{name:'Purchase order details'}).waitFor({state:'detached'});
  await page.getByRole('link',{name:'Clear',exact:true}).click();
  await page.getByText('910 matching of 910 loaded orders',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.getByText('910 matching of 910 loaded orders',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Export matching CSV',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-oi-action="export"]').disabled);
  assert.equal(requests,21);
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export matching CSV',exact:true}).click();
  const download=await downloadPromise;
  const {readFile}=await import('node:fs/promises');
  const csv=await readFile(await download.path(),'utf8');
  assert.ok(csv.includes('source_key'));assert.ok(csv.includes('record_kind'));
  await download.delete();
  await page.setViewportSize({width:390,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  assert.deepEqual(errors,[]);
  console.log('PASS: signed browser complete search/dashboard, 910 rows, 10 page reads, fiscal filter, 25-row pagination, 50 selected across pages, CSV export, no repeat tab reads, refresh, mobile, zero page errors');
 }finally{await browser?.close();await vite.close();await new Promise(resolve=>server.close(resolve));}
}
