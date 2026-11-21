/** Isolated static-host acceptance. Does not authenticate, charge, or create bookings. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';

const prefix='/APSYNTRACRM/';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer((request,response)=>{
 const pathname=new URL(request.url,'http://127.0.0.1').pathname;
 if(!pathname.startsWith(prefix)){response.writeHead(404);response.end();return;}
 const suffix=pathname.slice(prefix.length);
 if(suffix.includes('..')){response.writeHead(400);response.end();return;}
 const path=resolve(suffix.endsWith('/')||!suffix?suffix+'index.html':suffix);
 const resolved=existsSync(path)&&statSync(path).isFile()?path:resolve('404.html');
 const data=readFileSync(resolved);
 response.writeHead(resolved.endsWith('/404.html')?404:200,{'content-type':mime[extname(resolved)]||'application/octet-stream','cache-control':'no-store'});
 response.end(data);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const base=`http://127.0.0.1:${port}${prefix}`;
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[],crmBundles=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('/frontend/app.js'))crmBundles.push(request.url())});
  await page.route('**/functions/v1/pdl-guest-api/v1/availability?**',async route=>{
    const request=new URL(route.request().url());
    await route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},json:{
      source:'server',courtId:request.searchParams.get('courtId'),date:request.searchParams.get('date'),
      durationMinutes:Number(request.searchParams.get('durationMinutes')),
      slots:[{startMinute:360,status:'available'},{startMinute:390,status:'unavailable'},{startMinute:1380,status:'available'}],
    }});
  });
  await page.goto(base+'paseo/book?court=court-1');
  await page.getByRole('button',{name:'11:00 PM, server available'}).waitFor({timeout:15000});
  assert.equal(new URL(page.url()).pathname,prefix+'paseo/book');
  assert.equal(await page.locator('.slot-button').count(),3);
  await page.reload();
  await page.getByRole('button',{name:'6:00 AM, server available'}).waitFor();
  await page.getByRole('button',{name:'11:00 PM, server available'}).click();
  assert.match(await page.locator('.immersive-booking-summary').innerText(),/11:00 PM – 12:00 AM/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  assert.deepEqual(errors,[]);
  assert.deepEqual(crmBundles,[]);
  console.log(`PASS public guest direct link, refresh, server slots, CRM isolation at ${width}px`);
  await page.close();
 }
 const admin=await browser.newPage();
 await admin.goto(base+'paseo/admin');
 await admin.getByRole('heading',{name:/Administrator sign-in/i}).waitFor({timeout:15000});
 assert.deepEqual(await admin.locator('.admin-metrics').count(),0);
 console.log('PASS public admin route redirects to existing backend sign-in');
 await admin.close();
 const receipt=await browser.newPage();
 const fakeId='a1b2c3d4e5f6';
 const fakeAccess='TEST_ONLY_FAKE_RECEIPT_ACCESS_TOKEN_123456789';
 let capturedToken='';
 await receipt.route('**/v1/guest-reservations/'+fakeId+'/receipt',async route=>{
  capturedToken=route.request().headers().authorization||'';
  await route.fulfill({status:401,json:{error:'invalid_token'}});
 });
 await receipt.goto(base+'paseo/reservation/receipt/'+fakeId+'#access='+fakeAccess);
 await receipt.getByText('The reservation receipt could not be retrieved.').waitFor({timeout:15000});
 assert.equal(new URL(receipt.url()).pathname,prefix+'paseo/reservation/receipt/'+fakeId);
 assert.equal(new URL(receipt.url()).hash,'#access='+fakeAccess);
 assert.equal(capturedToken,'Bearer '+fakeAccess);
 await receipt.close();
 console.log('PASS private receipt fragment preserved through Pages deep link without CRM session');
 const crm=await browser.newPage();
 await crm.goto(base+'#/paseo');
 await crm.locator('.aps-auth-v2').waitFor({timeout:16000});
 assert.equal(await crm.getByRole('heading',{name:'Paseo de Lomboy'}).count(),0);
 console.log('PASS unsigned CRM hash route remains on CRM login');
 await crm.close();
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
