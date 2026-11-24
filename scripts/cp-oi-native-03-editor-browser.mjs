import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createServer as createVite} from 'vite';
import {chromium} from 'playwright';

// Real editor modules and signed disposable API, isolated from the CRM host.
export async function verifyOrderEditorBrowser({auth,api,workspace}) {
 const html=`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"><body><div id="app"><main id="host"></main></div><script type="module">
import {OrderIntakeRegistryClient} from '/frontend/order-intake-registry-client.js';
import {orderEditorDraft,orderEditorMarkup,updateOrderEditorPreview,createOrderEditorSave} from '/frontend/order-intake-editor.js';
const auth={isSignedIn:true,userId:'browser-fixture',authorized:async(path,options)=>{const r=await fetch(path,options);const data=await r.json();if(!r.ok)throw Object.assign(Error(data.message),{status:r.status});return data;}};
const api={rpc:(name,body)=>auth.authorized('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})};
const client=new OrderIntakeRegistryClient({auth,api,workspaceId:${JSON.stringify(workspace)}});
const host=document.querySelector('#host');
function open(row=null){
 const save=createOrderEditorSave({client,row});
 host.innerHTML='<section class="oi-editor-modal"><h1>'+ (row?'Edit purchase order':'New purchase order')+'</h1><form>'+orderEditorMarkup(orderEditorDraft(row))+'<button type="submit">Save</button></form></section>';
 const form=host.querySelector('form');updateOrderEditorPreview(form);
 form.addEventListener('input',()=>updateOrderEditorPreview(form));
 form.addEventListener('submit',async e=>{
  e.preventDefault();const button=form.querySelector('button');button.disabled=true;
  try{const result=await save(Object.fromEntries(new FormData(form)));host.innerHTML='<p role="status">Saved revision '+result.revision+'</p><button type="button">Edit</button>';host.querySelector('button').onclick=()=>open(result);}
  catch(error){form.querySelector('[data-oi-editor-error]').textContent=error.message;button.disabled=false;}
 });
}
open();
</script></body></html>`;
 const vite=await createVite({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
 const server=createServer((req,res)=>{
  if(req.url==='/__editor'){res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(html);return;}
  vite.middlewares(req,res,()=>{res.writeHead(404);res.end();});
 });
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.setDefaultTimeout(10000);
  let writes=0,createdId;const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/rest/v1/**',async route=>{
   const url=new URL(route.request().url());
   try{
    const name=url.pathname.split('/').at(-1);
    const result=url.pathname.includes('/rpc/')?await api.rpc(name,route.request().postDataJSON()):await auth.authorized(url.pathname+url.search);
    if(url.pathname.includes('/rpc/')){writes++;createdId=result.id;}
    await route.fulfill({json:result});
   }catch(error){await route.fulfill({status:error.status||500,json:{message:error.message}});}
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/__editor');
  await page.getByLabel('PO number',{exact:true}).fill('CP03-BROWSER-'+Date.now());
  for(const [label,value] of [['Client name','Browser client'],['Company','Fixture'],['Industry','Water'],['PO date','2026-11-24'],['Date received','2026-11-24'],['Delivery date','2026-12-01'],['PO amount (VAT-inclusive)','112.00'],['Procurement expenses','5.00']])await page.getByLabel(label,{exact:true}).fill(value);
  await page.getByText(/Gross profit: 95.00/).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByText('Saved revision 1').waitFor();
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByLabel('PO amount (VAT-inclusive)',{exact:true}).fill('224.00');
  await page.getByText(/Gross profit: 195.00/).waitFor();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByText('Saved revision 2').waitFor();
  assert.equal(writes,2);assert.ok(createdId);assert.deepEqual(errors,[]);
  console.log('PASS: signed Chromium editor create and edit, live VAT preview, mobile containment, exactly two writes, zero page errors');
 }finally{await browser?.close();await vite.close();await new Promise(resolve=>server.close(resolve));}
}
