import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createServer as createVite} from 'vite';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Isolated signed renderer and audit transport; no production credentials or orders.
export async function verifyConfirmationBrowser({auth,api,row}){
 const html=`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"><body><form id="form"></form><script type="module">
 import {confirmationFields,bindConfirmationForm,readConfirmationForm} from '/frontend/order-intake-confirmation-ui.js';
 import {buildConfirmation} from '/frontend/order-intake-confirmation.js';
 import {OrderIntakeOperationalClient} from '/frontend/order-intake-operational-client.js';
 const row=${JSON.stringify(row)},form=document.querySelector('#form');
 const auth={isSignedIn:true,userId:'fixture',authorized:async(path,options)=>{const r=await fetch(path,options);const data=await r.json();if(!r.ok)throw Error(data.message);return data;}};
 const client=new OrderIntakeOperationalClient({auth,api:{rpc:(name,body)=>auth.authorized('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})},workspaceId:row.workspace_id});
 form.innerHTML=confirmationFields(row)+'<button type="submit">Download PDF</button>';
 bindConfirmationForm(form,row);
 form.onsubmit=async event=>{event.preventDefault();try{
  const doc=buildConfirmation(row,readConfirmationForm(form,row));
  const engine=await import('/frontend/order-intake-confirmation-pdf.js');
  const blob=await engine.createConfirmationPdf(doc,await engine.loadConfirmationLogo(doc.entity));
  await client.recordConfirmation(doc,crypto.randomUUID(),await engine.confirmationDigest(blob));
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=engine.confirmationFilename(doc);link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
 }catch(error){document.querySelector('[data-oi-confirmation-summary]').textContent=error.message;}};
 </script></body></html>`;
 const vite=await createVite({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
 const server=createServer((req,res)=>{if(req.url==='/__confirmation'){res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(html);return;}vite.middlewares(req,res,()=>{res.writeHead(404);res.end();});});
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(12000);
  const errors=[];let audit;page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/rest/v1/**',async route=>{const url=new URL(route.request().url());try{
   const rpc=url.pathname.includes('/rpc/');if(rpc)audit=route.request().postDataJSON();
   const result=rpc?await api.rpc(url.pathname.split('/').at(-1),audit):await auth.authorized(url.pathname+url.search);
   await route.fulfill({json:result});
  }catch(error){await route.fulfill({status:error.status||500,json:{message:error.message}});}});
  await page.goto('http://127.0.0.1:'+server.address().port+'/__confirmation');
  await page.getByLabel('Description',{exact:true}).fill('Fixture equipment');
  await page.getByLabel('VAT-inclusive unit price').fill('56.00');await page.getByLabel('Quantity').fill('2');
  await page.getByLabel('Payment terms').fill('30 days');await page.getByLabel('Warranty terms').fill('12 months');
  await page.getByLabel('Signatory').selectOption('Alex P. Señagan');
  await page.getByText('Reconciled: PHP 112.00 · VAT 12.00').waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF'}).click();
  const file=await downloaded,bytes=await readFile(await file.path());
  assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.equal(createHash('sha256').update(bytes).digest('hex'),audit.p_sha256);
  await file.delete();assert.deepEqual(errors,[]);
  console.log('PASS: signed Chromium item form, exact total, real logo, PDF download hash equals audit receipt, mobile, zero page errors');
 }finally{await browser?.close();await vite.close();await new Promise(resolve=>server.close(resolve));}
}
