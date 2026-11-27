// Repository-hosted static asset + Chromium fixture; no real credentials or production traffic.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
import {fixture,workspaceId,userId,boardId} from './fixtures/cp-ms-crm-03-fixture.mjs';
const cwd=process.cwd();
const html='<!doctype html><html lang="en" data-aps-monday-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/frontend/apsyntra-styles.bundle.css"></head><body><div id="app"><div class="shell"><aside class="aps-sidebar"><nav><a href="#/overview">Overview</a></nav></aside><main class="main aps-board-shell"><header class="topbar"><div class="breadcrumb"><strong>Material Request Hub</strong></div></header><div class="main-content"></div></main></div></div></body></html>';
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  const path=decodeURIComponent(new URL(req.url,'http://fixture.invalid').pathname);
  if(path==='/'){res.writeHead(200,{'content-type':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; style-src-attr 'none'; img-src 'self' data:; connect-src 'self'; object-src 'none'"});res.end(html);return;}
  const file=resolve(cwd,'.'+path);
  if(!file.startsWith(cwd+sep)||!mime[extname(file)])throw Error('invalid path');
  res.writeHead(200,{'content-type':mime[extname(file)]});res.end(await readFile(file));
 }catch{if(!res.headersSent)res.writeHead(404);res.end();}
});
let browser;
const results=[];
const visualDir=process.env.MS_VISUAL_DIR;
if(visualDir)await mkdir(visualDir,{recursive:true});
const check=(condition,name)=>{assert.ok(condition,name);results.push(name);console.log('PASS '+name);};
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[],foreign=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin+'/')&&!r.url().startsWith('data:'))foreign.push(r.url());});
 await page.goto(origin+'/#/boards/'+boardId+'/sourcing');
 await page.evaluate(async({detail,workspaceId,userId,boardId})=>{
  const native=await import('/frontend/apps/MaterialSourcing/native-screen.js');
  const host=document.querySelector('.main-content');
  const initial=document.querySelectorAll('link[rel="stylesheet"]').length;
  const styles=native.ensureNativeMaterialSourcingStyles(document);
  if(initial!==1||styles!==native.ensureNativeMaterialSourcingStyles(document))throw Error('Native style delivery is not isolated');
  if(!styles.sheet)await new Promise((resolve,reject)=>{styles.addEventListener('load',resolve,{once:true});styles.addEventListener('error',reject,{once:true});});
  let active=true,deny=false,delay=null,reads=0,empty=false,filters={};
  const auth={isSignedIn:true,userId,getVerifiedUser:async()=>({id:auth.userId})};
  const api={context:async()=>({user_id:userId,workspace_id:workspaceId,profile:{status:'active'}}),
   allowed:async()=>!deny,rpc:async(name,args)=>{
    if(name!=='mrh_sourcing_board_viewer_read'||args.p_board_id!==boardId)throw Error('wrong signed read');
    reads++;if(delay)await delay.promise;
    if(empty)return {};
    return {'Buying Price':{value:123.45,revision:1},'Currency':{value:'USD',revision:1},'Vendor Details':{value:'<synthetic vendor>',revision:1},'Selling Price (VAT-EX)':{value:190,revision:2}};
   }};
  const render=(nextFilters=filters,options={})=>{filters=nextFilters;host.innerHTML=native.renderNativeMaterialSourcing(detail,filters,new Date('2026-11-27T12:00:00Z'),{workspaceId,canCreate:true,...options});};
  host.addEventListener('click',e=>{
   const button=e.target.closest('button[data-action]');if(!button)return;
   if(button.dataset.action==='mrh-native-source'){
    render({...filters,source:filters.source===button.dataset.source?'all':button.dataset.source});
   }
   if(button.dataset.action==='mrh-native-sort')native.sortNativeMaterials(button);
   if(button.dataset.action==='mrh-native-commercial')void native.loadNativeCommercialRow(button,{api,auth,workspaceId,boardId,isCurrent:()=>active&&auth.isSignedIn&&auth.userId===userId});
   if(button.dataset.action==='mrh-add-view')render({}, {view:'add'});
   if(button.dataset.action==='mrh-show-items')render();
  });
  host.addEventListener('change',e=>{if(e.target.id==='mrh-tracker-source')render({...filters,source:e.target.value});});
  window.msFixture={render,empty:()=>{empty=true;},deny:()=>{deny=true;},allow:()=>{deny=false;},reads:()=>reads,
   delay:()=>{let resolve;const promise=new Promise(r=>resolve=r);delay={promise,resolve};},release:()=>{delay.resolve();delay=null;},
   leave:()=>{active=false;host.innerHTML='<h1>Overview</h1>';},return:()=>{active=true;render();}};
  render();
 },{detail:fixture(),workspaceId,userId,boardId});
 const rows=page.locator('tr[data-ms-item]');
 check(await page.locator('link[rel="stylesheet"]').count()===2,'single startup bundle plus one route-scoped stylesheet');
 check(await rows.count()===3,'native projection displays all three synthetic UUID records');
 check(await page.locator('thead th[data-ms-col]').count()===24,'24 reference columns');
 check(await page.evaluate(()=>window.msFixture.reads())===0,'no commercial calls on initial render');
 if(visualDir)await page.screenshot({path:resolve(visualDir,'native-desktop-light.png'),fullPage:true});
 await page.locator('[data-action="mrh-native-source"][data-source="Local"]').click();
 check(await rows.count()===1&&(await rows.first().innerText()).includes('SYNTHETIC-B'),'reference Local card filters the list');
 await page.locator('[data-action="mrh-native-source"][data-source="Local"]').click();
 check(await rows.count()===3,'same card clears source filter');
 await page.locator('#mrh-tracker-source').selectOption('Unknown');
 check(await rows.count()===1&&(await rows.first().innerText()).includes('SYNTHETIC-C'),'unspecified filter matches loaded record');
 await page.locator('#mrh-tracker-source').selectOption('all');
 await page.getByRole('button',{name:'Sort by Part number',exact:true}).click();
 check((await rows.first().innerText()).includes('SYNTHETIC-A'),'public sorting works');
 const first=rows.first(),load=first.getByRole('button',{name:/Load commercial values/});
 await load.click();await first.getByText('Stored values loaded').waitFor();
 check(await first.locator('[data-ms-commercial="buyingPrice"]').textContent()==='123.45','existing signed reader populates selected row');
 check(await first.locator('[data-ms-commercial="vendor"]').textContent()==='<synthetic vendor>','commercial text is inert');
 check(await rows.nth(1).locator('[data-ms-commercial="buyingPrice"]').textContent()==='—','other row remains unloaded');
 check(await first.locator('[data-ms-col="totalLanded"]').textContent()==='—','derived values never fabricated');
 await page.evaluate(()=>window.msFixture.deny());await load.click();await first.getByText('Commercial values unavailable. Retry.').waitFor();
 check(await first.locator('[data-ms-commercial="buyingPrice"]').textContent()==='—','failed reload clears previously displayed value');
 await page.evaluate(()=>{window.msFixture.allow();window.msFixture.delay();});
 await load.click();await page.waitForFunction(()=>window.msFixture.reads()===2);
 await page.evaluate(()=>{window.msFixture.leave();window.msFixture.release();});
 await page.getByRole('heading',{name:'Overview'}).waitFor();
 check(await page.locator('.ms-native-sourcing').count()===0,'navigation discards delayed read and row');
 await page.evaluate(()=>window.msFixture.return());
 check(await rows.first().locator('[data-ms-commercial="buyingPrice"]').textContent()==='—','return does not cache commercial data');
 await page.evaluate(()=>window.msFixture.empty());
 await rows.first().getByRole('button',{name:/Load commercial values/}).click();
 await rows.first().getByText('Signed read verified; no stored commercial values.').waitFor();
 check(await rows.first().locator('[data-ms-commercial="buyingPrice"]').textContent()==='—','successful empty signed response is not an unavailable read');
 await page.getByRole('button',{name:/Add Material/}).click();
 check(await page.locator('#mrh-add-material-form').isVisible(),'existing add form reachable');
 check(await page.locator('.ms-native-metrics').isVisible(),'reference dashboard remains visible in Add Material');
 check(await page.locator('.ms-native-header [data-action="refresh-board"]').count()===0,'Add Material does not expose a refresh action that could discard an unsaved form');
 if(visualDir)await page.screenshot({path:resolve(visualDir,'native-add-light.png'),fullPage:true});
 await page.getByRole('button',{name:/All items/i}).click();
 check(await rows.count()===3,'existing return to list');
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:900});
  const layout=await page.evaluate(()=>{const host=document.querySelector('.ms-native-sourcing'),scroller=host.querySelector('.ms-native-table-scroll');return {host:host.getBoundingClientRect().width,scroll:scroller.scrollWidth,client:scroller.clientWidth,document:document.documentElement.scrollWidth,viewport:innerWidth};});
  check(layout.host<=width&&layout.scroll>layout.client&&layout.document<=width+1,'contained horizontal scroll at '+width+'px');
 }
 const narrowMetricColumns=await page.locator('.ms-native-metrics').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length);
 check(narrowMetricColumns===1,'narrow CRM content uses one readable metric column');
 if(visualDir)await page.screenshot({path:resolve(visualDir,'native-mobile-320-light.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 if(visualDir)await page.screenshot({path:resolve(visualDir,'native-mobile-light.png'),fullPage:true});
 const before=await page.locator('.ms-native-metric').first().evaluate(n=>getComputedStyle(n).backgroundColor);
 await page.evaluate(()=>document.documentElement.dataset.apsMondayTheme='dark');
 const after=await page.locator('.ms-native-metric').first().evaluate(n=>getComputedStyle(n).backgroundColor);
 check(before!==after,'CRM dark theme applied');
 check(await page.evaluate(()=>document.documentElement.dataset.apsMondayTheme)==='dark','screen does not replace CRM theme');
 const colors=await page.locator('.ms-native-tabs [data-action="mrh-add-view"]').evaluate(n=>{
  const color=getComputedStyle(n).color,background=getComputedStyle(n.parentElement).backgroundColor;
  const luminance=value=>{const rgb=value.match(/\d+(?:\.\d+)?/g).slice(0,3).map(x=>Number(x)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
  const a=luminance(color),b=luminance(background);return {ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),color,background};
 });
 check(colors.ratio>=4.5,'dark inactive navigation text contrast '+colors.ratio.toFixed(2)+':1');
 const exportColor=await page.locator('.mrh-export-csv').evaluate(n=>getComputedStyle(n).backgroundColor);
 check(exportColor==='rgb(28, 36, 50)','dark CSV control uses native surface');

 if(visualDir)await page.screenshot({path:resolve(visualDir,'native-mobile-dark.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:900});
 if(visualDir)await page.screenshot({path:resolve(visualDir,'native-desktop-dark.png'),fullPage:true});
 await page.getByRole('button',{name:/Add Material/}).click();
 const formColors=await page.locator('#mrh-add-material-form').evaluate(n=>({background:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color}));
 check(formColors.background==='rgb(28, 36, 50)'&&formColors.color==='rgb(229, 237, 249)','existing Add Material form follows CRM dark theme');
 if(visualDir)await page.screenshot({path:resolve(visualDir,'native-add-dark.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(foreign,[]);
 // Real browser storage and Web Locks; only the server/auth transport is synthetic.
 const profile=await mkdtemp(resolve(tmpdir(),'mrh-recovery-'));
 let recoveryContext,releaseWrite,enterWrite;
 const entered=new Promise(resolve=>{enterWrite=resolve;});
 const release=new Promise(resolve=>{releaseWrite=resolve;});
 const req='77777777-7777-4777-8777-777777777777';
 const other='88888888-8888-4888-8888-888888888888';
 const recoveryDetail=fixture(),target=recoveryDetail.items[0];
 const key='apsyntra.mrh.create.v1:'+userId+':'+workspaceId;
 let writes=0,committed=false;
 const launch=async()=>{
  const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_BIN||undefined,
   headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  await context.exposeBinding('mrhRecoveryRpc',async(_source,name,args)=>{
   if(name==='mrh_create_material_atomic'){
    assert.equal(args.p_request_id,req);writes++;committed=true;enterWrite();
    await release;throw Error('synthetic lost response');
   }
   if(name==='mrh_material_create_receipt'){
    assert.equal(args.p_request_id,req);
    return committed?{request_id:req,status:'committed',item_id:target.id}:{request_id:req,status:'unresolved'};
   }
   throw Error('Unexpected recovery RPC '+name);
  });
  return context;
 };
 const install=async tab=>{
  await tab.goto(origin+'/');
  await tab.evaluate(async({detail,workspaceId,userId,title})=>{
   const m=await import('/frontend/material-sourcing-atomic-create.js');
   const auth={isSignedIn:true,userId,getVerifiedUser:async()=>({id:userId})};
   const api={context:async()=>({user_id:userId,workspace_id:workspaceId,profile:{status:'active'}}),
    allowed:async()=>true,board:async()=>detail,rpc:async(name,args)=>
     name==='material_request_hub_bootstrap'?{workspaceId,role:'ADMIN'}:window.mrhRecoveryRpc(name,args)};
   const options={api,auth,workspaceId};
   window.mrhRecoveryFixture={
    submit:async newRequestId=>{try{
     return await m.createMaterialWithRecovery({...options,form:{},formRequestId:null,newRequestId,
      plan:{partNumber:title,ordinary:[],protectedValues:[{name:'Buying Price',value:987.65}]}});
    }catch(error){return {error:error.message};}},
    recover:()=>m.recoverMaterialCreation(options)
   };
  },{detail:recoveryDetail,workspaceId,userId,title:target.title});
 };
 try{
  recoveryContext=await launch();
  const one=recoveryContext.pages()[0]||await recoveryContext.newPage();
  const two=await recoveryContext.newPage();
  await install(one);await install(two);
  check(await one.evaluate(()=>!!navigator.locks?.request),'real browser supports scoped Web Locks');
  const first=one.evaluate(id=>window.mrhRecoveryFixture.submit(id),req);
  await Promise.race([entered,first.then(result=>{throw Error('create never reached backend: '+JSON.stringify(result));})]);
  const competing=two.evaluate(id=>window.mrhRecoveryFixture.submit(id),other);
  await two.waitForFunction(async key=>(await navigator.locks.query()).pending.some(lock=>lock.name===key),key);
  releaseWrite();
  check(/lost response/.test((await first).error),'lost creation response retained in real browser');
  check(/Recover previous save/.test((await competing).error)&&writes===1,'second tab waits then does not duplicate unresolved create');
  check(await two.evaluate(key=>localStorage.getItem(key),key)===req,'shared storage contains only opaque request UUID');
  await one.reload();
  check(await one.evaluate(key=>localStorage.getItem(key),key)===req,'reload preserves opaque operation identifier');
  await recoveryContext.close();recoveryContext=null;
  recoveryContext=await launch();
  const reopened=recoveryContext.pages()[0]||await recoveryContext.newPage();
  await install(reopened);
  check(await reopened.evaluate(key=>localStorage.getItem(key),key)===req,'persistent browser restart preserves operation identifier');
  const recovered=await reopened.evaluate(()=>window.mrhRecoveryFixture.recover());
  check(recovered.status==='committed'&&recovered.itemId===target.id&&writes===1,'restarted browser resolves prior commit with zero duplicate writes');
  check(await reopened.evaluate(key=>localStorage.getItem(key),key)===null,'confirmed receipt clears only its recovery marker');
  console.log('CP_MS_CRM_04A3_BROWSER_RECOVERY_PASS');
 }finally{
  releaseWrite();await recoveryContext?.close();await rm(profile,{recursive:true,force:true});
 }
 console.log('CP_MS_CRM_03_BROWSER_PASS '+results.length+' checks; no uncaught errors or external traffic');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
