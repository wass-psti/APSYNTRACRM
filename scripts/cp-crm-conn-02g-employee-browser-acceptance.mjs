#!/usr/bin/env node
/**
 * CP-CRM-CONN-02G — read-only, genuine signed-employee native application acceptance.
 *
 * Usage:
 *   node scripts/cp-crm-conn-02g-employee-browser-acceptance.mjs --cdp-url=http://127.0.0.1:9225
 *   node scripts/cp-crm-conn-02g-employee-browser-acceptance.mjs --cdp-url=http://127.0.0.1:9225 --simulate-generic-denials
 *
 * Uses an already signed employee tab. It does not automate login, inspect cookies,
 * tokens or browser storage, click workflow actions, submit forms, or write records.
 * Generic-denial simulation is an ephemeral Playwright route override only; it
 * never changes production database policies or permissions. The shared workspace
 * catalog is denied during each native-route cold start to verify startup fallback.
 *
 * The connected browser belongs to the user. This process disconnects by exiting;
 * it never calls Browser.close or closes the user's tab/session.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const BASE='https://wass-psti.github.io/APSYNTRACRM/';
const cdpUrl=process.argv.find(value=>value.startsWith('--cdp-url='))?.slice('--cdp-url='.length);
const simulateGenericDenials=process.argv.includes('--simulate-generic-denials');
const deniedGenericRpcs=new Set([
  'wm_list_boards',
  'work_board_access',
  'wm_get_board_shell',
  'wm_get_board_items_page',
  'wm_board_ui_read',
]);
const scenarios=[
  {
    route:'#/time-tracker',label:'TimeTracker',moduleId:'time-tracker',
    boardId:'46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
    domainRpcs:['timetracker_ot_snapshot','timetracker_attendance_capabilities'],
    visible:['TimeTracker Attendance','START SESSION'],
  },
  {
    route:'#/fund-tracker',label:'Fund Tracker',moduleId:'fund-released-tracker',
    boardId:'f36da8fe-8d9d-4629-9938-12533cb3ca39',
    domainRpcs:['frt_bootstrap','frt_board_dashboard_safe','frt_board_list_safe'],
    visible:['Fund Tracker','New Fund Request'],
  },
  {
    route:'#/fueltrack',label:'FuelTrack+',moduleId:'fueltrack-plus',
    boardId:'7af78b3f-67bf-4600-9aa1-9006d19d486e',
    domainRpcs:['fueltrack_v3_read'],
    visible:['FuelTrack+','New Fuel Request'],
  },
  {
    route:'#/tradelink/documents',label:'TradeLink',moduleId:'tradelink',
    boardId:'264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
    domainRpcs:['tl03_assigned_documents'],
    visible:['My Assigned Documents','Create New'],
  },
];

let exitCode=0;
if(!cdpUrl||!/^http:\/\/127\.0\.0\.1:\d+$/.test(cdpUrl)){
  console.error('Provide --cdp-url=http://127.0.0.1:<existing-debug-port> for an existing signed employee browser.');
  exitCode=2;
}else{
  const browser=await chromium.connectOverCDP(cdpUrl);
  let page;
  let originalUrl;
  let failure=null;
  const rpcEvents=[];
  const rpcRequests=[];
  const pageErrors=[];
  const failedRequests=[];
  const unexpectedHttpErrors=[];
  const optionalActivityDenials=[];
  const report={milestone:'CP-CRM-CONN-02G',identity:'employee',mode:simulateGenericDenials?'generic-denial-simulation':'production-read-only',applications:[]};

  try{
    const candidates=browser.contexts().flatMap(context=>context.pages());
    for(const candidate of candidates){
      if(!candidate.url().startsWith(BASE))continue;
      const visible=await candidate.locator('body').innerText().catch(()=> '');
      if(visible.includes('Secure session')&&visible.includes('Sign out')&&
         visible.includes('Workspace member')){page=candidate;break;}
    }
    assert.ok(page,'An existing signed employee application tab must be open; login is never automated.');
    originalUrl=page.url();

    page.on('pageerror',error=>pageErrors.push(error.message));
    page.on('requestfailed',request=>{
      const url=new URL(request.url());
      if(url.pathname.includes('/rest/v1/'))failedRequests.push({path:url.pathname,reason:request.failure()?.errorText});
    });
    page.on('request',request=>{
      const url=new URL(request.url());
      if(url.pathname.includes('/rest/v1/rpc/'))
        rpcRequests.push({rpc:url.pathname.split('/').pop(),body:request.postData()||''});
    });
    page.on('response',response=>{
      const url=new URL(response.url());
      if(url.pathname.includes('/rest/v1/rpc/')){
        const rpc=url.pathname.split('/').pop();
        rpcEvents.push({rpc,status:response.status()});
        if(response.status()>=400&&!(simulateGenericDenials&&deniedGenericRpcs.has(rpc)&&response.status()===403))
          unexpectedHttpErrors.push({rpc,status:response.status()});
      }else if(url.pathname.includes('/rest/v1/')&&response.status()>=400){
        unexpectedHttpErrors.push({path:url.pathname,status:response.status()});
      }
    });

    if(simulateGenericDenials){
      await page.route('**/rest/v1/rpc/**',async route=>{
        const rpc=new URL(route.request().url()).pathname.split('/').pop();
        if(deniedGenericRpcs.has(rpc)){
          await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'CP-CRM-CONN-02G ephemeral generic-board dependency simulation'})});
        }else await route.continue();
      });
    }

    for(const scenario of scenarios){
      console.log(`Checking ${scenario.label}...`);
      // First set the native route, then reload it so workspace startup itself is
      // exercised with the generic board catalog denial in place.
      await page.goto(`${BASE}${scenario.route}`,{waitUntil:'domcontentloaded',timeout:45000});
      const eventStart=rpcEvents.length;
      const requestStart=rpcRequests.length;
      const nativeResolverPromise=page.waitForResponse(response=>{
        const url=new URL(response.url());
        return url.pathname.endsWith('/rpc/native_application_board_context')&&
          (response.request().postData()||'').includes(scenario.moduleId);
      },{timeout:30000});
      const domainPromises=scenario.domainRpcs.map(rpc=>page.waitForResponse(response=>{
        const url=new URL(response.url());
        return url.pathname.endsWith('/rpc/'+rpc)&&response.status()===200;
      },{timeout:30000}));
      await page.reload({waitUntil:'domcontentloaded',timeout:45000});
      const [nativeResponse]=await Promise.all([nativeResolverPromise,...domainPromises]);
      const payload=await nativeResponse.json();
      const context=Array.isArray(payload)?payload[0]:payload;
      await page.waitForFunction(()=>document.body.innerText.includes('Secure session')&&
        document.body.innerText.includes('Workspace member'),null,{timeout:20000});
      await page.waitForFunction(labels=>labels.every(label=>document.body.innerText.toLowerCase().includes(label.toLowerCase())),scenario.visible,{timeout:35000});
      await page.waitForTimeout(1200);

      const observed=rpcEvents.slice(eventStart);
      const domain=observed.filter(event=>scenario.domainRpcs.includes(event.rpc));
      const genericDenials=observed.filter(event=>deniedGenericRpcs.has(event.rpc)&&event.status===403);
      const genericViewRequests=rpcRequests.slice(requestStart).filter(request=>
        request.rpc==='work_board_access'&&/"p_required"\s*:\s*"view"/.test(request.body));
      const result={
        application:scenario.label,
        resolverStatus:nativeResponse.status(),
        moduleId:context?.moduleId??null,
        moduleRole:context?.role??null,
        canonicalBoardId:context?.board?.id??null,
        workspaceResolved:Boolean(context?.workspaceId),
        domainRpc:domain,
        visibleUi:scenario.visible,
        simulatedGenericDenials:genericDenials,
        genericViewPermissionRequests:genericViewRequests.length,
      };
      report.applications.push(result);
      console.log(`PASS ${scenario.label}: resolver, domain reads and native interface verified`);

      assert.equal(nativeResponse.status(),200,`${scenario.label} native resolver`);
      assert.equal(context?.moduleId,scenario.moduleId,`${scenario.label} module identity`);
      assert.equal(context?.board?.id,scenario.boardId,`${scenario.label} canonical board`);
      assert.ok(context?.workspaceId,`${scenario.label} workspace context`);
      if(scenario.moduleId==='time-tracker')
        assert.equal(context?.role,'Employee','TimeTracker module role confirms employee acceptance');
      for(const rpc of scenario.domainRpcs)
        assert.ok(domain.some(event=>event.rpc===rpc&&event.status===200),`${scenario.label} ${rpc} read`);
      assert.equal(genericViewRequests.length,0,`${scenario.label} must not request generic board view permission`);
      if(simulateGenericDenials){
        assert.ok(genericDenials.some(event=>event.rpc==='work_board_access'),`${scenario.label} generic board-access denial was not exercised`);
        assert.ok(genericDenials.some(event=>event.rpc==='wm_list_boards'),`${scenario.label} generic board-catalog denial was not exercised`);
      }
    }

    const fuelTrackRole=report.applications.find(item=>item.application==='FuelTrack+')?.moduleRole;
    for(const denial of [...unexpectedHttpErrors]){
      if(denial.rpc==='list_module_activity'&&denial.status===403&&fuelTrackRole!=='Admin'){
        optionalActivityDenials.push({...denial,scope:'non-core FuelTrack Activity surface for this non-Admin module role'});
        unexpectedHttpErrors.splice(unexpectedHttpErrors.indexOf(denial),1);
      }
    }
    assert.deepEqual(pageErrors,[],'No JavaScript page errors');
    assert.deepEqual(failedRequests,[],'No failed network requests');
    assert.deepEqual(unexpectedHttpErrors,[],'No unexpected HTTP errors');
    report.optionalActivityDenials=optionalActivityDenials;
    report.genericViewPermissionRequests=rpcRequests.filter(request=>
      request.rpc==='work_board_access'&&/"p_required"\s*:\s*"view"/.test(request.body)).length;
    report.outcome='PASS';
    report.pageErrors=pageErrors.length;
    report.failedRequests=failedRequests.length;
    report.unexpectedHttpErrors=unexpectedHttpErrors.length;
    report.productionPoliciesChanged=false;
    report.productionDataWritten=false;
    report.workflowActionsSubmitted=false;
    console.log(JSON.stringify(report,null,2));
  }catch(error){
    failure=error;
  }finally{
    if(page&&originalUrl&&!page.isClosed()){
      await page.unroute('**/rest/v1/rpc/**').catch(()=>{});
      await page.goto(originalUrl,{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
    }
  }

  if(failure){
    console.error(failure);
    exitCode=1;
  }
}

// Exit the CLI process without issuing Browser.close: the browser and signed-in
// employee tab are user-owned resources and must remain open after acceptance.
await new Promise(resolve=>process.stdout.write('',resolve));
await new Promise(resolve=>process.stderr.write('',resolve));
process.exit(exitCode);
