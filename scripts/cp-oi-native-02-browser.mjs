import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as createVite } from 'vite';
import { chromium } from 'playwright';

// Isolated renderer + real route/read-state modules with nonproduction fixtures.
const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"></head>
<body><div id="app"><main class="main aps-order-intake-shell"><div class="main-content" id="host"></div></main></div><script type="module">
import {parseOrderIntakeRoute,orderIntakeHref} from '/frontend/order-intake-route.js';
import {createOrderIntakeReadState} from '/frontend/order-intake-read-state.js';
import {renderOrderIntake} from '/frontend/order-intake-ui.js';
const row={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',po_number:'TEST-001',client_name:'Pump & Co',company:'Fixture',account_manager:'Sales',industry:'Water',date_received:'2026-11-20',fiscal_year:2026,status:'Working on it',currency:'PHP',po_amount:'100.00',procurement_expenses:'5.00',gross_profit:'84.29'};
const other={...row,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',po_number:'TEST-002',status:'Collected',currency:'USD'};
const host=document.querySelector('#host');
let route=parseOrderIntakeRoute(location.hash);
window.readCalls=[];
const state=createOrderIntakeReadState({isCurrent:()=>true,onChange:render,clientFor:()=>({list:async({offset})=>{window.readCalls.push(offset);return offset?{items:[other],hasMore:false}:{items:[row],hasMore:true}}})});
function render(){host.innerHTML=renderOrderIntake({route,snapshot:state.read('fixture'),record:route.recordId?{row:route.recordId===row.id?row:other}:null});}
window.addEventListener('hashchange',()=>{route=parseOrderIntakeRoute(location.hash);render();void state.open('fixture')});
host.addEventListener('click',e=>{const action=e.target.closest('[data-oi-action]')?.dataset.oiAction;if(action==='more')void state.more('fixture');if(action==='refresh')void state.refresh('fixture')});
host.addEventListener('submit',e=>{e.preventDefault();location.hash=orderIntakeHref(route.section,Object.fromEntries(new FormData(e.target)))});
void state.open('fixture');
</script></body></html>`;
const vite=await createVite({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
const server=createServer((req,res)=>{
 if(req.url==='/__oi'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}
 vite.middlewares(req,res,()=>{res.writeHead(404);res.end();});
});
let browser;
const checks=[];
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.setDefaultTimeout(6000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/__oi#/order-intake');
 await page.getByText('1 matching of 1 loaded orders',{exact:false}).waitFor();
 assert.equal(await page.locator('.oi-tabs a[aria-current="page"]').innerText(),'Dashboard');checks.push('dashboard renders');
 await page.getByRole('link',{name:'Workflow',exact:true}).click();
 await page.locator('.oi-workflow').waitFor();assert.equal(await page.locator('.oi-stage').count(),14);checks.push('workflow stages');
 await page.getByRole('link',{name:'Search',exact:true}).click();
 await page.getByRole('link',{name:'Search',exact:true}).and(page.locator('[aria-current=page]')).waitFor();
 await page.getByLabel('PO number, client or account manager').fill('not present');
 await page.getByRole('button',{name:'Apply filters'}).click();
 await page.getByText('0 matching of 1 loaded orders',{exact:false}).waitFor();
 await page.getByRole('link',{name:'Clear',exact:true}).click();
 await page.getByText('1 matching of 1 loaded orders',{exact:false}).waitFor();checks.push('filters and clear');
 await page.getByRole('link',{name:'All Orders',exact:true}).click();
 await page.getByRole('link',{name:'All Orders',exact:true}).and(page.locator('[aria-current=page]')).waitFor();
 await page.getByRole('button',{name:'Load more orders'}).click();
 await page.getByText('2 matching of 2 loaded orders',{exact:false}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.readCalls),[0,1]);checks.push('shared read and pagination');
 await page.getByRole('link',{name:'TEST-002',exact:true}).click();
 await page.getByRole('heading',{name:'Purchase order details'}).waitFor();
 await page.getByRole('link',{name:'Close details'}).click();checks.push('record deep link');
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByText('1 matching of 1 loaded orders',{exact:false}).waitFor();checks.push('refresh');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  assert.ok(await page.locator('.oi-table-scroll').evaluate(el=>el.scrollWidth>=el.clientWidth));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 }
 checks.push('desktop and mobile contained overflow');
 assert.deepEqual(errors,[]);checks.push('no page errors');
 console.log(JSON.stringify({status:'PASS',scope:'synthetic isolated renderer; not signed production',checks},null,2));
}finally{await browser?.close();await vite.close();await new Promise(resolve=>server.close(resolve));}
