import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {renderTradeLinkApplication} from '../frontend/tradelink-application.js';
import {initialTradeLinkDraftView} from '../frontend/tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../frontend/tradelink-board-items.js';
const userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',workspaceId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const types=['esi','quotation','packing','delivery','payment','po'];
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},groups:[],items:[],columns:[]};
const profile=await mkdtemp(join(tmpdir(),'tl-autosave05-'));
const modules=Object.fromEntries(await Promise.all(['state','store','controller','ui'].map(async name=>['/draft-recovery-'+name+'.js',await readFile(new URL('../frontend/tradelink/draft-recovery-'+name+'.js',import.meta.url),'utf8')])));
const app=await readFile(new URL('../frontend/app.js',import.meta.url),'utf8');
const capture=app.slice(app.indexOf('function captureTradeLinkDraftFields(event)'),app.indexOf('/** Source financial calculation'));
const recovery=app.slice(app.indexOf('// Staged locally until restoration'),app.indexOf('function captureTradeLinkDraftFields(event)')).replace('const tradeLinkRecoveryEnabled=false','const tradeLinkRecoveryEnabled=true');
const runtime=`import {TradeLinkRecoveryController} from '/draft-recovery-controller.js';
import {captureRecoveryFields} from '/draft-recovery-state.js';
import {renderRecoveryChoices} from '/draft-recovery-ui.js';
const root=document.querySelector('main'),auth={userId:'${userId}',isSignedIn:true};
const state={tradeLinkDraft:{mode:'create'},context:{user_id:auth.userId,workspace_id:'${workspaceId}'}};
let routeSerial=1;
const tradeLinkDraftRoute=()=>true,tradeLinkCanCreate=()=>true,toast=message=>console.log('RECOVERY NOTICE',message);
const snapshotTradeLinkDraftLineItems=form=>[...form.querySelectorAll('[data-tradelink-line-item]')].map(row=>{const get=name=>row.querySelector('[name="'+name+'"]')?.value??'';return {id:get('lineId'),kind:get('lineKind'),description:get('lineDescription'),quantity:get('lineQuantity'),unitPrice:get('lineUnitPrice'),unit:get('lineUnit'),serialNumber:get('lineSerialNumber')};});
const updateTradeLinkDraftLocalSummary=()=>{},updateTradeLinkDraftInputCurrencyLabels=()=>{},updateTradeLinkDraftLocalAmounts=()=>{},updateTradeLinkLineRowTotals=()=>{};
const render=()=>paintTradeLinkRecoveryStatus();
${recovery}
${capture}
root.addEventListener('input',captureTradeLinkDraftFields);
root.addEventListener('change',captureTradeLinkDraftFields);
window.qa={state,store:tradeLinkRecovery.store,controller:tradeLinkRecovery,refresh:refreshTradeLinkRecoveryChoices,resume:selectTradeLinkRecovery,checkpoint:()=>tradeLinkRecovery.flush(tradeLinkRecoveryEditor.id),id:()=>tradeLinkRecoveryEditor?.id,next:async()=>{document.activeElement?.blur();if(tradeLinkRecoveryEditor)await tradeLinkRecovery.flush(tradeLinkRecoveryEditor.id);tradeLinkRecoveryEditor=null;routeSerial++;state.tradeLinkDraft={mode:'create'};}};
`;
let context,unexpected=0;
async function launch(){
 context=await chromium.launchPersistentContext(profile,{headless:true});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='http://localhost'){unexpected++;return route.abort();}
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><main></main><script type="module" src="/runtime.js"></script>'});
  if(url.pathname==='/runtime.js')return route.fulfill({contentType:'text/javascript',body:runtime});
  if(modules[url.pathname])return route.fulfill({contentType:'text/javascript',body:modules[url.pathname]});
  return route.abort();
 });
 const page=context.pages()[0]||await context.newPage();page.on('pageerror',e=>console.log('PAGE ERROR',e.message));await page.goto('http://localhost');await page.waitForFunction(()=>!!window.qa);return page;
}
function markup(type,formValues=null){return renderTradeLinkApplication({detail,workspaceId,section:'drafts',draftView:formValues?{...initialTradeLinkDraftView(type),formValues}:initialTradeLinkDraftView(type),canManage:true});}
async function show(page,type,fields=null){await page.locator('body > main').evaluate((el,html)=>{el.innerHTML=html;},markup(type,fields));}
try{
 let page=await launch();const ids={};
 for(const type of types){
  await show(page,type);await page.locator('[name=customerName]').fill('Disposable '+type);
  await page.locator('[name=remarks]').fill('Preserve '+type);
  if(type==='quotation'){
   await page.locator('[name=customerAddress]').fill('  12 QA Street\nCebu City  ');
   for(const [key,standard,custom] of [['paymentTerms','30 Days Net','  40% deposit  '],['validity','30 Days','2027-01-15'],['deliveryCommitment','4 Weeks','Within 10 working days']]){
    const select=page.locator('select[name='+key+']'),input=page.locator('input[name='+key+'Custom]');
    assert.equal(await input.isVisible(),false);
    await select.selectOption('__custom__');assert.equal(await input.isVisible(),true);
    await input.fill(custom);
    await select.selectOption(standard);assert.equal(await input.isVisible(),false);
    await select.selectOption('__custom__');assert.equal(await input.inputValue(),custom);
   }
  }
  await page.waitForFunction(()=>document.querySelector('[data-tradelink-recovery-status]').textContent==='Inputs preserved on this device.',null,{timeout:4000}).catch(async e=>{console.log(await page.evaluate(()=>({secure:isSecureContext,uuid:typeof crypto.randomUUID,id:window.qa.id(),status:document.querySelector('[data-tradelink-recovery-status]')?.textContent,fields:window.qa.state.tradeLinkDraft.formValues,entries:[...window.qa.controller.entries.values()].map(e=>({status:e.status,version:e.version}))})));throw e;});
  const rows=await page.evaluate(async ({userId,workspaceId,type})=>window.qa.store.list(userId,workspaceId,type),{userId,workspaceId,type});
  assert.equal(rows.length,1);assert.equal(rows[0].fields.remarks,'Preserve '+type);ids[type]=rows[0].instanceId;
  await page.evaluate(()=>window.qa.next());
  console.log('PASS feature-enabled input and IndexedDB checkpoint '+type);
 }
 await show(page,'quotation');
 await page.locator('[name=customerName]').fill('Pending save fixture');
 const pendingId=await page.evaluate(async ()=>{
  const id=window.qa.id();
  const command={documentId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',expectedRevision:0,draft:{documentType:'quotation',customerName:'Pending save fixture'},initialState:'for-approval',reviseApproved:false};
  if(!await window.qa.controller.checkpointSave(id,{command,receipt:null,uncertain:true}))throw Error('checkpoint failed');
  return id;
 });
 await context.close();context=null;page=await launch();
 for(const type of types){
  await show(page,type);await page.evaluate(()=>window.qa.refresh());
  await page.locator('[data-action=tradelink-recovery-resume][data-id="'+ids[type]+'"]').waitFor();
  await page.evaluate(id=>window.qa.resume(id),ids[type]);
  const state=await page.evaluate(()=>window.qa.state.tradeLinkDraft);
  assert.equal(state.formValues.remarks,'Preserve '+type);
  if(type==='quotation'){
   assert.equal(state.formValues.customerAddress,'  12 QA Street\nCebu City  ');
   await show(page,type,state.formValues);
   for(const [key,custom] of [['paymentTerms','  40% deposit  '],['validity','2027-01-15'],['deliveryCommitment','Within 10 working days']]){
    assert.equal(await page.locator('select[name='+key+']').inputValue(),'__custom__');
    const input=page.locator('input[name='+key+'Custom]');
    assert.equal(await input.isVisible(),true);assert.equal(await input.inputValue(),custom);
   }
   console.log('PASS all three custom dropdown values restore visibly after browser restart');
  }
  assert.equal(await page.evaluate(()=>window.qa.id()),ids[type]);
  await page.evaluate(()=>window.qa.next());
 }
 await show(page,'quotation');await page.evaluate(()=>window.qa.refresh());
 await page.locator('[data-action=tradelink-recovery-resume][data-id="'+pendingId+'"]').waitFor();
 assert.equal(await page.locator('[data-action=tradelink-recovery-remove][data-id="'+pendingId+'"]').count(),0);
 await page.evaluate(id=>window.qa.resume(id),pendingId);
 const pending=await page.evaluate(()=>window.qa.state.tradeLinkDraft.pendingSave);
 assert.equal(pending.command.documentId,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 assert.equal(pending.uncertain,true);
 await page.evaluate(async ()=>{
  const pending=window.qa.state.tradeLinkDraft.pendingSave;
  if(!await window.qa.controller.checkpointSave(window.qa.id(),{...pending,receipt:{documentId:pending.command.documentId,boardItemId:'ffffffff-ffff-4fff-8fff-ffffffffffff',revision:1,documentNumber:'Q-QA'}}))throw Error('receipt checkpoint failed');
 });
 await context.close();context=null;page=await launch();await show(page,'quotation');await page.evaluate(()=>window.qa.refresh());await page.evaluate(id=>window.qa.resume(id),pendingId);
 assert.equal(await page.evaluate(()=>window.qa.state.tradeLinkDraft.pendingSave.receipt.documentNumber),'Q-QA');
 // Two independent tabs use the same persistent browser profile.
 const second=await context.newPage();await second.goto('http://localhost');await second.waitForFunction(()=>!!window.qa);
 await page.evaluate(()=>window.qa.next());await show(page,'esi');await show(second,'esi');
 await page.locator('[name=customerName]').fill('Tab A independent');
 await second.locator('[name=customerName]').fill('Tab B independent');
 await Promise.all([page.evaluate(()=>window.qa.checkpoint()),second.evaluate(()=>window.qa.checkpoint())]);
 const a=await page.evaluate(()=>window.qa.id()),b=await second.evaluate(()=>window.qa.id());assert.notEqual(a,b);
 const rows=await page.evaluate(async ({userId,workspaceId})=>window.qa.store.list(userId,workspaceId,'esi'),{userId,workspaceId});
 assert.ok(rows.some(r=>r.instanceId===a&&r.fields.customerName==='Tab A independent'));
 assert.ok(rows.some(r=>r.instanceId===b&&r.fields.customerName==='Tab B independent'));
 console.log('PASS independent creation instances in two tabs');
 await page.evaluate(()=>window.qa.next());await second.evaluate(()=>window.qa.next());
 await show(page,'esi');await show(second,'esi');
 await Promise.all([page.evaluate(()=>window.qa.refresh()),second.evaluate(()=>window.qa.refresh())]);
 await Promise.all([page.evaluate(id=>window.qa.resume(id),a),second.evaluate(id=>window.qa.resume(id),a)]);
 for(const tab of [page,second]){
  const actual=await tab.evaluate(()=>({id:window.qa.id(),entries:[...window.qa.controller.entries.values()].map(e=>({id:e.identity.instanceId,version:e.version})),mode:window.qa.state.tradeLinkDraft.mode}));
  console.log('COMPETING BASE',JSON.stringify(actual));
  assert.equal(actual.id,a);
  assert.equal(actual.entries.find(e=>e.id===a)?.version,1);
 }
 await page.locator('[name=customerName]').fill('Tab A version update');
 await second.locator('[name=customerName]').fill('Tab B competing update');
 const results=await Promise.all([page.evaluate(()=>window.qa.checkpoint()),second.evaluate(()=>window.qa.checkpoint())]);
 console.log('COMPETING RESULTS',JSON.stringify(results));
 assert.equal(results.filter(Boolean).length,1);
 const winner=await page.evaluate(async ({userId,workspaceId,a})=>(await window.qa.store.list(userId,workspaceId,'esi')).find(r=>r.instanceId===a),{userId,workspaceId,a});
 assert.equal(winner.version,2);
 assert.equal(winner.fields.customerName,results[0]?'Tab A version update':'Tab B competing update');
 const loser=results[0]?second:page;
 assert.match(await loser.locator('[data-tradelink-recovery-status]').textContent(),/failed/);
 console.log('PASS concurrent same-instance writes reject stale version without silent overwrite');
 const winningTab=results[0]?page:second;
 const originalVersion=winner.version;
 await winningTab.evaluate(()=>window.qa.checkpoint());
 await winningTab.waitForTimeout(1200);
 const idleVersion=await winningTab.evaluate(()=>window.qa.controller.entries.get(window.qa.id()).version);
 assert.equal(idleVersion,originalVersion);
 console.log('PASS idle and unchanged checkpoint suppression');
 assert.equal(unexpected,0);console.log('PASS six-module restoration state, original command and receipt across two browser restarts; zero external requests');
}finally{if(context)await context.close();await rm(profile,{recursive:true,force:true});}
