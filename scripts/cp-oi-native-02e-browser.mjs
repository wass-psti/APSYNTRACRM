import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createServer as createVite} from 'vite';
import {chromium} from 'playwright';

// Synthetic only. Reuse real renderer, router and read state; no signed transport.
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"></head><body><main class="main aps-order-intake-shell"><div class="main-content" id="host"></div></main><script type="module">
import {parseOrderIntakeRoute,orderIntakeHref} from '/frontend/order-intake-route.js';
import {createOrderIntakeReadState} from '/frontend/order-intake-read-state.js';
import {renderOrderIntake} from '/frontend/order-intake-ui.js';
import {createUnifiedOrderIntakeReader} from '/frontend/order-intake-unified-read.js';
const base={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',workspace_id:'fixture',po_number:'PO-1',company:'Fixture',date_received:'2026-01-02',fiscal_year:2026,currency:'PHP',po_amount:'100.00',procurement_expenses:'5.00',gross_profit:'84.29',status:'Processed',archived:false};
const historical={...base,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',record_kind:'legacy',source_key:'monday:fixture:2',po_number:'PO-1',currency:'USD',po_amount:'12.345',gross_profit:'12.345',procurement_expenses:null,archived:null,status:'Please select'};
const unknown={...historical,id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',source_key:'monday:fixture:3',po_number:'PO-UNKNOWN',currency:null,po_amount:'200',date_received:null};
const reader=createUnifiedOrderIntakeReader({workspaceId:'fixture',nativeRows:[base],legacyRows:[historical,unknown]});
const host=document.querySelector('#host');
let route=parseOrderIntakeRoute(location.hash),record=null;
const state=createOrderIntakeReadState({isCurrent:()=>true,onChange:render,clientFor:()=>reader});
function render(){host.innerHTML=renderOrderIntake({route,snapshot:state.read('fixture'),record});}
async function navigate(){route=parseOrderIntakeRoute(location.hash);record=route.recordId?{row:await reader.detail(route.recordId)}:null;render();await state.open('fixture');}
window.addEventListener('hashchange',()=>void navigate());
host.addEventListener('submit',e=>{e.preventDefault();location.hash=orderIntakeHref(route.section,Object.fromEntries(new FormData(e.target)));});
host.addEventListener('click',e=>{if(e.target.closest('[data-oi-action=refresh]'))void state.refresh('fixture');});
void navigate();
</script></body></html>`;
const vite=await createVite({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
const server=createServer((req,res)=>{
 if(req.url==='/__oi'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}
 vite.middlewares(req,res,()=>{res.writeHead(404);res.end();});
});
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.setDefaultTimeout(6000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/__oi#/order-intake');
 await page.getByText('3 matching of 3 loaded orders',{exact:false}).waitFor();
 await page.getByRole('heading',{name:'Historical source figures (not CRM VAT-derived)'}).waitFor();
 await page.getByText('USD reported order value: USD 12.345 (1 of 1 records)',{exact:true}).waitFor();
 assert.ok(await page.getByText('Expenses PHP 5.00 · Gross profit PHP 84.29').isVisible());
 await page.getByRole('link',{name:'Workflow',exact:true}).click();
 await page.locator('.oi-stage').filter({hasText:'Please select'}).waitFor();
 await page.getByRole('link',{name:'Search',exact:true}).click();
 await page.locator('.oi-tabs a[aria-current=page]',{hasText:'Search'}).waitFor();
 await page.locator('select[name=currency]').selectOption('Unknown currency');
 await page.getByRole('button',{name:'Apply filters'}).click();
 await page.getByText('1 matching of 3 loaded orders',{exact:false}).waitFor();
 await page.getByRole('link',{name:'PO-UNKNOWN',exact:true}).click();
 await page.getByText('Historical record — original reported financial values',{exact:false}).waitFor();
 await page.getByRole('link',{name:'Close details'}).click();
 await page.getByRole('heading',{name:'Purchase order details'}).waitFor({state:'detached'});
 await page.getByRole('link',{name:'Clear',exact:true}).click();
 await page.getByText('3 matching of 3 loaded orders',{exact:false}).waitFor();
 assert.equal(await page.getByRole('link',{name:'PO-1',exact:true}).count(),2);
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByText('3 matching of 3 loaded orders',{exact:false}).waitFor();
 await page.setViewportSize({width:390,height:900});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 assert.deepEqual(errors,[]);
 console.log('PASS: mixed dashboard, exact legacy amount, separate native profit, workflow, unknown currency search, legacy detail, repeated PO, refresh, mobile overflow, no page errors (synthetic browser)');
}finally{await browser?.close();await vite.close();await new Promise(resolve=>server.close(resolve));}
