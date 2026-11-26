/** Isolated signed browser acceptance for the real TimeTracker OT renderer and RPCs. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const repoRoot=resolve(import.meta.dirname,'..');
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Isolated signed OT acceptance</title></head><body><main id="ot-root"></main><script type="module">
import {renderTimeTrackerOvertime,updateTimeTrackerOvertimePreview} from '/frontend/time-tracker-overtime.js';
window.renderSignedOt=(rows,access,status='Submitted')=>{document.getElementById('ot-root').innerHTML=renderTimeTrackerOvertime({requests:rows,access,filters:{status},now:new Date()});};
window.renderDurationForm=access=>{document.getElementById('ot-root').innerHTML=renderTimeTrackerOvertime({requests:[],access,modalOpen:true,now:new Date()});};
window.renderManualDurationForm=access=>{document.getElementById('ot-root').innerHTML=renderTimeTrackerOvertime({requests:[],access,modalOpen:'manual',now:new Date()});};
window.updateDurationPreview=form=>updateTimeTrackerOvertimePreview(form);
window.__otBrowserReady=true;
</script></body></html>`;
const allowedModules=new Set(['time-tracker-overtime.js','time-tracker-duration-format.js','time-tracker-time-format.js']);

export async function runSignedOtBrowserAcceptance({restUrl,bootstrap,worker,hr,board,selfPending,workerPending,durationRequest,hrOwnRequest}){
 let browser;
 const server=createServer(async(req,res)=>{
  try{
   const pathname=new URL(req.url,'http://127.0.0.1').pathname;
   if(pathname==='/'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;
   }
   if(pathname.startsWith('/frontend/')&&allowedModules.has(pathname.split('/').pop())){
    const file=resolve(repoRoot,'frontend',pathname.split('/').pop());
    res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});
    res.end(readFileSync(file));return;
   }
   if(['/rpc/timetracker_ot_snapshot','/rpc/timetracker_ot_decide','/rpc/timetracker_ot_decide_duration','/rpc/timetracker_ot_decide_manual_duration'].includes(pathname)&&req.method==='POST'){
    // Proxy only the exact disposable OT RPC endpoints, never an arbitrary URL.
    const chunks=[];
    for await(const chunk of req){chunks.push(chunk);if(Buffer.concat(chunks).length>4096)throw Error('Request too large');}
    const result=await fetch(restUrl+pathname,{
     method:'POST',headers:{'Content-Type':'application/json',
      Authorization:req.headers.authorization||''},body:Buffer.concat(chunks),
     signal:AbortSignal.timeout(8000)});
    res.writeHead(result.status,{'Content-Type':'application/json'});
    res.end(await result.text());return;
   }
   res.writeHead(404);res.end('Not found');
  }catch{res.writeHead(500);res.end('Isolated browser handler failed');}
 });
 try{
  await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',done);});
  const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,executablePath:
   process.platform==='darwin'?'/Applications/Chromium.app/Contents/MacOS/Chromium':chromium.executablePath()});
  const ctxA=await browser.newContext(),ctxB=await browser.newContext(),ctxH=await browser.newContext();
  const adminPage=await ctxA.newPage(),workerPage=await ctxB.newPage(),hrPage=await ctxH.newPage();
  const errors=[];
  for(const page of [adminPage,workerPage,hrPage]){
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base,{waitUntil:'load'});
   await page.waitForFunction(()=>window.__otBrowserReady===true);
  }
  async function load(page,actor,status='Submitted',moduleRole='Employee'){
   return page.evaluate(async({token,board,userId,status,moduleRole})=>{
    const response=await fetch('/rpc/timetracker_ot_snapshot',{
     method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
     body:JSON.stringify({p_board_id:board})});
    if(!response.ok)throw Error('Signed browser OT snapshot HTTP '+response.status);
    const snapshot=await response.json();
    if(snapshot.actorId!==userId)throw Error('Signed browser actor mismatch');
    window.renderSignedOt(snapshot.rows,{userId,
     bootstrapApprover:snapshot.bootstrapApprover,manualOtManager:snapshot.manualOtManager,
     otContractActive:true,durationOtContractActive:snapshot.durationOtContract==='tt-duration-ot-1',
     durationOtHrApprover:snapshot.durationOtHrApprover===true,
     durationOtApprover:snapshot.durationOtApprover===true,moduleRole},status);
    return snapshot;
   },{token:actor.token,board,userId:actor.id,status,moduleRole});
  }
  const original=await load(adminPage,bootstrap,'Submitted','System Admin');
  assert.ok(original.rows.some(r=>r.id===selfPending.id));
  const selfCard=adminPage.locator(`[data-request-id="${selfPending.id}"]`);
  await selfCard.locator('summary').click();
  assert.equal(await selfCard.locator('[data-action="tt-ot-approve"]').count(),1);
  assert.equal(await selfCard.locator('[data-action="tt-ot-reject"]').count(),1);
  await adminPage.evaluate(({token,board})=>{
   document.addEventListener('click',async e=>{
    const button=e.target.closest('[data-action="tt-ot-approve"], [data-action="tt-ot-reject"]');
    if(!button)return;
    const decision=button.dataset.action==='tt-ot-approve'?'Approved':'Rejected';
    const response=await fetch('/rpc/timetracker_ot_decide',{
     method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
     body:JSON.stringify({p_board_id:board,p_request_id:button.dataset.id,p_decision:decision})});
    window.__otLastDecision={status:response.status,result:await response.json()};
   });
  },{token:bootstrap.token,board});
  await selfCard.locator('[data-action="tt-ot-approve"]').click();
  await adminPage.waitForFunction(()=>window.__otLastDecision?.status===200);
  assert.equal((await adminPage.evaluate(()=>window.__otLastDecision.result)).status,'Approved');
  const refreshed=await load(adminPage,bootstrap,'Submitted','System Admin');
  assert.equal(refreshed.rows.find(r=>r.id===selfPending.id).status,'Approved');
  const pendingCard=adminPage.locator(`[data-request-id="${workerPending.id}"]`);
  await pendingCard.locator('summary').click();
  assert.doesNotMatch(await pendingCard.innerText(),/\b\d{1,2}:\d{2}\b/,
   'legacy OT review rows show hours, never clock-time ranges');
  await pendingCard.locator('[data-action="tt-ot-reject"]').click();
  await adminPage.waitForFunction(id=>window.__otLastDecision?.result?.id===id,workerPending.id);
  assert.equal((await adminPage.evaluate(()=>window.__otLastDecision.result)).status,'Rejected');
  await load(workerPage,worker,'Rejected');
  const ownCard=workerPage.locator(`[data-request-id="${workerPending.id}"]`);
  await ownCard.locator('summary').click();
  assert.equal(await ownCard.locator('.tt-ot-pill').innerText(),'Rejected');
  assert.equal(await workerPage.locator('[data-action="tt-ot-approve"]').count(),0);
  await adminPage.reload();
  await adminPage.waitForFunction(()=>window.__otBrowserReady===true);
  const afterReload=await load(adminPage,bootstrap,'Submitted','System Admin');
  assert.equal(afterReload.rows.find(r=>r.id===workerPending.id).status,'Rejected');
  // Exercise the new duration-only employee form in a real Chromium context.
  await workerPage.evaluate(({userId})=>window.renderDurationForm({
   userId,moduleRole:'Employee',otContractActive:true,
   durationOtContractActive:true,durationOtHrApprover:false
  }),{userId:worker.id});
  const hours=workerPage.locator('#tt-ot-duration-hours');
  assert.equal(await hours.count(),1);
  assert.equal(await workerPage.locator('#tt-ot-start,#tt-ot-end').count(),0);
  await hours.fill('3');
  await workerPage.locator('#tt-ot-reason').fill('Additional engineering inspection work');
  await adminPage.evaluate(({workerId})=>window.renderManualDurationForm({
   userId:'platform-admin',moduleRole:'System Admin',manualOtManager:true,
   otContractActive:true,durationOtContractActive:true,
   overviewDirectory:[{id:workerId,status:'active',display_name:'Worker One'}]
  }),{workerId:worker.id});
  assert.equal(await adminPage.locator('#tt-ot-manual-duration-hours').count(),1);
  assert.equal(await adminPage.locator('#tt-ot-manual-start,#tt-ot-manual-end').count(),0);
  await workerPage.evaluate(()=>window.updateDurationPreview(document.querySelector('#tt-ot-form')));
  assert.equal(await workerPage.locator('[data-tt-ot-duration-value]').innerText(),'3 hr 00 min');

  // The real signed HR snapshot alone exposes duration approval controls.
  const hrSnapshot=await load(hrPage,hr,'Submitted','HR');
  assert.equal(hrSnapshot.durationOtHrApprover,true);
  assert.equal(hrSnapshot.scope,'AUTHORIZED_WORKSPACE_TEAM');
  const durationCard=hrPage.locator(`[data-request-id="${durationRequest.id}"]`);
  const ownHrCard=hrPage.locator(`[data-request-id="${hrOwnRequest.id}"]`);
  await durationCard.locator('summary').click();
  assert.doesNotMatch(await durationCard.innerText(),/\b\d{1,2}:\d{2}\b/,
   'duration OT review rows do not expose start or end times');
  assert.equal(await durationCard.locator('[data-action="tt-ot-approve"]').count(),1);
  await ownHrCard.locator('summary').click();
  assert.equal(await ownHrCard.locator('[data-action="tt-ot-approve"]').count(),0,
   'HR cannot approve its own request');
  await load(adminPage,bootstrap,'Submitted','System Admin');
  const bootstrapDuration=adminPage.locator(`[data-request-id="${durationRequest.id}"]`);
  await bootstrapDuration.locator('summary').click();
  assert.equal(await bootstrapDuration.locator('[data-action="tt-ot-approve"]').count(),1,
   'platform Admin receives the signed duration OT review control');

  await hrPage.evaluate(({token,board})=>{
   document.addEventListener('click',async e=>{
    const button=e.target.closest('[data-action="tt-ot-approve"]');
    if(!button)return;
    const response=await fetch('/rpc/timetracker_ot_decide_duration',{
     method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
     body:JSON.stringify({p_board_id:board,p_request_id:button.dataset.id,p_decision:'Approved'})});
    window.__otDurationDecision={status:response.status,result:await response.json()};
   });
  },{token:hr.token,board});
  await durationCard.locator('[data-action="tt-ot-approve"]').click();
  await hrPage.waitForFunction(()=>window.__otDurationDecision?.status===200);
  assert.equal((await hrPage.evaluate(()=>window.__otDurationDecision.result)).status,'Approved');
  const hrApproved=await load(hrPage,hr,'Approved','HR');
  assert.equal(hrApproved.rows.find(row=>row.id===durationRequest.id).status,'Approved');
  assert.equal(hrApproved.rows.find(row=>row.id===durationRequest.id).attendanceCredit,null);
  await load(workerPage,worker,'Approved');
  const employeeApproved=workerPage.locator(`[data-request-id="${durationRequest.id}"]`);
  await employeeApproved.locator('summary').click();
  assert.equal(await employeeApproved.locator('[data-action="tt-ot-approve"]').count(),0);
  assert.equal(await employeeApproved.locator('.tt-ot-pill').innerText(),'Approved');
  assert.deepEqual(errors,[]);
  console.log('REAL_CHROMIUM_SIGNED_LEGACY_AND_DURATION_HR_OT_ACCEPTANCE_PASS');
 }finally{
  if(browser)await browser.close();
  await new Promise(done=>server.close(done));
 }
}
