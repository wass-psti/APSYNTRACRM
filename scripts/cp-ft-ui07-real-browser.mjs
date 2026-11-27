// CP-FT-UI-07: Real GoTrue tokens + real FuelTrans browser module + PostgREST.
// The CRM host contract is emulated; this is NOT a full signed-in CRM host test.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {chromium} from 'playwright';
import {runFuelTransPerformance} from './cp-crm-perf-01b-fueltrans.mjs';

export async function verifyFuelTransTwoSessionBrowser({restPort,workspaceId,actors}){
 if(!/^\d{2,5}$/.test(restPort)||!actors?.unioil?.token||!actors?.global_l1_support?.token||!actors?.local_l2_support?.token)
  throw Error('Disposable GoTrue browser fixture arguments are missing.');
 const base='http://127.0.0.1:'+restPort;
 const boardId='77777777-7777-4777-8777-777777777777';
 const root=process.cwd();
 const browser=await chromium.launch({headless:true});
 const contexts=[];
 const errors=[];
 async function openActor(actor,route,{viewport={width:1200,height:860},observe=null}={}){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  contexts.push(context);
  const user={id:actor.id,email:actor.email};
  const boot=`import {syncFuelTrans} from '/frontend/fueltrans-native.js';
const u=${JSON.stringify(user)},jwt=${JSON.stringify(actor.token)};
const auth={userId:u.id,getVerifiedUser:async()=>u,token:async()=>jwt};
const api={context:async()=>({user_id:u.id,workspace_id:'${workspaceId}'}),
board:async()=>({board:{workspace_id:'${workspaceId}',name:'FuelTrans Standalone'}}),
allowed:async()=>true,rpc:async()=>true};
syncFuelTrans({container:document.querySelector('#host'),auth,api,
boardId:'${boardId}',workspaceId:'${workspaceId}',userId:u.id,route:${JSON.stringify(route)}});
`;
  const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="host"></div><script type="module" src="/fixture-boot.js"></script></body></html>';
  await context.route('**/*',async routeObject=>{
   const url=new URL(routeObject.request().url());
   if(url.origin!==base){await routeObject.abort('blockedbyclient');return;}
   // These two OPTIONAL read-only services are outside the disposable core-ticket DB fixture.
   // Stub empty results; this acceptance does NOT certify Storage or the later audit schema.
   if(url.pathname==='/storage/v1/object/list/fueltrans-evidence'||
      url.pathname==='/rest/v1/fueltrans_ticket_events_v2'){
    await routeObject.fulfill({status:200,body:'[]',contentType:'application/json'});return;
   }
   // CRM normally routes /rest/v1 through Kong; local PostgREST serves tables at /.
   if(url.pathname.startsWith('/rest/v1/')){
    if(observe&&routeObject.request().method()!=='GET'){observe.blockedWrites++;await routeObject.abort('blockedbyclient');return;}
    await routeObject.continue({url:base+url.pathname.slice('/rest/v1'.length)+url.search});return;
   }
   if(url.pathname==='/fixture'){await routeObject.fulfill({body:html,contentType:'text/html'});return;}
   if(url.pathname==='/fixture-boot.js'){await routeObject.fulfill({body:boot,contentType:'application/javascript'});return;}
   if(url.pathname==='/frontend/config.js'){
    await routeObject.fulfill({body:`export const SUPABASE_URL='${base}';export const SUPABASE_PUBLISHABLE_KEY='disposable-test-only';`,contentType:'application/javascript'});return;
   }
   if(url.pathname.startsWith('/frontend/')&&url.pathname!=='/frontend/config.js'){
    const part=url.pathname.slice(1);
    if(part.includes('..')){await routeObject.abort('blockedbyclient');return;}
    const body=await readFile(join(root,part));
    const ext=extname(part),contentType=ext==='.css'?'text/css':ext==='.svg'?'image/svg+xml':'application/javascript';
    await routeObject.fulfill({body,contentType});return;
   }
   await routeObject.fulfill({status:404,body:'Not available'});
  });
  const page=await context.newPage();
  if(observe)observe.attach(page);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push('console '+(msg.location()?.url||'?')+': '+msg.text());});
  page.on('requestfailed',request=>errors.push('failed '+new URL(request.url()).pathname+': '+request.failure()?.errorText));
  await page.goto(base+'/fixture#/boards/'+boardId+'/fueltrans/'+route);
  const pick=selector=>page.locator('#host '+selector);
  try{await pick('.ft-navigation').waitFor({timeout:12000});}
  catch(error){
   console.error('BROWSER_HOST_DIAGNOSTIC',JSON.stringify({
    errors:errors.slice(-6),visible:(await page.locator('#host').innerText()).slice(0,700),
    dom:await page.evaluate(()=>({hasShadow:!!document.querySelector('#host')?.firstElementChild?.shadowRoot,
     inside:document.querySelector('#host')?.firstElementChild?.shadowRoot?.textContent?.slice(0,250),
     html:document.querySelector('#host')?.outerHTML?.slice(0,180)})),url:page.url()
   }));
   throw error;
  }
  return {page,pick,actor};
 }
 try{
  if(process.env.CP_CRM_PERF_01B_FUELTRANS==='1'){
   await runFuelTransPerformance({openActor,actor:actors.admin});
   assert.deepEqual(errors,[],'No browser module errors during benchmark');
   return;
  }
  const reporter=await openActor(actors.unioil,'create-ticket');
  await reporter.pick('#ticket-form').waitFor();
  await reporter.pick('input[name=stationId]').fill('TEST07');
  await reporter.pick('input[name=stationName]').fill('SYNTHETIC TEST STATION');
  await reporter.pick('#create-next').click();
  await reporter.pick('select[name=category]').selectOption('POS Software Issue');
  await reporter.pick('select[name=systemType]').selectOption({index:1});
  await reporter.pick('select[name=priority]').selectOption('Medium');
  await reporter.pick('select[name=impactLevel]').selectOption({index:1});
  await reporter.pick('#create-next').click();
  await reporter.pick('input[name=title]').fill('Disposable browser-created POS incident');
  await reporter.pick('textarea[name=description]').fill('Isolated two-account browser test of a POS incident; no real station is affected.');
  await reporter.pick('#create-next').click();
  await reporter.pick('select[name=reportingChannel]').selectOption({index:1});
  await reporter.pick('#create-next').click();
  await reporter.pick('#source-create-review').waitFor();
  await reporter.pick('#create-submit').click();
  await reporter.pick('.ft-detail-columns').waitFor({timeout:15000});
  const hash=new URL(reporter.page.url()).hash;
  const match=/\/ticket\/([0-9a-f-]{36})$/.exec(hash);
  assert.ok(match,'Reporter browser submission must navigate to saved ticket');
  const ticketId=match[1];
  assert.match(await reporter.pick('.ft-main').innerText(),/Disposable browser-created POS incident/);
  console.log('GOTRUE_REPORTER_BROWSER_TICKET_CREATED_AND_RENDERED PASS');

  const l1=await openActor(actors.global_l1_support,'ticket/'+ticketId);
  await l1.pick('.ft-detail-columns').waitFor({timeout:12000});
  await l1.pick('[data-ticket-action="claim-l1"]').click();
  await l1.pick('[data-ticket-action="status:Escalated to L2"]').waitFor({timeout:12000});
  assert.match(await l1.pick('.ft-main').innerText(),/Under L1 Review/);
  await l1.pick('[data-ticket-action="status:Escalated to L2"]').click();
  await l1.pick('#workflow-reason-dialog[open]').waitFor({timeout:5000});
  await l1.pick('#workflow-reason-text').fill('x');
  await l1.pick('#workflow-reason-submit').click();
  assert.equal(await l1.pick('#workflow-reason-dialog').evaluate(el=>el.open),true,'short escalation reason must keep the dialog open');
  assert.match(await l1.pick('.ft-main').innerText(),/Under L1 Review/);
  await l1.pick('#workflow-reason-text').fill('POS transaction service unavailable after repeated terminal restart.');
  await l1.pick('#workflow-reason-submit').click();
  await l1.pick('.ft-main').getByText('Escalated to L2').first().waitFor({timeout:12000});
  console.log('GOTRUE_L1_BROWSER_CLAIM_AND_ESCALATION PASS');

  const l2=await openActor(actors.local_l2_support,'ticket/'+ticketId);
  await l2.pick('[data-ticket-action="claim-l2"]').waitFor({timeout:12000});
  await l2.pick('[data-ticket-action="claim-l2"]').click();
  await l2.pick('[data-ticket-action="status:Resolved"]').waitFor({timeout:12000});
  await l2.pick('[data-ticket-action="status:Resolved"]').click();
  await l2.pick('#workflow-reason-dialog[open]').waitFor({timeout:5000});
  await l2.pick('#workflow-reason-text').fill('fixed');
  await l2.pick('#workflow-reason-submit').click();
  assert.equal(await l2.pick('#workflow-reason-dialog').evaluate(el=>el.open),true,'short resolution must keep the dialog open');
  assert.match(await l2.pick('.ft-main').innerText(),/Under L2 Review/);
  await l2.pick('#workflow-reason-text').fill('Replaced the failed terminal cable and verified successful station transactions.');
  await l2.pick('#workflow-reason-submit').click();
  await l2.pick('[data-ticket-action="status:Resolved"]').waitFor({state:'detached',timeout:12000});
  await l2.pick('.ft-main').getByText('Resolved').first().waitFor({timeout:12000});
  assert.match(await l2.pick('.ft-main').innerText(),/Replaced the failed terminal cable/);
  assert.equal(await l2.pick('[data-ticket-action="status:Resolved"]').count(),0,'Resolved ticket has no further resolve action');
  console.log('GOTRUE_L2_BROWSER_CLAIM_AND_RESOLUTION PASS');

  const other=await openActor(actors.aramco,'ticket/'+ticketId);
  await other.pick('.ft-detail-columns').waitFor({timeout:5000}).then(()=>{throw Error('Cross-client ticket detail appeared');},()=>{});
  assert.equal(await other.pick('.ft-detail-columns').count(),0);
  console.log('GOTRUE_OTHER_CLIENT_BROWSER_READ_DENIED PASS');

  await reporter.pick('#refresh').click();
  await reporter.pick('.ft-main').getByText('Resolved').first().waitFor({timeout:12000});
  for(const width of [1200,768,540,390]){
   await l2.page.setViewportSize({width,height:860});
   const overflow=await l2.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   assert.equal(overflow,false,'FuelTrans browser module overflows at '+width);
  }
  assert.deepEqual(errors,[],'No browser module errors');
  console.log('PASS CP-FT-UI-07 real local GoTrue browser reporter/L1/L2 sessions with live ticket writes and post-resolution readback; CRM host handshake emulated, not certified.');
 }finally{
  for(const context of contexts)await context.close();
  await browser.close();
 }
}
