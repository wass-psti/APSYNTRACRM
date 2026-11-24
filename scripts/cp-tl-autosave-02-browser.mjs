import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {renderTradeLinkApplication} from '../frontend/tradelink-application.js';
import {initialTradeLinkDraftView} from '../frontend/tradelink-draft-workspace.js';
import {TRADELINK_BOARD_ID} from '../frontend/tradelink-board-items.js';
const userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const workspaceId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const types=['esi','quotation','packing','delivery','payment','po'];
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:workspaceId,name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'},groups:[],items:[],columns:[]};
const profile=await mkdtemp(join(tmpdir(),'tl-autosave-02-'));
const origin='http://recovery.test';
let context;
let unexpected=0;
const modules=Object.fromEntries(await Promise.all(['draft-recovery-state','draft-recovery-store'].map(async name=>[name,await readFile(new URL('../frontend/tradelink/'+name+'.js',import.meta.url),'utf8')])));
async function launch(){
 context=await chromium.launchPersistentContext(profile,{headless:true});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===origin&&url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main></main></body></html>'});
  const name=url.pathname.slice(1,-3);
  if(url.origin===origin&&Object.hasOwn(modules,name))return route.fulfill({contentType:'text/javascript',body:modules[name]});
  unexpected++;return route.abort();
 });
 const page=context.pages()[0]||await context.newPage();
 await page.goto(origin);
 return page;
}
function render(type,fields=null,lines=null){
 const view=initialTradeLinkDraftView(type);
 if(fields)view.formValues=fields;
 if(lines)view.lineDrafts=lines;
 return renderTradeLinkApplication({detail,workspaceId,section:'drafts',draftView:view,canManage:true});
}
try{
 let page=await launch();
 const snapshots=[];
 for(const [index,type] of types.entries()){
  await page.locator('body > main').evaluate((el,html)=>{el.innerHTML=html;},render(type,null,type==="payment"?null:[{id:"line-1",kind:"item",description:"First",quantity:"2",unitPrice:"5",unit:"pc"},{id:"line-2",kind:"note",description:"Note"},{id:"line-3",kind:"item",description:"Last",quantity:"3",unitPrice:"7",unit:"pc"}]));
  const snapshot=await page.evaluate(async ({userId,workspaceId,type,index})=>{
   const state=await import('/draft-recovery-state.js');
   const {TradeLinkRecoveryStore}=await import('/draft-recovery-store.js');
   const form=document.querySelector('[data-tradelink-draft-form]');
   const missing=[...new FormData(form).keys()].filter(k=>!state.RECOVERY_FIELDS.includes(k)&&!['lineId','lineKind'].includes(k));
   if(missing.length)throw Error('Missing capture fields: '+missing.join(','));
   for(const el of form.elements){
    if(!el.name||el.disabled||el.readOnly||el.type==='hidden'||el.type==='button'||el.name==='documentType')continue;
    if(el.tagName==='SELECT'){const allowed=[...el.options].filter(o=>!o.disabled);if(allowed.length)el.value=allowed.at(-1).value;}
    else if(el.type==='date')el.value='2026-11-27';
    else if(el.type==='number')el.value='123.45';
    else if(el.type==='email')el.value='incomplete@';
    else el.value='  QA '+el.name+' Ω  ';
   }
   const fields=state.captureRecoveryFields(new FormData(form));
   const lines=[...form.querySelectorAll('[data-tradelink-line-item]')].map(row=>{
    const get=name=>row.querySelector('[name="'+name+'"]')?.value??'';
    return {id:get('lineId'),kind:get('lineKind'),description:get('lineDescription'),quantity:get('lineQuantity'),unitPrice:get('lineUnitPrice'),unit:get('lineUnit'),serialNumber:get('lineSerialNumber')};
   });
   const snapshot=state.createRecoverySnapshot({userId,workspaceId,documentType:type,instanceId:'cccccccc-cccc-4ccc-8ccc-'+String(index+1).padStart(12,'0'),fields,lines});
   await new TradeLinkRecoveryStore().save(snapshot);
   return snapshot;
  },{userId,workspaceId,type,index});
  snapshots.push(snapshot);
  await page.reload();
  const restored=await page.evaluate(async ({userId,workspaceId,type})=>{
   const {TradeLinkRecoveryStore}=await import('/draft-recovery-store.js');
   return (await new TradeLinkRecoveryStore().list(userId,workspaceId,type))[0];
  },{userId,workspaceId,type});
  assert.deepEqual(restored,snapshot);
  await page.locator('body > main').evaluate((el,html)=>{el.innerHTML=html;},render(type,restored.fields,restored.lines));
  const fields=await page.evaluate(async ()=>{const {captureRecoveryFields}=await import('/draft-recovery-state.js');return captureRecoveryFields(new FormData(document.querySelector('[data-tradelink-draft-form]')));});
  assert.deepEqual(fields,snapshot.fields,'Renderer round trip '+type);
  const lines=await page.evaluate(()=>[...document.querySelectorAll('[data-tradelink-line-item]')].map(row=>{
   const get=name=>row.querySelector('[name="'+name+'"]')?.value??'';
   return {id:get('lineId'),kind:get('lineKind'),description:get('lineDescription'),quantity:get('lineQuantity'),unitPrice:get('lineUnitPrice'),unit:get('lineUnit'),serialNumber:get('lineSerialNumber')};
  }));
  assert.deepEqual(lines,snapshot.lines,'Ordered line round trip '+type);
  console.log('PASS module round trip '+type+' fields='+Object.keys(fields).length+' lines='+snapshot.lines.length);
 }
 await context.close();context=null;
 page=await launch();
 const result=await page.evaluate(async ({userId,workspaceId,snapshots})=>{
  const {TradeLinkRecoveryStore,RECOVERY_LIMIT}=await import('/draft-recovery-store.js');
  const {createRecoverySnapshot}=await import('/draft-recovery-state.js');
  const store=new TradeLinkRecoveryStore(),other=new TradeLinkRecoveryStore();
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  for(const s of snapshots)check(JSON.stringify((await store.list(userId,workspaceId,s.documentType))[0])===JSON.stringify(s),'Restart mismatch');
  check((await store.list('dddddddd-dddd-4ddd-8ddd-dddddddddddd',workspaceId,'quotation')).length===0,'User isolation');
  check((await store.list(userId,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','quotation')).length===0,'Workspace isolation');
  const base=snapshots[1];
  let malformed=false;try{await store.save({...base,fields:{...base.fields,unknown:'invalid'}});}catch{malformed=true;}
  check(malformed,'Malformed snapshot');
  let unhandled=0;
  const onUnhandled=()=>{unhandled++;};
  window.addEventListener('unhandledrejection',onUnhandled);
  const original=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){const request=original.apply(this,args);this.transaction.abort();return request;};
  let aborted=false;
  try{await store.save({...base,version:2});}catch{aborted=true;}
  finally{IDBObjectStore.prototype.put=original;}
  await new Promise(resolve=>setTimeout(resolve,50));
  window.removeEventListener('unhandledrejection',onUnhandled);
  check(aborted&&unhandled===0,'Transaction abort handling');
  check((await store.list(userId,workspaceId,'quotation'))[0].version===1,'Aborted write rollback');
  const copy=createRecoverySnapshot({...base,instanceId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'});
  await store.save(copy);
  check((await store.list(userId,workspaceId,'quotation')).length===2,'Instance isolation');
  const race=await Promise.allSettled([store.save({...base,version:2}),other.save({...base,version:2})]);
  check(race.filter(x=>x.status==='fulfilled').length===1,'Concurrent conflict');
  check(!(await store.remove(userId,workspaceId,'quotation',base.instanceId,1)),'Stale delete');
  check(await store.remove(userId,workspaceId,'quotation',base.instanceId,2),'Current delete');
  for(let i=6;i<RECOVERY_LIMIT;i++)await store.save(createRecoverySnapshot({...base,instanceId:'ffffffff-ffff-4fff-8fff-'+String(i).padStart(12,'0')}));
  let full=false;try{await store.save(createRecoverySnapshot({...base,instanceId:'11111111-1111-4111-8111-111111111111'}));}catch(e){full=/full/.test(e.message);}
  check(full,'Capacity rejection');
  let unavailable=false;try{await new TradeLinkRecoveryStore({idb:null}).list(userId,workspaceId,'quotation');}catch(e){unavailable=/unavailable/.test(e.message);}
  check(unavailable,'Unavailable storage');
  return {restart:6,isolation:true,concurrency:true,capacity:RECOVERY_LIMIT,unavailable:true};
 },{userId,workspaceId,snapshots});
 console.log('PASS '+JSON.stringify(result));
 assert.equal(unexpected,0);
 console.log('PASS zero external requests');
}finally{if(context)await context.close();await rm(profile,{recursive:true,force:true});}
