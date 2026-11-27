/**
 * CP-CRM-LOAD-01D — Chromium acceptance for the production shell DOM helper.
 * Uses a disposable browser fixture and never connects to production data.
 */
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';

const browserBin = [
 process.env.CHROME_BIN,
 '/usr/bin/google-chrome',
 '/usr/bin/chromium',
 '/usr/bin/chromium-browser',
 '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 '/Applications/Chromium.app/Contents/MacOS/Chromium'
].find(path=>path&&existsSync(path));

assert.ok(browserBin,'Chromium unavailable');

const server = await createServer({
 configFile:'vite.config.js',
 logLevel:'error',
 server:{host:'127.0.0.1',port:0,strictPort:false}
});
let browser;

try {
 await server.listen();
 const address = server.httpServer.address();
 assert.ok(address&&typeof address==='object','Vite server did not bind a port');
 const origin = 'http://127.0.0.1:' + address.port;
 browser = await chromium.launch({
  executablePath:browserBin,
  headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--disable-sync']
 });
 const page = await browser.newPage({viewport:{width:1440,height:900}});
 const pageErrors = [];
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto(origin+'/frontend/application-shell-dom.js',{waitUntil:'domcontentloaded'});

 const result = await page.evaluate(async()=>{
  const [shellModule,loadingModule,routeModule] = await Promise.all([
   import('./application-shell-dom.js'),
   import('./application-loading.js'),
   import('./sidebar-active-route.js')
  ]);
  const {updateExistingApplicationShell} = shellModule;
  const {resolveApplicationLoadingState,isCurrentApplicationRouteRead} = loadingModule;
  const {sidebarActiveRoute} = routeModule;
  const ensure = (condition,message)=>{if(!condition)throw new Error(message);};
  const ids = {
   tradelinkBoardId:'tl-board',
   fundTrackerBoardId:'frt-board',
   fueltrackBoardId:'fueltrack-board',
   timeTrackerBoardId:'tt-board',
   recentBoardIds:['ordinary-board']
  };
  const links = [
   {key:'overview',href:'#/overview',label:'Overview'},
   {key:'time-tracker',href:'#/time-tracker',label:'TimeTracker'},
   {key:'fund-tracker',href:'#/fund-tracker',label:'Fund Tracker'},
   {key:'fueltrack',href:'#/fueltrack',label:'FuelTrack+'},
   {key:'tradelink',href:'#/tradelink',label:'TradeLink'},
   {key:'talkbox',href:'#/talkbox',label:'TalkBox'},
   {key:'fm1',href:'#/fm1',label:'FM1 Ticketing'},
   {key:'paseo',href:'#/paseo',label:'Paseo de Lomboy'},
   {key:'order-intake',href:'#/order-intake',label:'Order Intake'},
   {key:'fueltrans',href:'#/fueltrans',label:'FuelTrans Support Portal'},
   {key:'daily-department-activity',href:'#/daily-department-activity',label:'Daily Department Activity'}
  ];
  const labels = Object.fromEntries(links.map(link=>[link.key,link.label]));
  const root = document.createElement('div');
  root.id = 'app';
  document.body.replaceChildren(root);
  let renderedIdentity = null;
  let renderedSidebarSignature = null;
  let selected = 'overview';

  function renderSidebar(){
   const markup = links.map(link=>{
    const active = selected===link.key;
    return '<a class="nav-link'+(active?' active':'')+'" style="display:block;height:24px" href="'+link.href+'"'+
     (active?' aria-current="page"':'')+'>'+link.label+'</a>';
   }).join('');
   return '<aside class="aps-sidebar"><div class="sidebar-nav-scroll" style="width:120px;height:72px;overflow:auto">'+markup+'</div></aside>';
  }

  function renderRoute(hash,{identity='user-1|workspace-1',sidebarSignature='catalog-v1',body=null}={}){
   selected = sidebarActiveRoute(hash,ids);
   const label = labels[selected]||selected||'Overview';
   const content = body||'<section data-application="'+selected+'"><h1 data-route-label>'+label+
    '</h1><input data-draft value="route draft"></section>';
   const existing = root.querySelector(':scope > .shell');
   const reusable = !!existing&&renderedIdentity===identity;
   if(reusable){
    updateExistingApplicationShell({
     existing,
     renderedSidebarSignature,
     sidebarSignature,
     renderSidebar,
     selectedNavigation:selected,
     breadcrumb:label,
     avatarMarkup:'<span>QA</span><img alt="" hidden />',
     body:content
    });
   }else{
    root.innerHTML='<div class="shell">'+renderSidebar()+
     '<main class="main"><header class="topbar"><div class="breadcrumb"><strong>'+label+
     '</strong></div><div class="top-actions"><a class="top-avatar"><span>QA</span><img alt="" hidden /></a></div></header>'+
     '<div class="main-content">'+content+'</div></main></div>';
   }
   renderedIdentity=identity;
   renderedSidebarSignature=sidebarSignature;
   return {reusable,selected,label};
  }

  history.replaceState(null,'',location.pathname+location.search+'#/overview');
  renderRoute('#/overview');
  const documentMarker = {};
  const documentTimeOrigin = performance.timeOrigin;
  const documentNavigationEntries = performance.getEntriesByType('navigation').length;
  const shellBefore = root.querySelector('.shell');
  const sidebarBefore = root.querySelector('.aps-sidebar');
  const headerBefore = root.querySelector('.topbar');
  const mainContentBefore = root.querySelector('.main-content');
  const navScroll = root.querySelector('.sidebar-nav-scroll');
  navScroll.scrollTop = 37;

  window.addEventListener('hashchange',()=>renderRoute(location.hash));
  async function navigate(hash){
   if(location.hash===hash)return;
   const changed = new Promise(resolve=>window.addEventListener('hashchange',resolve,{once:true}));
   location.hash = hash;
   await changed;
  }
  async function traverse(method,expected){
   const changed = new Promise(resolve=>window.addEventListener('hashchange',resolve,{once:true}));
   history[method]();
   await changed;
   ensure(location.hash===expected,method+' should restore '+expected);
  }

  const routeCases = [
   ['#/time-tracker','time-tracker'],
   ['#/fund-tracker','fund-tracker'],
   ['#/fueltrack/requests','fueltrack'],
   ['#/tradelink/documents','tradelink'],
   ['#/talkbox','talkbox'],
   ['#/fm1','fm1'],
   ['#/paseo','paseo'],
   ['#/order-intake','order-intake'],
   ['#/fueltrans/ticket/123','fueltrans'],
   ['#/daily-department-activity','daily-department-activity']
  ];
  const routeResults = [];
  for(const [hash,expected] of routeCases){
   await navigate(hash);
   const activeLinks = [...root.querySelectorAll('.aps-sidebar a.nav-link[aria-current="page"]')];
   ensure(selected===expected,hash+' should resolve to '+expected);
   ensure(activeLinks.length===1,hash+' should have exactly one active sidebar link');
   ensure(activeLinks[0].getAttribute('href')==='#/'+expected,hash+' should highlight the matching link');
   ensure(root.querySelector('.breadcrumb strong').textContent===labels[expected],hash+' should update the breadcrumb');
   ensure(root.querySelector('[data-route-label]')?.textContent===labels[expected],hash+' should update application content');
   ensure(root.querySelector('.shell')===shellBefore,hash+' replaced the CRM shell');
   ensure(root.querySelector('.aps-sidebar')===sidebarBefore,hash+' replaced the sidebar');
   ensure(root.querySelector('.topbar')===headerBefore,hash+' replaced the top navigation');
   ensure(root.querySelector('.main-content')===mainContentBefore,hash+' replaced the content host');
   ensure(navScroll.scrollTop===37,hash+' changed sidebar scroll position');
   routeResults.push({hash,selected,activeLinkCount:activeLinks.length});
  }

  await traverse('back','#/fueltrans/ticket/123');
  await traverse('forward','#/daily-department-activity');
  ensure(root.querySelector('.shell')===shellBefore,'history navigation replaced the shell');

  const draft = root.querySelector('[data-draft]');
  draft.value = 'unsaved local value';
  draft.focus();
  const pendingState = resolveApplicationLoadingState({
   pending:true,hasRenderedShell:true,isSignedIn:true,
   userId:'user-1',workspaceId:'workspace-1',
   renderedScope:'user-1|workspace-1'
  });
  ensure(pendingState==='retain-shell','same-scope pending read should retain the shell');
  ensure(root.querySelector('[data-draft]')===draft,'pending read replaced the active draft field');
  ensure(draft.value==='unsaved local value','pending read lost the draft value');
  ensure(document.activeElement===draft,'pending read lost input focus');

  const activeRead = {hash:'#/fund-tracker',userId:'user-1',workspaceId:'workspace-1'};
  const staleRead = {hash:'#/time-tracker',userId:'user-1',workspaceId:'workspace-1'};
  const activeContext = {currentHash:'#/fund-tracker',isSignedIn:true,userId:'user-1',workspaceId:'workspace-1'};
  ensure(isCurrentApplicationRouteRead(activeRead,activeRead,activeContext),'current route read was rejected');
  ensure(!isCurrentApplicationRouteRead(staleRead,activeRead,activeContext),'stale route response was accepted');
  ensure(!isCurrentApplicationRouteRead(activeRead,activeRead,{...activeContext,currentHash:'#/time-tracker'}),'stale hash was accepted');
  ensure(!isCurrentApplicationRouteRead(activeRead,activeRead,{...activeContext,workspaceId:'workspace-2'}),'stale workspace response was accepted');
  ensure(!isCurrentApplicationRouteRead(activeRead,activeRead,{...activeContext,userId:'user-2'}),'stale user response was accepted');

  const shellAfterHistory = root.querySelector('.shell');
  const headerAfterHistory = root.querySelector('.topbar');
  renderRoute(location.hash,{body:'<section role="alert" data-route-error><h2>Destination unavailable</h2></section>'});
  ensure(root.querySelector('.shell')===shellAfterHistory,'route error replaced the shell');
  ensure(root.querySelector('[data-route-error]'),'route error was not rendered inside the existing shell');

  const oldSidebar = root.querySelector('.aps-sidebar');
  root.querySelector('.sidebar-nav-scroll').scrollTop = 29;
  renderRoute(location.hash,{sidebarSignature:'catalog-v2'});
  ensure(root.querySelector('.shell')===shellAfterHistory,'sidebar refresh replaced the shell');
  ensure(root.querySelector('.topbar')===headerAfterHistory,'sidebar refresh replaced the header');
  ensure(root.querySelector('.aps-sidebar')!==oldSidebar,'changed sidebar catalog was not refreshed');
  ensure(root.querySelector('.sidebar-nav-scroll').scrollTop===29,'sidebar refresh lost scroll position');

  const oldScopedShell = root.querySelector('.shell');
  renderRoute('#/overview',{identity:'user-2|workspace-2'});
  ensure(root.querySelector('.shell')!==oldScopedShell,'identity/workspace transition reused the previous shell');
  ensure(!oldScopedShell.isConnected,'previous scope shell remained connected');

  ensure(performance.timeOrigin===documentTimeOrigin,'same-page route navigation changed document time origin');
  ensure(performance.getEntriesByType('navigation').length===documentNavigationEntries,'same-page route navigation created another document navigation');
  return {
   routeCases:routeResults.length,
   routeResults,
   backForward:'PASS',
   sameScopeShellRetained:true,
   sidebarCatalogRefreshPreservedScroll:true,
   scopeTransitionReplacedShell:true,
   pendingRead:'retain-shell',
   staleReadRejected:true,
   routeErrorStayedInShell:true,
   documentNavigationEntries,
   documentTimeOrigin
  };
 });

 assert.deepEqual(pageErrors,[],'Chromium reported page errors');
 assert.equal(result.routeCases,10);
 assert.equal(result.backForward,'PASS');
 assert.equal(result.sameScopeShellRetained,true);
 assert.equal(result.sidebarCatalogRefreshPreservedScroll,true);
 assert.equal(result.scopeTransitionReplacedShell,true);
 assert.equal(result.pendingRead,'retain-shell');
 assert.equal(result.staleReadRejected,true);
 assert.equal(result.routeErrorStayedInShell,true);
 console.log('CP_CRM_LOAD_01D_CHROMIUM_PASS ' + JSON.stringify({...result,pageErrors},null,2));
} finally {
 await browser?.close();
 await server.close();
}
