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
 await admin.route('**/functions/v1/pdl-guest-api/v1/admin/session',async route=>
   route.fulfill({status:401,json:{error:'missing_session'}}));
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
 // Large-queue and uncertain-write recovery use only synthetic HTTP fixtures.
 const stress=await browser.newPage({viewport:{width:768,height:900}});
 const stressErrors=[];
 stress.on('pageerror',error=>stressErrors.push(error.message));
 await stress.addInitScript(()=>sessionStorage.setItem('pdl-booking-admin-access-token','SYNTHETIC_TEST_ONLY'));
 const rows=Array.from({length:125},(_,i)=>({
   id:`${String(i+1).padStart(8,'0')}-1111-4111-8111-111111111111`,
   court_code:'court-1',reservation_date:'2026-11-23',start_minute:480,duration_minutes:60,
   amount_minor:50000,full_name:`Queue Synthetic ${String(i).padStart(3,'0')}`,
   email:'synthetic@example.test',phone:'09171234567',payment_method:'gcash',
   booking_status:'pending_verification',payment_status:'submitted',version:1,
   created_at:new Date(Date.UTC(2026,10,21,12,0,0)-i*1000).toISOString(),
 }));
 let uncertain=false;
 let failReadback=false;
 await stress.route('**/functions/v1/pdl-guest-api/v1/admin/**',async route=>{
   const request=route.request();const url=new URL(request.url());const path=url.pathname;
   const send=(json,status=200)=>route.fulfill({status,json});
   if(path.endsWith('/v1/admin/session'))return send({authenticated:true});
   if(path.endsWith('/v1/admin/courts'))return send({courts:[]});
   if(path.endsWith('/v1/admin/reservations/page')){
     if(failReadback)return send({error:'synthetic_unavailable'},503);
     const before=url.searchParams.get('beforeId');
     const index=before?rows.findIndex(item=>item.id===before)+1:0;
     const page=rows.slice(index,index+25);
     const last=page.at(-1);
     // A concurrent page boundary may overlap with the already-rendered card.
     if(index>0)page.unshift(rows[index-1]);
     return send({reservations:page,nextCursor:index+25<rows.length?
       {beforeCreatedAt:last.created_at,beforeId:last.id}:null});
   }
   if(path.endsWith(`/v1/admin/reservations/${rows[0].id}/cancel`)){
     uncertain=true;
     failReadback=true;
     return send({error:'synthetic_gateway_timeout'},504);
   }
   return send({error:'synthetic_missing_route'},404);
 });
 await stress.route('**/functions/v1/pdl-guest-api/v1/payment-methods',async route=>
   route.fulfill({status:200,json:{methods:[]}}));
 stress.on('dialog',dialog=>{void dialog.accept()});
 await stress.goto(base+'paseo/admin/live-reservations');
 await stress.getByText('Queue Synthetic 000').first().waitFor({timeout:15000});
 for(let i=1;i<5;i++){
   await stress.getByRole('button',{name:'Load more reservations'}).click();
   await stress.locator('.staging-reservation-card').nth(i*25).waitFor({timeout:15000});
 }
 assert.equal(await stress.locator('.staging-reservation-card').count(),125);
 assert.equal(await stress.getByRole('button',{name:'Load more reservations'}).count(),0);
 console.log('PASS five cursor pages show 125 distinct reservations without truncated results');
 await stress.getByRole('button',{name:'Cancel booking (no automatic refund)'}).first().click();
 await stress.getByText(/Readback failed\. Do not retry cancellation/).waitFor({timeout:15000});
 assert.equal(uncertain,true);
 assert.equal(await stress.locator('.staging-reservation-card').count(),125);
 failReadback=false;
 await stress.getByRole('button',{name:'Refresh',exact:true}).click();
 await stress.getByText('Queue Synthetic 000').first().waitFor({timeout:15000});
 assert.equal(await stress.locator('.staging-reservation-card').count(),25);
 assert.deepEqual(stressErrors,[]);
 console.log('PASS failed cancellation and failed readback warn against blind retries; refresh recovers');
 await stress.close();
 // All seven administration routes must mount their real modules, not redirect.
 const modules=await browser.newPage({viewport:{width:900,height:950}});
 const moduleErrors=[];
 modules.on('pageerror',error=>moduleErrors.push(error.message));
 await modules.addInitScript(()=>sessionStorage.setItem('pdl-booking-admin-access-token','SYNTHETIC_TEST_ONLY'));
 const courtState={courtId:'court-1',name:'Court 1',enabled:false,openMinute:480,closeMinute:1320,rates:[]};
 const policyState={reservationLeadHours:0,arrivalGraceMinutes:15,publicNotice:''};
 const calendarState={weekdays:[],blocks:[]};
 const bookingState={
   id:'33333333-3333-4333-8333-333333333333',court_code:'court-1',
   reservation_date:'2026-11-23',start_minute:480,duration_minutes:60,
   amount_minor:50000,full_name:'Acceptance Customer',email:'acceptance@example.test',
   phone:'09171234567',payment_method:'gcash',booking_status:'pending_verification',
   payment_status:'submitted',version:1,created_at:'2026-11-21T12:00:00Z',
 };
 const methods=[{method:'gcash',recipient:'Test Recipient',imageUrl:null},
   {method:'maya',recipient:'Other Recipient',imageUrl:null},
   {method:'bpi',recipient:'Third Recipient',imageUrl:null}];
 const writeCalls=[];
 let persistWrites=true;
 await modules.route('**/functions/v1/pdl-guest-api/v1/admin/**',async route=>{
   const request=route.request();
   const path=new URL(request.url()).pathname;
   const send=(json,status=200)=>route.fulfill({status,json});
   if(path.endsWith('/v1/admin/session'))return send({authenticated:true});
   if(request.method()!=='GET')writeCalls.push(path);
   if(path.endsWith('/v1/admin/courts'))return send({courts:[courtState]});
   if(path.endsWith('/v1/admin/courts/court-1')&&request.method()==='PUT'){
     if(persistWrites)Object.assign(courtState,request.postDataJSON());
     return send({updated:true});
   }
   if(path.endsWith('/v1/admin/rates/court-1/60')&&request.method()==='PUT'){
     const rate=request.postDataJSON();
     if(persistWrites)courtState.rates=[{durationMinutes:60,...rate}];
     return send({updated:true});
   }
   if(path.endsWith('/v1/admin/reservations/page'))return send({reservations:[bookingState],nextCursor:null});
   if(path.endsWith('/v1/admin/reservations/'+bookingState.id+'/verification')){
     const body=request.postDataJSON();
     if(body.expectedVersion!==bookingState.version)return send({error:'verification_conflict'},409);
     bookingState.payment_status=body.decision;
     bookingState.booking_status=body.decision==='verified'?'confirmed':'rejected';
     bookingState.version++;return send({updated:true});
   }
   if(path.endsWith('/v1/admin/calendar')&&request.method()==='GET')return send(calendarState);
   if(path.includes('/v1/admin/calendar/')&&path.includes('/weekdays/')&&request.method()==='PUT'){
     const data=request.postDataJSON();
     if(persistWrites)calendarState.weekdays=[{courtId:'court-1',weekday:1,...data}];
     return send({updated:true});
   }
   if(path.endsWith('/v1/admin/calendar/maintenance')&&request.method()==='POST'){
     if(persistWrites)calendarState.blocks=[{id:'44444444-4444-4444-8444-444444444444',...request.postDataJSON()}];
     return send({created:true,id:'44444444-4444-4444-8444-444444444444'});
   }
   if(path.endsWith('/v1/admin/calendar/maintenance/44444444-4444-4444-8444-444444444444')&&request.method()==='DELETE'){
     if(persistWrites)calendarState.blocks=[];
     return send({removed:true});
   }
   if(path.endsWith('/v1/admin/policies')){
     if(request.method()==='PUT'){
       if(persistWrites)Object.assign(policyState,request.postDataJSON());
       return send({updated:true});
     }
     return send(policyState);
   }
   if(path.endsWith('/v1/admin/payment-methods/gcash')&&request.method()==='PUT'){
     const form=request.postData();
     assert.ok(form?.includes('Acceptance Recipient') || form?.includes('Different Recipient'));
     if(persistWrites)methods[0]={...methods[0],recipient:'Acceptance Recipient',
       imageUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YseMZkAAAAASUVORK5CYII='};
     return send({updated:true});
   }
   return send({error:'missing_fixture'},404);
 });
 await modules.route('**/functions/v1/pdl-guest-api/v1/payment-methods',async route=>
   route.fulfill({status:200,json:{methods}}));
 const routes=[
   ['courts','Court schedule'],['calendar','Weekly operating hours'],
   ['bookings','Booking queue'],['pricing','Server-authoritative booking rate'],
   ['payments','Admin-managed QR payment settings'],['customers','Customer directory.'],
   ['settings','Save operational policies'],
 ];
 for(const [route,label] of routes){
   await modules.goto(base+'paseo/admin/'+route);
   await modules.getByText(label,{exact:true}).first().waitFor({timeout:15000});
   assert.equal(new URL(modules.url()).pathname,prefix+'paseo/admin/'+route);
   await modules.reload();
   await modules.getByText(label,{exact:true}).first().waitFor({timeout:15000});
   assert.equal(new URL(modules.url()).pathname,prefix+'paseo/admin/'+route);
 }
 await modules.getByRole('link',{name:'Court settings'}).click();
 await modules.getByText('Court schedule',{exact:true}).waitFor();
 await modules.getByRole('link',{name:'Court calendar'}).click();
 await modules.getByText('Weekly operating hours',{exact:true}).waitFor();
 await modules.goBack();
 await modules.getByText('Court schedule',{exact:true}).waitFor();
 await modules.goForward();
 await modules.getByText('Weekly operating hours',{exact:true}).waitFor();
 // Stateful, isolated HTTP fixtures verify genuine UI save -> GET -> reload flows.
 await modules.goto(base+'paseo/admin/courts');
 await modules.locator('#pdl-open-minute').fill('540');
 await modules.getByRole('button',{name:'Save court configuration'}).click();
 await modules.getByText('Court settings saved in the dedicated Paseo Supabase schema.').waitFor();
 await modules.reload();
 await modules.waitForFunction(() => document.querySelector('#pdl-open-minute')?.value==='540');
 assert.equal(courtState.openMinute,540);
 console.log('PASS court configuration write and persisted fixture readback after refresh');

 await modules.goto(base+'paseo/admin/pricing');
 await modules.locator('#pdl-rate-amount').fill('500');
 await modules.getByRole('button',{name:'Save server rate'}).click();
 await modules.getByText('Rate saved. Enable the court and rate only after venue approval.').waitFor();
 await modules.reload();
 await modules.waitForFunction(() => document.querySelector('#pdl-rate-amount')?.value==='500.00');
 console.log('PASS rate configuration write and persisted fixture readback after refresh');

 await modules.goto(base+'paseo/admin/calendar');
 await modules.getByRole('combobox',{name:'Opening time'}).selectOption('540');
 await modules.getByRole('button',{name:'Save weekday schedule'}).click();
 await modules.getByText('Saved and confirmed by a fresh server read.').waitFor();
 await modules.reload();
 await modules.waitForFunction(() => document.querySelector('[aria-label=\"Opening time\"]')?.value==='540');
 await modules.getByRole('button',{name:'Add maintenance block'}).click();
 await modules.getByRole('button',{name:'Remove block'}).waitFor();
 await modules.reload();
 await modules.getByRole('button',{name:'Remove block'}).waitFor();
 await modules.getByRole('button',{name:'Remove block'}).click();
 await modules.getByText('No maintenance blocks stored for this court and date.').waitFor();
 console.log('PASS calendar weekday and maintenance create/read/delete persistence fixtures');

 await modules.goto(base+'paseo/admin/settings');
 await modules.locator('.fe08-settings-form input').first().fill('3');
 await modules.getByRole('button',{name:'Save operational policies'}).click();
 await modules.getByText('Policy saved and verified by server readback.').waitFor();
 await modules.reload();
 await modules.waitForFunction(() => document.querySelector('.fe08-settings-form input')?.value==='3');
 console.log('PASS operational policy write and persisted fixture readback after refresh');

 await modules.goto(base+'paseo/admin/bookings');
 await modules.getByText('Acceptance Customer',{exact:false}).first().waitFor();
 await modules.getByRole('button',{name:'Mark payment verified'}).click();
 await modules.getByText('Booking: confirmed',{exact:false}).waitFor();
 await modules.reload();
 await modules.getByText('Payment: verified',{exact:false}).waitFor();
 await modules.goto(base+'paseo/admin/customers');
 await modules.getByText('acceptance@example.test',{exact:true}).waitFor();
 console.log('PASS booking payment verification and customer projection persist across modules');

 await modules.goto(base+'paseo/admin/payments');
 await modules.locator('#admin-qr-recipient-gcash').fill('Acceptance Recipient');
 await modules.locator('#admin-qr-image-gcash').setInputFiles({
   name:'test-qr.png',mimeType:'image/png',
   buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YseMZkAAAAASUVORK5CYII=','base64'),
 });
 await modules.getByRole('button',{name:'Save GCash QR configuration'}).click();
 await modules.getByText('GCash QR image saved for this payment method.').waitFor();
 await modules.reload();
 await modules.waitForFunction(() => document.querySelector('#admin-qr-recipient-gcash')?.value==='Acceptance Recipient');
 assert.ok(writeCalls.some(path=>path.endsWith('/v1/admin/payment-methods/gcash')));
 console.log('PASS synthetic QR payment configuration upload and readback after refresh');
 // Broken saved URLs must never leak the browser's broken-image icon/alt text.
 await modules.locator('.managed-qr-preview').first().waitFor();
 await modules.getByText('QR image unavailable',{exact:true}).first().waitFor({timeout:15000});
 assert.equal(await modules.locator('.managed-qr-preview img').count(),0);
 assert.equal(await modules.locator('.managed-qr-preview .managed-qr-placeholder').count(),3);
 assert.equal(await modules.locator('.managed-qr-method').count(),3);
 for (const [width, columns] of [[1440,3],[768,2],[390,1]]) {
   await modules.setViewportSize({width,height:950});
   const count=await modules.locator('.managed-qr-grid').evaluate(el =>
     getComputedStyle(el).gridTemplateColumns.split(' ').length);
   assert.equal(count,columns,`QR payment cards at ${width}px`);
   assert.equal(await modules.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1),true,
     `No horizontal overflow at ${width}px`);
 }
 await modules.setViewportSize({width:900,height:950});
 console.log('PASS QR payment cards responsive at 390, 768 and 1440 without horizontal overflow');
 await modules.locator('#admin-qr-image-gcash').setInputFiles({
   name:'replacement-qr.png',mimeType:'image/png',
   buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YseMZkAAAAASUVORK5CYII=','base64'),
 });
 await modules.getByText('New image preview',{exact:true}).first().waitFor();
 await modules.getByText('Preview only — save to update the stored image.').first().waitFor();
 console.log('PASS saved QR broken-image fallback and replacement preview without raw alt text');


 // An HTTP 200 cannot certify a write if a subsequent GET retains old values.
 persistWrites=false;
 await modules.goto(base+'paseo/admin/courts');
 await modules.locator('#pdl-open-minute').fill('570');
 await modules.getByRole('button',{name:'Save court configuration'}).click();
 await modules.getByText(/Court save returned, but the stored configuration did not match/).waitFor();
 await modules.goto(base+'paseo/admin/pricing');
 await modules.locator('#pdl-rate-amount').fill('550');
 await modules.getByRole('button',{name:'Save server rate'}).click();
 await modules.getByText(/Rate save returned, but the stored rate did not match/).waitFor();
 await modules.goto(base+'paseo/admin/settings');
 await modules.locator('.fe08-settings-form input').first().fill('4');
 await modules.getByRole('button',{name:'Save operational policies'}).click();
 await modules.getByText(/Policy save returned, but the stored values did not match/).waitFor();
 await modules.goto(base+'paseo/admin/calendar');
 await modules.waitForFunction(() => document.querySelector('[aria-label=\"Opening time\"]')?.value==='540');
 await modules.getByRole('combobox',{name:'Opening time'}).selectOption('600');
 await modules.getByRole('button',{name:'Save weekday schedule'}).click();
 await modules.getByText(/Schedule save returned, but the stored weekday did not match/).waitFor();
 await modules.getByRole('button',{name:'Add maintenance block'}).click();
 await modules.getByText(/Maintenance save returned, but its stored block was not confirmed/).waitFor();
 await modules.goto(base+'paseo/admin/payments');
 await modules.locator('#admin-qr-recipient-gcash').fill('Different Recipient');
 await modules.locator('#admin-qr-image-gcash').setInputFiles({
   name:'second-qr.png',mimeType:'image/png',
   buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YseMZkAAAAASUVORK5CYII=','base64'),
 });
 await modules.getByRole('button',{name:'Save GCash QR configuration'}).click();
 await modules.getByText(/GCash QR update was acknowledged but not confirmed by server readback/).waitFor();
 persistWrites=true;
 console.log('PASS six false-positive write acknowledgements rejected when persisted readback disagrees');

 const beforeReadbackWrites=writeCalls.length;
 await modules.goto(base+'paseo/admin/acceptance');
 await modules.getByText('7 of 7 read-only checks passed.').waitFor({timeout:15000});
 await modules.getByRole('button',{name:'Run readback again'}).click();
 await modules.getByText('7 of 7 read-only checks passed.').waitFor({timeout:15000});
 assert.equal(writeCalls.length,beforeReadbackWrites,'readback must not change persisted data');
 await modules.getByRole('link',{name:'Back to overview'}).click();
 await modules.getByRole('link',{name:'Check seven-module readback'}).waitFor();
 console.log('PASS seven-module same-tab server readback, manual retry and zero write requests');
 assert.deepEqual(moduleErrors,[]);
 console.log('PASS seven admin module routes: direct link, refresh, tab switching, back/forward without runtime errors');
 await modules.close();
 // A gateway outage is not evidence that a signed administrator lost access.
 const recovery=await browser.newPage();
 const recoveryErrors=[];
 recovery.on('pageerror',error=>recoveryErrors.push(error.message));
 await recovery.addInitScript(()=>sessionStorage.setItem('pdl-booking-admin-access-token','SYNTHETIC_TEST_ONLY'));
 let sessionChecks=0;
 await recovery.route('**/functions/v1/pdl-guest-api/v1/admin/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('/v1/admin/session')){
     sessionChecks++;
     return route.fulfill({status:sessionChecks===1?503:200,json:sessionChecks===1?
       {error:'synthetic_service_unavailable'}:{authenticated:true}});
   }
   if(path.endsWith('/v1/admin/policies'))return route.fulfill({status:200,json:{
     reservationLeadHours:0,arrivalGraceMinutes:15,publicNotice:'',
   }});
   return route.fulfill({status:404,json:{error:'missing_fixture'}});
 });
 await recovery.goto(base+'paseo/admin/settings');
 await recovery.getByRole('button',{name:'Retry session check'}).waitFor({timeout:15000});
 assert.equal(new URL(recovery.url()).pathname,prefix+'paseo/admin/settings');
 await recovery.getByRole('button',{name:'Retry session check'}).click();
 await recovery.getByRole('button',{name:'Save operational policies'}).waitFor({timeout:15000});
 assert.equal(sessionChecks,2);
 assert.deepEqual(recoveryErrors,[]);
 console.log('PASS transient administrator session outage preserves route and recovers on retry');
 await recovery.close();
 const crm=await browser.newPage();
 await crm.goto(base+'#/paseo');
 await crm.locator('.aps-auth-v2').waitFor({timeout:16000});
 assert.equal(await crm.getByRole('heading',{name:'Paseo de Lomboy'}).count(),0);
 console.log('PASS unsigned CRM hash route remains on CRM login');
 await crm.close();
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
