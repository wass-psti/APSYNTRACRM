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
implementations.select='async (table,query)=>{if(table==="fueltrans_memberships")return [member];if(table!=="fueltrans_tickets")return [];const q=new URLSearchParams(query);let rows=[fixture.sampleTicket,fixture.resolved];const client=q.get("client_code")?.slice(3);if(client)rows=rows.filter(t=>t.client_code===client);const search=q.get("payload->>stationId")||"";if(search.startsWith("ilike.*")){const term=search.slice(7,-1).toLowerCase();rows=rows.filter(t=>t.payload.stationId?.toLowerCase().includes(term));}return rows.map(t=>({id:t.id,workspace_id:t.workspace_id,client_code:t.client_code,ticket_number:t.ticket_number,status:t.status,updated_at:t.updated_at,station_id:t.payload.stationId,station_name:t.payload.stationName}));}';
const mockClient=setup+'\n'+[...new Set(importNames)].map(name=>
 'export const '+name+'='+ (implementations[name]||'async()=>{throw Error("Fixture mutation disabled: '+name+'")}')+';'
).join('\n');
const mockStorage='export const listEvidence=async()=>[];export const signedEvidenceUrl=async()=>"";export const uploadEvidence=async()=>{throw Error("Fixture upload disabled")};';
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><section id="fixture"></section><script type="module" src="/fixture-boot.js"></script></body></html>';
const boot=`import {mountFuelTrans} from '/frontend/fueltrans/app.js';
const host=document.querySelector('#fixture');
const shadow=host.attachShadow({mode:'open'});
for(const filename of ['styles.css','reference-design.css','operational-design02.css','station-design03.css','station-reconcile04.css']){
 const link=document.createElement('link');link.rel='stylesheet';link.href='/frontend/fueltrans/'+filename;shadow.append(link);
}
const root=document.createElement('div');shadow.append(root);
mountFuelTrans(root,{workspaceId:'${workspace}',route:'dashboard',base:'#/boards/fixture/fueltrans'});`;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1200,height:860},serviceWorkers:'block'});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(e.message));
await page.route('http://localhost/**',async route=>{
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
await page.goto('http://localhost/fixture');
const pick=selector=>page.locator('#fixture '+selector);
await pick('.ft-dashboard-grid').waitFor({timeout:10000});
assert.equal(await pick('.stat-grid .stat-card').count(),6,'six dashboard metrics');
assert.match(await pick('.ft-navigation .active').innerText(),/Dashboard/);

for(const size of [1200,768,540,390]){
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
 await page.screenshot({path:'/private/tmp/ft-ui07-dashboard-'+size+'.png',fullPage:true});
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
await page.screenshot({path:'/private/tmp/ft-ui07-wizard-review.png',fullPage:true});

await pick('.ft-navigation a').filter({hasText:'Ticket Queue'}).click();
await pick('.ft-ticket-card').first().waitFor();
assert.equal(await pick('.ft-ticket-card').count(),2);
assert.equal(await pick('.ft-queue-tabs button').count(),3);
await pick('[data-queue-status="Open"]').click();
assert.equal(await pick('.ft-ticket-card').count(),1);
assert.equal(await pick('[data-queue-status="Open"]').getAttribute('aria-pressed'),'true');
await page.screenshot({path:'/private/tmp/ft-ui07-queue.png',fullPage:true});

await pick('.ft-ticket-number').first().click();
await pick('.ft-detail-columns').waitFor();
assert.equal(await pick('.ft-detail-timers>div').count(),4);
assert.equal(await pick('.ft-detail-secondary').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
assert.equal(await pick('.ft-incident-grid dt').count(),11);
assert.equal(await pick('.ft-detail-primary #trusted-history').count(),1);
await page.screenshot({path:'/private/tmp/ft-ui07-detail.png',fullPage:true});

await pick('.ft-navigation a').filter({hasText:'Global L1 Workspace'}).click();
await pick('.ft-workflow-banner').waitFor();
assert.ok((await pick('.ft-ticket-card').count())>0);
await pick('.ft-navigation a').filter({hasText:'Shift Handover'}).click();
await pick('.ft-workflow-banner').waitFor();
assert.equal(await pick('.ft-ticket-card').count(),1);

await pick('.ft-navigation a').filter({hasText:'Recorded Stations'}).click();
await pick('.ft-station-history').waitFor();
assert.equal(await pick('.ft-station-card').count(),1,'deduplicated recorded stations');
assert.match(await pick('.ft-station-card h2').first().innerText(),/ARAMCO MARCELO GREEN/);
assert.match(await pick('.ft-station-contract').innerText(),/not a verified station directory/i);
assert.equal(await pick('.ft-station-facts a').first().getAttribute('href'),'#/boards/fixture/fueltrans/ticket/'+ticketId);
for(const width of [1200,768,540,390]){
 await page.setViewportSize({width,height:860});
 await page.waitForTimeout(80);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 assert.equal(overflow,false,'station view horizontal overflow at '+width);
 await page.screenshot({path:'/private/tmp/ft-ui07-stations-'+width+'.png',fullPage:true});
}
await page.setViewportSize({width:1200,height:860});
await pick('#station-history-filter input[name=stationId]').fill('NO_MATCH');
await pick('#station-history-filter button[type=submit]').click();
await pick('.ft-ticket-empty').waitFor();
assert.equal(await pick('.ft-station-card').count(),0,'no invented station rows');
await pick('#station-clear').click();
await pick('.ft-station-card').first().waitFor();
await pick('#station-history-filter select[name=client]').selectOption('UNIOIL');
await pick('#station-history-filter button[type=submit]').click();
await pick('.ft-ticket-empty').waitFor();
assert.equal(await pick('.ft-station-card').count(),0,'client filters do not cross-match');
await pick('#station-clear').click();
await pick('.ft-station-card').first().waitFor();

await pick('#station-source-review summary').click();
const templatePromise=page.waitForEvent('download');
await pick('#station-source-template').click();
const templateDownload=await templatePromise;
assert.equal(templateDownload.suggestedFilename(),'fueltrans-station-template.csv');
const validCsv='Client,Site ID,Station Name,AnyDesk Password\nARAMCO,1071B,ARAMCO MARCELO GREEN,NEVER_DISPLAY_THIS_SECRET\nUNIOIL,1013C,UNIOIL AIRPORT ROAD,NEVER_DISPLAY_THIS_SECRET\n';
await pick('#station-source-file').setInputFiles({name:'candidate.csv',mimeType:'text/csv',buffer:Buffer.from(validCsv)});
await pick('#station-source-form button[type=submit]').click();
await pick('.ft-source-results-head').waitFor();
assert.match(await pick('.ft-source-results-head').innerText(),/2 unique station candidates/);
assert.match(await pick('.ft-source-results-head').innerText(),/1 matching names/);
assert.match(await pick('.ft-source-results-head').innerText(),/1 not observed/);
assert.equal(await pick('#station-source-results').innerText().then(x=>x.includes('NEVER_DISPLAY_THIS_SECRET')),false);
const fingerprint=await pick('.ft-source-fingerprint code').innerText();
assert.match(fingerprint,/^[0-9a-f]{64}$/,'candidate fingerprint is SHA-256');
const manifestPromise=page.waitForEvent('download');
await pick('#station-export-evidence').click();
const manifestDownload=await manifestPromise;
assert.match(manifestDownload.suggestedFilename(),/fueltrans-station-candidate-evidence-page-1\.json/);
const candidateManifest=JSON.parse(await readFile(await manifestDownload.path(),'utf8'));
assert.equal(candidateManifest.verificationStatus,'UNVERIFIED_CANDIDATE');
assert.equal(candidateManifest.registryActivated,false);
assert.equal(candidateManifest.authorityVerified,false);
assert.equal(candidateManifest.fingerprint.value,fingerprint);
assert.equal(candidateManifest.source.uniqueStations,2);
assert.equal(candidateManifest.source.extraColumnsIgnored,1);
assert.equal(candidateManifest.comparison.scope,'visible-ticket-page-only');
assert.equal(candidateManifest.comparison.observed.matched_on_visible_page,1);
assert.equal(candidateManifest.comparison.observed.not_on_visible_page,1);
assert.equal(JSON.stringify(candidateManifest).includes('NEVER_DISPLAY_THIS_SECRET'),false);
const downloadPromise=page.waitForEvent('download');
await pick('#station-export-review').click();
const download=await downloadPromise;
assert.match(download.suggestedFilename(),/fueltrans-station-comparison-page-1\.csv/);
for(const width of [1200,768,540,390]){
 await page.setViewportSize({width,height:860});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 assert.equal(overflow,false,'source review must not overflow at '+width);
 await page.screenshot({path:'/private/tmp/ft-ui07-source-'+width+'.png',fullPage:true});
}
await page.setViewportSize({width:1200,height:860});
const invalidCsv='Client,Site ID,Station Name\nUNIOIL,1013C,Airport Road\nUNIOIL,1013C,Conflicting Name\n';
await pick('#station-source-file').setInputFiles({name:'conflicting.csv',mimeType:'text/csv',buffer:Buffer.from(invalidCsv)});
await pick('#station-source-form button[type=submit]').click();
await pick('.ft-source-issues').waitFor();
assert.equal(await pick('#station-export-review').count(),0,'invalid import candidate cannot export');
assert.equal(await pick('#station-export-evidence').count(),0,'invalid candidate cannot export a manifest');
await pick('.ft-navigation a').filter({hasText:'Analytics & Reports'}).click();
await pick('.report-tabs').waitFor();
assert.equal(await pick('[data-report-tab]').count(),4);
await page.screenshot({path:'/private/tmp/ft-ui07-analytics.png',fullPage:true});

await pick('.ft-navigation a').filter({hasText:'Report Issue'}).click();
await pick('#bug-form').waitFor();
assert.equal(await pick('.ft-severity-option').count(),4);
await pick('input[name=severity][value=high]').check();
assert.equal(await pick('input[name=severity]:checked').inputValue(),'high');
await page.screenshot({path:'/private/tmp/ft-ui07-report-issue.png',fullPage:true});

assert.deepEqual(pageErrors,[],'no browser page errors');
await browser.close();
console.log('PASS CP-FT-UI-07: synthetic authenticated fixture; original operational routes, local-only station CSV validation, page-scoped comparison/export, invalid source denial, and responsive 1200/768/540/390. No real backend mutations.');
