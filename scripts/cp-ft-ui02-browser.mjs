import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd();
const workspace='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const ticketId='33333333-3333-4333-8333-333333333333';
const now='2026-11-23T02:10:00.000Z';
const sampleTicket={
 workspace_id:workspace,id:ticketId,ticket_number:'ARA-2026-027',
 client_code:'ARAMCO',created_by:userId,assigned_l1:null,assigned_l2:null,
 status:'Open',archived:false,created_at:now,updated_at:now,
 payload:{name:'Ghost Transaction',stationId:'1071B',stationName:'ARAMCO MARCELO GREEN',
 systemType:'POS',priorityLevel:'High',impactLevel:'Informational',
 issueDetails:'Test-only synthetic POS station transaction description.',
 reportingChannel:'Email or Message',reportingShift:'Shift B',
 operationalDate:'2026-11-23',handoverFlag:true,activity:[],updates:[]}
};
const resolved={...sampleTicket,id:'44444444-4444-4444-8444-444444444444',
 ticket_number:'ARA-2026-026',status:'Resolved',
 payload:{...sampleTicket.payload,name:'Resolved synthetic printer issue',handoverFlag:false}};
const source=await readFile(join(root,'frontend/fueltrans/app.js'),'utf8');
const importNames=[...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/supabase-client\.js'/g)]
 .flatMap(match=>match[1].split(',').map(x=>x.trim()));
const fixtures={workspace,userId,ticketId,now,sampleTicket,resolved};
const setup='const fixture='+JSON.stringify(fixtures)+';const member={workspace_id:fixture.workspace,user_id:fixture.userId,role:"admin",client_code:null,enabled:true,status:"active",display_name:"QA Engineer",email:"qa@example.test"};';
const implementations={
 verifiedUser:'async()=>({id:fixture.userId,email:"qa@example.test"})',
 select:'async table=>table==="fueltrans_memberships"?[member]:[]',
 countTickets:'async(_workspace,status)=>status==="Open"?1:status==="Resolved"?1:status==null?2:0',
 listTickets:'async query=>{const q=new URLSearchParams(query);const filter=q.get("status")||"";let rows=[fixture.sampleTicket,fixture.resolved];if(filter==="eq.Open")rows=[fixture.sampleTicket];if(filter==="eq.Resolved")rows=[fixture.resolved];if(q.has("payload->>handoverFlag"))rows=[fixture.sampleTicket];return {rows,totalRange:"0-"+(rows.length-1)+"/"+rows.length};}',
 readTicket:'async()=>fixture.sampleTicket',
 readCollection:'async()=>[]',
 readBugDraftState:'async()=>({revision:0,value:{items:[]}})',
 readSharedIssues:'async()=>[]',
 readTicketDraftState:'async()=>null',
 findActiveTicketDuplicates:'async()=>[]',
 readTrustedTicketHistory:'async()=>[]',
 readAllTicketsForSnapshot:'async()=>[fixture.sampleTicket,fixture.resolved]',
 countAllTicketsForSnapshot:'async()=>2',
 readFreshFuelTransMembership:'async()=>member'
};
const mockClient=setup+'\n'+[...new Set(importNames)].map(name=>
 'export const '+name+'='+ (implementations[name]||'async()=>{throw Error("Fixture mutation disabled: '+name+'")}')+';'
).join('\n');
const mockStorage='export const listEvidence=async()=>[];export const signedEvidenceUrl=async()=>"";export const uploadEvidence=async()=>{throw Error("Fixture upload disabled")};';
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><section id="fixture"></section><script type="module" src="/fixture-boot.js"></script></body></html>';
const boot=`import {mountFuelTrans} from '/frontend/fueltrans/app.js';
const host=document.querySelector('#fixture');
const shadow=host.attachShadow({mode:'open'});
for(const filename of ['styles.css','reference-design.css','operational-design02.css']){
 const link=document.createElement('link');link.rel='stylesheet';link.href='/frontend/fueltrans/'+filename;shadow.append(link);
}
const root=document.createElement('div');shadow.append(root);
mountFuelTrans(root,{workspaceId:'${workspace}',route:'dashboard',base:'#/boards/fixture/fueltrans'});`;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1200,height:860},serviceWorkers:'block'});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(e.message));
await page.route('http://ft-ui.test/**',async route=>{
 const url=new URL(route.request().url());
 let body,contentType;
 if(url.pathname==='/fixture'){body=html;contentType='text/html';}
 else if(url.pathname==='/fixture-boot.js'){body=boot;contentType='application/javascript';}
 else if(url.pathname==='/frontend/fueltrans/supabase-client.js'){body=mockClient;contentType='application/javascript';}
 else if(url.pathname==='/frontend/fueltrans/storage-client.js'){body=mockStorage;contentType='application/javascript';}
 else if(url.pathname.startsWith('/frontend/')){
  const file=join(root,url.pathname.slice(1));
  body=await readFile(file);
  contentType=extname(file)==='.css'?'text/css':'application/javascript';
 }else{throw Error('Unexpected fixture request: '+url.pathname);}
 await route.fulfill({status:200,body,contentType});
});
await page.goto('http://ft-ui.test/fixture');
const pick=selector=>page.locator('#fixture '+selector);
await pick('.ft-dashboard-grid').waitFor({timeout:10000});
assert.equal(await pick('.stat-grid .stat-card').count(),6,'six dashboard metrics');
assert.match(await pick('.ft-navigation .active').innerText(),/Dashboard/);

for(const size of [1200,768,540]){
 await page.setViewportSize({width:size,height:860});
 await page.waitForTimeout(75);
 const state=await page.evaluate(()=>{
  const root=document.querySelector('#fixture').shadowRoot;
  return {width:document.documentElement.scrollWidth,
   nav:getComputedStyle(root.querySelector('.ft-navigation')).display,
   sidebar:getComputedStyle(root.querySelector('.ft-sidebar')).backgroundColor};
 });
 assert.ok(state.width<=size,'no page horizontal overflow at '+size);
 assert.equal(state.sidebar,'rgb(21, 30, 46)');
 assert.equal(state.nav,size<=700?'flex':'block');
 await page.screenshot({path:'/private/tmp/ft-ui02-dashboard-'+size+'.png',fullPage:true});
}
await page.setViewportSize({width:1200,height:860});
await pick('.ft-navigation a').filter({hasText:'Create Ticket'}).click();
await pick('#ticket-form').waitFor();
assert.equal(await pick('.source-step-progress li').count(),5);
assert.equal(await pick('.source-step-progress li.current').count(),1);
assert.equal(await pick('[data-create-stage]:not([hidden])').count(),1);
await pick('select[name=client]').selectOption('UNIOIL');
await pick('input[name=stationId]').fill('1013C');
await pick('input[name=stationName]').fill('UNIOIL AIRPORT ROAD');
await pick('#create-next').click();
assert.equal(await pick('[data-create-stage="1"]:visible').count(),1);
await pick('select[name=systemType]').selectOption({index:1});
await pick('select[name=priority]').selectOption('Medium');
await pick('select[name=impactLevel]').selectOption({index:1});
await pick('#create-next').click();
await pick('input[name=title]').fill('Synthetic POS failure ticket');
await pick('textarea[name=description]').fill('Synthetic report with sufficient details and a reproducible issue.');
await pick('#create-next').click();
await pick('select[name=reportingChannel]').selectOption({index:1});
await pick('#create-next').click();
assert.equal(await pick('[data-create-stage="4"]:visible').count(),1);
assert.equal(await pick('.source-step-progress li.current').count(),1);
assert.equal(await pick('.source-step-progress li.completed').count(),4);
assert.equal(await pick('#create-submit:visible').count(),1);
await page.screenshot({path:'/private/tmp/ft-ui02-wizard-review.png',fullPage:true});

await pick('.ft-navigation a').filter({hasText:'Ticket Queue'}).click();
await pick('.ft-ticket-card').first().waitFor();
assert.equal(await pick('.ft-ticket-card').count(),2);
assert.equal(await pick('.ft-queue-tabs button').count(),3);
await pick('[data-queue-status="Open"]').click();
assert.equal(await pick('.ft-ticket-card').count(),1);
assert.equal(await pick('[data-queue-status="Open"]').getAttribute('aria-pressed'),'true');
await page.screenshot({path:'/private/tmp/ft-ui02-queue.png',fullPage:true});

await pick('.ft-ticket-number').first().click();
await pick('.ft-detail-columns').waitFor();
assert.equal(await pick('.ft-detail-timers>div').count(),4);
assert.equal(await pick('.ft-detail-secondary').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
assert.equal(await pick('.ft-incident-grid dt').count(),11);
assert.equal(await pick('.ft-detail-primary #trusted-history').count(),1);
await page.screenshot({path:'/private/tmp/ft-ui02-detail.png',fullPage:true});

await pick('.ft-navigation a').filter({hasText:'Global L1 Workspace'}).click();
await pick('.ft-workflow-banner').waitFor();
assert.ok((await pick('.ft-ticket-card').count())>0);
await pick('.ft-navigation a').filter({hasText:'Shift Handover'}).click();
await pick('.ft-workflow-banner').waitFor();
assert.equal(await pick('.ft-ticket-card').count(),1);

await pick('.ft-navigation a').filter({hasText:'Analytics & Reports'}).click();
await pick('.report-tabs').waitFor();
assert.equal(await pick('[data-report-tab]').count(),4);
await page.screenshot({path:'/private/tmp/ft-ui02-analytics.png',fullPage:true});

await pick('.ft-navigation a').filter({hasText:'Report Issue'}).click();
await pick('#bug-form').waitFor();
assert.equal(await pick('.ft-severity-option').count(),4);
await pick('input[name=severity][value=high]').check();
assert.equal(await pick('input[name=severity]:checked').inputValue(),'high');
await page.screenshot({path:'/private/tmp/ft-ui02-report-issue.png',fullPage:true});

assert.deepEqual(pageErrors,[],'no browser page errors');
await browser.close();
console.log('PASS CP-FT-UI-02: synthetic authenticated fixture; dashboard, wizard steps 1-5, queue filters, detail, L1, handover, reports, issue severity, responsive 1200/768/540. No real backend mutations.');
