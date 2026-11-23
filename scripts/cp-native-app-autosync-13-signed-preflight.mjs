#!/usr/bin/env node
/**
 * Read-only genuine browser-session evidence collector.
 * Observes signed Supabase responses from THREE independent CDP profiles.
 * Does not inspect credentials, cookies, local storage or issue role writes.
 */
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,16);
const AUTH_ORIGIN='https://jeqwjlxubntsddeauvqa.supabase.co';
const ADMIN_ROLES=new Set(['admin_general_manager','crm_admin']);

export function assessIndependentQaSessions(sessions){
 if(!Array.isArray(sessions)||sessions.length!==3)
  return {status:'BLOCKED',issues:['Three independent signed browser sessions required'],verified:0};
 const issues=[];
 const ports=new Set();
 const users=new Set();
 const workspaces=new Set();
 let admins=0;
 for(const session of sessions){
  if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(session.endpoint||'')||
     ports.has(session.endpoint))issues.push('Each QA actor needs a distinct loopback browser');
  ports.add(session.endpoint);
  if(!UUID.test(session.userId||'')||users.has(session.userId))
   issues.push('Each actor requires an independently signed unique Auth subject');
  else users.add(session.userId);
  if(!UUID.test(session.workspaceId||''))issues.push('Signed workspace identity unavailable');
  else workspaces.add(session.workspaceId);
  if(session.authHttpStatus!==200||session.workspaceHttpStatus!==200||
     session.active!==true||session.stagingOriginVerified!==true)
   issues.push('Signed staging Auth/workspace evidence missing');
  if(ADMIN_ROLES.has(session.role))admins++;
 }
 if(workspaces.size!==1)issues.push('All signed profiles must be in one nonproduction workspace');
 if(admins!==1)issues.push('Exactly one signed administrator and two QA members required');
 return {status:issues.length?'BLOCKED':'THREE_SIGNED_SESSIONS_VERIFIED',
  issues:[...new Set(issues)],verified:issues.length?0:3};
}

export function parseEndpoints(values){
 if(!Array.isArray(values)||values.length!==3||new Set(values).size!==3||
  values.some(x=>!/^http:\/\/127\.0\.0\.1:\d+$/.test(x)))
  throw Error('Exactly three unique loopback CDP endpoints required');
 return values;
}

async function collect(browser,endpoint,appOrigin){
 const records=[];
 for(const context of browser.contexts())for(const page of context.pages()){
  if(!page.url().startsWith(appOrigin+'/'))continue;
  const responses=[];
  const handler=async response=>{
   const url=response.url();
   if(!url.startsWith(AUTH_ORIGIN+'/')||response.status()!==200)return;
   if(/\/auth\/v1\/user(?:\?|$)/.test(url)||/\/rest\/v1\/rpc\/wm_auth_access_context(?:\?|$)/.test(url)){
    try{responses.push({url,data:await response.json()});}catch{}
   }
  };
  page.on('response',handler);
  try{
   await page.reload({waitUntil:'domcontentloaded',timeout:30000});
   for(let i=0;i<20;i++){
    if(responses.some(r=>r.url.includes('/auth/v1/user'))&&
       responses.some(r=>r.url.includes('/rpc/wm_auth_access_context')))break;
    await page.waitForTimeout(250);
   }
   const auth=responses.find(r=>r.url.includes('/auth/v1/user'))?.data;
   const scope=responses.find(r=>r.url.includes('/rpc/wm_auth_access_context'))?.data;
   const identity=Array.isArray(scope)?scope[0]:scope;
   const access=identity?.access||identity?.profile||identity;
   records.push({endpoint,userId:auth?.id,workspaceId:identity?.workspace_id,
    role:access?.effectivePlatformRole||access?.platform_role||identity?.platform_role,
    active:access?.status==='active'||identity?.profile?.status==='active',
    authHttpStatus:auth?200:0,workspaceHttpStatus:identity?200:0,
    stagingOriginVerified:true});
  }finally{page.off('response',handler);}
 }
 return records;
}

async function main(){
 const opts=Object.fromEntries(process.argv.slice(2).map(x=>x.split(/=(.*)/s).slice(0,2)));
 const origin=opts['--app-origin'];
 if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/.test(origin||''))
  throw Error('Approved nonproduction HTTPS app origin required');
 const endpoints=parseEndpoints([opts['--cdp-1'],opts['--cdp-2'],opts['--cdp-3']]);
 const {chromium}=await import('playwright');
 const observations=[];
 for(const endpoint of endpoints){
  const browser=await chromium.connectOverCDP(endpoint);
  try{
   const records=await collect(browser,endpoint,origin);
   if(records.length!==1)throw Error('Exactly one approved staging app tab required per browser');
   observations.push(records[0]);
  }finally{await browser.close();}
 }
 const result=assessIndependentQaSessions(observations);
 process.stdout.write(JSON.stringify({status:result.status,issues:result.issues,
  verified:result.verified,accounts:observations.map(v=>({
    userKey:UUID.test(v.userId||'')?hash(v.userId):null,
    workspaceKey:UUID.test(v.workspaceId||'')?hash(v.workspaceId):null,
    role:v.role||null
  }))})+'\n');
 if(result.status!=='THREE_SIGNED_SESSIONS_VERIFIED')process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('BLOCKED: '+e.message);process.exitCode=2;});
