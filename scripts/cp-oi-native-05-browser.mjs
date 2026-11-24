import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createServer as createVite} from 'vite';
import {chromium} from 'playwright';

// Isolated production renderer and drag binder; signed disposable API proxy.
export async function verifyLifecycleBrowser({auth,api,workspace,rowId}){
 const html=`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"><body><div id="app"><main class="main aps-order-intake-shell"><div class="main-content" id="host"></div></main></div><dialog id="editor"></dialog><script type="module">
import {OrderIntakeRegistryClient} from '/frontend/order-intake-registry-client.js';
import {renderOrderIntake} from '/frontend/order-intake-ui.js';
import {parseOrderIntakeRoute} from '/frontend/order-intake-route.js';
import {saveLifecycle,lifecycleFields,bindWorkflowDrag} from '/frontend/order-intake-lifecycle.js';
const auth={isSignedIn:true,userId:'fixture',authorized:async(path,options)=>{const res=await fetch(path,options);const data=await res.json();if(!res.ok)throw Error(data.message);return data;}};
const client=new OrderIntakeRegistryClient({auth,api:{rpc:(name,body)=>auth.authorized('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})},workspaceId:${JSON.stringify(workspace)}});
const id=${JSON.stringify(rowId)},host=document.querySelector('#host'),dialog=document.querySelector('#editor');
let row,activity,section='workflow',busy=false;
async function render(){row=await client.detail(id,{includeArchived:true});activity=await client.activity(id);const route=parseOrderIntakeRoute('#/order-intake/'+section+(section==='workflow'?'':'/record/'+id));host.innerHTML=renderOrderIntake({route,snapshot:{rows:[row],hasMore:false},record:section==='workflow'?null:{row,activity}});}
function open(action,target){if(busy)return;dialog.innerHTML='<form>'+lifecycleFields(row,action,target)+'<button type="submit">Confirm</button><button type="button">Cancel</button><p role="alert"></p></form>';dialog.showModal();dialog.querySelector('button[type=button]').onclick=()=>dialog.close();dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();busy=true;try{await saveLifecycle({client,row,action,target:new FormData(e.target).get('status')});section=action==='archive'?'archived':action==='restore'?'all-orders':section;dialog.close();await render();}catch(error){dialog.querySelector('[role=alert]').textContent=error.message;}finally{busy=false;}};}
bindWorkflowDrag(host,{enabled:()=>section==='workflow'&&!busy,findRow:key=>key===id?row:null,onDrop:(_,target)=>open('status',target)});
host.addEventListener('click',event=>{const action=event.target.closest('[data-oi-action]')?.dataset.oiAction;if(['status','archive','restore'].includes(action)){open(action);return;}if(event.target.closest('a[href*="/record/"]')){event.preventDefault();section='all-orders';void render();}});
void render();
</script></body></html>`;
 const vite=await createVite({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
 const server=createServer((req,res)=>{if(req.url==='/__lifecycle'){res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(html);return;}vite.middlewares(req,res,()=>{res.writeHead(404);res.end();});});
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(10000);
  const errors=[];let writes=0;page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/rest/v1/**',async route=>{const url=new URL(route.request().url());try{
   const result=url.pathname.includes('/rpc/')?await api.rpc(url.pathname.split('/').at(-1),route.request().postDataJSON()):await auth.authorized(url.pathname+url.search);
   if(url.pathname.includes('/rpc/'))writes++;
   await route.fulfill({json:result});
  }catch(error){await route.fulfill({status:error.status||500,json:{message:error.message}});}});
  await page.goto('http://127.0.0.1:'+server.address().port+'/__lifecycle');
  const card=page.locator('[data-oi-drag="'+rowId+'"]');
  await card.waitFor();
  // Drag via actual browser drag events; keep target within the scrollable board.
  await card.dragTo(page.locator('[data-oi-stage="Processed"]'));
  await page.getByLabel('New status').waitFor();
  assert.equal(await page.getByLabel('New status').inputValue(),'Processed');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(writes,0);
  await page.getByRole('button',{name:'Change status',exact:true}).focus();
  await page.keyboard.press('Enter');await page.getByLabel('New status').selectOption('Delayed');
  await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await page.locator('[data-oi-stage="Delayed"] [data-oi-drag="'+rowId+'"]').waitFor();
  await page.locator('[data-oi-drag="'+rowId+'"] a').click();
  await page.getByRole('button',{name:'Archive order',exact:true}).click();
  await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await page.getByRole('button',{name:'Restore order',exact:true}).waitFor();
  await page.getByRole('button',{name:'Restore order',exact:true}).click();
  await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await page.getByText('RESTORED',{exact:true}).waitFor();
  assert.equal(writes,3);
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  assert.deepEqual(errors,[]);
  console.log('PASS: signed Chromium drag target and cancel, keyboard status, archive, restore, activity, 3 writes, mobile, zero page errors');
 }finally{await browser?.close();await vite.close();await new Promise(resolve=>server.close(resolve));}
}
