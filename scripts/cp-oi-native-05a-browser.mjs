import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createServer as createVite} from 'vite';
import {chromium} from 'playwright';

// Real renderer/client modules; isolated two-account browser harness, not CRM host.
export async function verifyOperationalBrowser({actor,recipient,row}){
 const html=`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"><body><div id="app"><main class="main aps-order-intake-shell"><div class="main-content" id="host"></div></main></div><dialog id="dialog"></dialog><script type="module">
import {OrderIntakeOperationalClient} from '/frontend/order-intake-operational-client.js';
import {recipientFields,notificationInbox} from '/frontend/order-intake-notifications.js';
import {renderOrderIntake} from '/frontend/order-intake-ui.js';
import {parseOrderIntakeRoute} from '/frontend/order-intake-route.js';
import {lifecycleFields,saveLifecycle} from '/frontend/order-intake-lifecycle.js';
const params=new URLSearchParams(location.search),uid=params.get('actor'),mode=params.get('mode');
const auth={isSignedIn:true,userId:uid,authorized:async(path,options)=>{const res=await fetch(path,options);const data=await res.json();if(!res.ok)throw Error(data.message);return data;}};
const client=new OrderIntakeOperationalClient({auth,api:{rpc:(name,body)=>auth.authorized('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})},workspaceId:${JSON.stringify(row.workspace_id)}});
const id=${JSON.stringify(row.id)},host=document.querySelector('#host'),dialog=document.querySelector('#dialog');
let record;
async function render(){
 if(mode==='inbox'){host.innerHTML=notificationInbox(await client.notifications());return;}
 record=await client.detail(id,{includeArchived:true});
 const activity=await client.operationalActivity(record);
 host.innerHTML=renderOrderIntake({route:parseOrderIntakeRoute('#/order-intake/all-orders/record/'+id),snapshot:{rows:[record],hasMore:false},record:{row:record,activity}});
}
function form(fields,submit,label){
 dialog.innerHTML='<form>'+fields+'<button type="submit">'+label+'</button><p role="alert"></p></form>';dialog.showModal();
 dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await submit(new FormData(e.target));dialog.close();await render();}catch(err){dialog.querySelector('[role=alert]').textContent=err.message;button.disabled=false;}};
}
host.addEventListener('click',async e=>{
 const action=e.target.closest('[data-oi-action]')?.dataset.oiAction;
 if(action==='recipient'){form(recipientFields(await client.recipientOptions(record)),fd=>client.bindRecipient(record,fd.get('recipient')),'Confirm recipient');}
 if(action==='status'){form(lifecycleFields(record,'status'),fd=>saveLifecycle({client,row:record,action:'status',target:fd.get('status')}),'Save status');}
 const button=e.target.closest('[data-oi-notification-read]');
 if(button){await client.markNotificationRead(button.dataset.oiNotificationRead);await render();}
});
void render();
</script></body></html>`;
 const vite=await createVite({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
 const server=createServer((req,res)=>{if(req.url.startsWith('/__operational?')){res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(html);return;}vite.middlewares(req,res,()=>{res.writeHead(404);res.end();});});
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true});
  const errors=[];let writes=0;
  async function pageFor(signed,mode){
   const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();page.setDefaultTimeout(10000);
   page.on('pageerror',err=>errors.push(err.message));
   await page.route('**/rest/v1/**',async route=>{const url=new URL(route.request().url());try{
    const rpc=url.pathname.includes('/rpc/');
    const result=rpc?await signed.api.rpc(url.pathname.split('/').at(-1),route.request().postDataJSON()):await signed.auth.authorized(url.pathname+url.search);
    if(rpc&&!url.pathname.endsWith('recipient_options'))writes++;
    await route.fulfill({json:result});
   }catch(error){await route.fulfill({status:error.status||500,json:{message:error.message}});}});
   await page.goto('http://127.0.0.1:'+server.address().port+'/__operational?'+new URLSearchParams({actor:signed.auth.userId,mode}));return page;
  }
  const editor=await pageFor(actor,'editor');
  await editor.getByRole('button',{name:'Notification recipient',exact:true}).click();
  await editor.getByLabel('Notification recipient').selectOption(recipient.auth.userId);
  await editor.getByRole('button',{name:'Confirm recipient',exact:true}).click();
  await editor.locator('dialog').waitFor({state:'hidden'});
  await editor.getByRole('button',{name:'Change status',exact:true}).click();
  await editor.getByLabel('New status').selectOption('Collected');
  await editor.getByRole('button',{name:'Save status',exact:true}).click();
  await editor.getByText('Notification available in recipient inbox.',{exact:true}).first().waitFor();
  const inbox=await pageFor(recipient,'inbox');
  const message=inbox.locator('.oi-activity li').filter({hasText:row.po_number+' · Collected'});
  await message.waitFor();await message.getByRole('button',{name:'Mark as read'}).click();
  await message.getByText('Read',{exact:true}).waitFor();
  await inbox.reload();await message.getByText('Read',{exact:true}).waitFor();
  assert.equal(writes,3);assert.deepEqual(errors,[]);
  assert.ok(await inbox.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  console.log('PASS: two signed Chromium contexts, historical recipient confirmation/status change, inbox delivery and persisted read acknowledgement, three writes, mobile, zero page errors');
 }finally{await browser?.close();await vite.close();await new Promise(resolve=>server.close(resolve));}
}
