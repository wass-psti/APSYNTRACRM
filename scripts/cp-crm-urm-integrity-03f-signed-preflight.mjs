#!/usr/bin/env node
/** Read-only signed 03F preflight: no role writes, token capture, or native navigation. */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assessAdminEmployeePair } from './cp-crm-urm-integrity-03-signed-native.mjs';
const UUID=/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,16);
export function classifySigned03F(entries){
 const valid=entries.filter(x=>x.signed===true&&x.active===true&&UUID.test(x.workspaceId||'')&&/^[a-f0-9]{16}$/.test(x.accountKey||'')&&x.workspaceMatch===true);
 const unique=[...new Set(valid.map(x=>x.accountKey))];
 const pair=unique.length===2?assessAdminEmployeePair(valid,unique):{status:'BLOCKED',reason:'Exactly two independent matching signed accounts required'};
 return {status:pair.status,reason:pair.reason,accounts:valid.map(x=>({accountKey:x.accountKey,workspaceKey:hash(x.workspaceId),role:x.access?.effectivePlatformRole||null})),permissionWrites:0,businessWrites:0,mutationPerformed:false};
}
const options=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')&&x.includes('=')).map(x=>x.slice(2).split(/=(.*)/s).slice(0,2)));
async function run(){
 const url=options['cdp-url'];
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||'')) throw Error('Loopback CDP URL required');
 const { chromium }=await import('playwright');
 const browser=await chromium.connectOverCDP(url);
 const records=[];
 try{
  for(const context of browser.contexts())for(const page of context.pages()){
   if(!/^https:\/\/wass-psti\.github\.io\/APSYNTRACRM\//.test(page.url()))continue;
   const responses=[],pending=[];
   const handle=response=>{
    const name=response.url().match(/\/rest\/v1\/rpc\/(wm_auth_access_context|apsyntra_crm_my_effective_access)(?:\?|$)/)?.[1];
    if(!name)return;
    const row={name,status:response.status()};responses.push(row);
    if(row.status===200)pending.push(response.json().then(v=>row.data=Array.isArray(v)?v[0]:v).catch(()=>{}));
   };
   page.on('response',handle);
   try{
    await page.reload({waitUntil:'domcontentloaded',timeout:35000});
    for(let i=0;i<24&&(!responses.some(x=>x.name==='wm_auth_access_context'&&x.status===200)||!responses.some(x=>x.name==='apsyntra_crm_my_effective_access'&&x.status===200));i++)await page.waitForTimeout(250);
    await Promise.all(pending);
    const identity=responses.find(x=>x.name==='wm_auth_access_context'&&x.status===200)?.data;
    const access=responses.find(x=>x.name==='apsyntra_crm_my_effective_access'&&x.status===200)?.data;
    if(!UUID.test(identity?.user_id||'')||!UUID.test(identity?.workspace_id||'')||!access){records.push({status:'BLOCKED',reason:'Authoritative signed context or access unavailable'});continue;}
    records.push({tab:records.length+1,signed:true,active:identity?.profile?.status==='active',accountKey:hash(identity.user_id),workspaceId:identity.workspace_id,workspaceMatch:access.workspaceId===identity.workspace_id,access});
   }catch(e){records.push({status:'BLOCKED',reason:'Signed readback unavailable'});}finally{page.off('response',handle);}
  }
  const outcome=classifySigned03F(records);
  process.stdout.write(JSON.stringify({milestone:'CP-CRM-URM-INTEGRITY-03F',...outcome})+'\n');
  if(outcome.status!=='ELIGIBLE')process.exitCode=2;
 }finally{await browser.close();}
}
if(import.meta.url===pathToFileURL(process.argv[1]||'/dev/null').href){run().catch(e=>{console.error('BLOCKED: '+e.message);process.exitCode=2;});}
