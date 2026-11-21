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
 browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
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
 // Test-only signed admin HTTP fixtures. Never forward a synthetic cancellation
 // to the live backend, change real rates, or claim a refund was issued.
 const lifecycle=await browser.newPage({viewport:{width:390,height:900}});
 const adminErrors=[]; const calls=[];
 lifecycle.on('pageerror',error=>adminErrors.push(error.message));
 await lifecycle.addInitScript(()=>sessionStorage.setItem('pdl-booking-admin-access-token','SYNTHETIC_TEST_ONLY'));
 const idA='11111111-1111-4111-8111-111111111111';
 const idB='22222222-2222-4222-8222-222222222222';
 let cancelled=false;
 const booking=(id,name,version=1)=>({
   id,court_code:'court-1',reservation_date:'2026-11-23',start_minute:480,duration_minutes:60,
   amount_minor:50000,full_name:name,email:'synthetic@example.test',phone:'09171234567',
   payment_method:'gcash',booking_status:cancelled&&id===idA?'cancelled':'pending_verification',
   payment_status:'submitted',version:cancelled&&id===idA?2:version,created_at:'2026-11-21T12:00:00Z',
 });
 await lifecycle.route('**/functions/v1/pdl-guest-api/v1/admin/**',async route=>{
   const req=route.request();const url=new URL(req.url());const path=url.pathname;
   calls.push({method:req.method(),path});
   const send=(value,status=200)=>route.fulfill({status,json:value});
   if(path.endsWith('/v1/admin/session'))return send({authenticated:true});
   if(path.endsWith('/v1/admin/courts'))return send({courts:[
    {courtId:'court-1',name:'Court 1',enabled:false,openMinute:480,closeMinute:1320,rates:[]},
   ]});
   if(path.endsWith('/v1/admin/reservations/page')){
    if(url.searchParams.has('beforeId'))return send({reservations:[booking(idB,'Synthetic Second')],nextCursor:null});
    return send({reservations:[booking(idA,'Synthetic First')],nextCursor:
      {beforeCreatedAt:'2026-11-21T12:00:00Z',beforeId:idA}});
   }
   if(path.endsWith(`/v1/admin/reservations/${idA}/cancel`)){
    cancelled=true;return send({updated:true,bookingStatus:'cancelled',paymentStatus:'submitted',version:2,refundStatus:'not_processed'});
   }
   return send({error:'fixture_missing_route'},404);
 });
 await lifecycle.route('**/functions/v1/pdl-guest-api/v1/payment-methods',async route=>
   route.fulfill({status:200,json:{methods:[]}}));
 lifecycle.on('dialog',dialog=>{void dialog.accept()});
 await lifecycle.goto(base+'paseo/admin/live-reservations');
 await lifecycle.getByText('Synthetic First').first().waitFor({timeout:15000});
 await lifecycle.getByRole('button',{name:'Load more reservations'}).click();
 await lifecycle.getByText('Synthetic Second').first().waitFor({timeout:15000});
 assert.equal(await lifecycle.locator('.staging-reservation-card').count(),2);
 await lifecycle.getByRole('button',{name:'Cancel booking (no automatic refund)'}).first().click();
 await lifecycle.getByText(/Booking cancelled\. Payment status is unchanged/).waitFor({timeout:15000});
 assert.equal(cancelled,true);
 assert.ok(calls.some(item=>item.method==='POST'&&item.path.endsWith('/cancel')));
 assert.deepEqual(adminErrors,[]);
 console.log('PASS isolated admin cursor pages, cancellation confirmation, unchanged payment status and recovery');
 await lifecycle.close();
 const crm=await browser.newPage();
 await crm.goto(base+'#/paseo');
 await crm.locator('.aps-auth-v2').waitFor({timeout:16000});
 assert.equal(await crm.getByRole('heading',{name:'Paseo de Lomboy'}).count(),0);
 console.log('PASS unsigned CRM hash route remains on CRM login');
 await crm.close();
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
