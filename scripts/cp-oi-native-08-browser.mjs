import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createServer as createVite} from 'vite';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Isolated signed UI harness using real production document modules.
export async function verifyDocumentsBrowser({actor,reader,row,entry,imageBytes}){
 const html=`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"><body><main><form id="upload"></form><div id="registry"></div><p role="status" id="result"></p></main><script type="module">
 import {OrderIntakeDocuments,prepareOrderDocument} from '/frontend/order-intake-documents.js';
 import {documentUploadFields,documentRegistryMarkup,downloadDocument} from '/frontend/order-intake-documents-ui.js';
 import {OrderIntakeOperationalClient} from '/frontend/order-intake-operational-client.js';
 const row=${JSON.stringify(row)},form=document.querySelector('#upload'),host=document.querySelector('#registry'),status=document.querySelector('#result');
 const auth={isSignedIn:true,userId:'fixture',authorized:async(path,options)=>{const r=await fetch(path,options);const data=await r.json();if(!r.ok)throw Error(data.message);return data;}};
 const docs=new OrderIntakeDocuments(new OrderIntakeOperationalClient({auth,api:{rpc:(name,body)=>auth.authorized('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})},workspaceId:row.workspace_id}));
 let rows=[];
 async function render(){const page=await docs.list({row});rows=page.rows;host.innerHTML=documentRegistryMarkup({row,rows,coverage:await docs.coverage(),hasMore:page.hasMore});}
 form.innerHTML=documentUploadFields(row)+'<button type="submit">Upload document</button>';
 form.onsubmit=async event=>{event.preventDefault();try{const fd=new FormData(form),file=fd.get('document');await docs.save(row,fd.get('category'),await prepareOrderDocument(file,file.name),crypto.randomUUID());await render();status.textContent='Stored';}catch(e){status.textContent=e.message;}};
 host.addEventListener('click',async event=>{const b=event.target.closest('[data-oi-document-download],[data-oi-document-preview]');if(!b)return;
 try{const d=rows.find(x=>x.id===(b.dataset.oiDocumentDownload||b.dataset.oiDocumentPreview));const blob=await docs.read(d);
 if(b.dataset.oiDocumentDownload)downloadDocument(blob,d.filename);
 else{const target=b.closest('li').querySelector('[data-oi-document-thumbnail]'),img=document.createElement('img'),url=URL.createObjectURL(blob);img.alt='Verified thumbnail';img.className='oi-document-thumbnail';img.onload=()=>URL.revokeObjectURL(url);target.replaceChildren(img);img.src=url;}
 }catch(e){status.textContent=e.message;}});
 void render();
 </script></body></html>`;
 const vite=await createVite({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
 const server=createServer((req,res)=>{if(req.url==='/__documents'){res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(html);return;}vite.middlewares(req,res,()=>{res.writeHead(404);res.end();});});
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true});
  const errors=[];
  async function open(signed){
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(12000);
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/rest/v1/**',async route=>{const url=new URL(route.request().url());try{
    const data=url.pathname.includes('/rpc/')?await signed.api.rpc(url.pathname.split('/').at(-1),route.request().postDataJSON()):await signed.auth.authorized(url.pathname+url.search);
    await route.fulfill({json:data});
   }catch(e){await route.fulfill({status:e.status||500,json:{message:e.message}});}});
   await page.goto('http://127.0.0.1:'+server.address().port+'/__documents');return page;
  }
  const writer=await open(actor);
  await writer.getByLabel('Document type').selectOption('supporting');
  await writer.locator('input[type=file]').setInputFiles({name:'browser-proof.png',mimeType:'image/png',buffer:imageBytes});
  await writer.getByRole('button',{name:'Upload document',exact:true}).click();
  await writer.getByText('Stored',{exact:true}).waitFor();
  const viewer=await open(reader);
  const picture=viewer.locator('.oi-document-list li').filter({hasText:'browser-proof.png'});
  await picture.getByRole('button',{name:'Thumbnail'}).click();
  await picture.getByRole('img',{name:'Verified thumbnail'}).waitFor();
  await viewer.waitForFunction(()=>document.querySelector('.oi-document-thumbnail')?.naturalWidth>0);
  const promise=viewer.waitForEvent('download');
  await viewer.locator('.oi-document-list li').filter({hasText:entry.filename}).getByRole('button',{name:'Download'}).click();
  const downloaded=await promise;
  assert.equal(createHash('sha256').update(await readFile(await downloaded.path())).digest('hex'),entry.sha256);
  await downloaded.delete();
  assert.ok(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);
  console.log('PASS: signed Chromium direct upload, second-session image thumbnail and exact PDF re-download, mobile, zero page errors');
 }finally{await browser?.close();await vite.close();await new Promise(resolve=>server.close(resolve));}
}
