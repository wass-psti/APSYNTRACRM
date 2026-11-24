import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {verifyOrderEditorBrowser} from './cp-oi-native-03-editor-browser.mjs';
import {verifyOrderEditorSigned} from './cp-oi-native-03-signed.mjs';
import {verifySignedRegistryBrowser} from './cp-oi-native-02f-signed-browser.mjs';
import {OrderIntakeRegistryClient} from '../frontend/order-intake-registry-client.js';
import {projectUnifiedOrders} from '../frontend/order-intake-unified-read.js';
import {renderOrderIntake} from '../frontend/order-intake-ui.js';
import {parseOrderIntakeRoute} from '../frontend/order-intake-route.js';
const [authPort,restPort,dbName,manifestPath]=process.argv.slice(2);
assert.match(dbName,/^cpoi02f-\d+-pg$/);
assert.match(authPort,/^\d+$/);assert.match(restPort,/^\d+$/);
const workspace='00000000-0000-4000-8000-000000000001';
const foreign='00000000-0000-4000-8000-000000000002';
const authBase='http://127.0.0.1:'+authPort,restBase='http://127.0.0.1:'+restPort;
const manifest=JSON.parse(readFileSync(manifestPath));
const password=randomBytes(20).toString('hex')+'Aa!';
async function call(base,path,{method='GET',body,token}={}){
 const response=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Object.assign(new Error('HTTP '+response.status+' '+(data?.code||'')+' '+(data?.message||'')),{status:response.status});
 return data;
}
async function ready(base,path){
 for(let i=0;i<40;i++){try{await fetch(base+path,{signal:AbortSignal.timeout(1000)});return;}catch{}await new Promise(r=>setTimeout(r,300));}
 throw new Error('Local service unavailable');
}
function sql(q){return execFileSync('docker',['exec',dbName,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-c',q],{encoding:'utf8'}).trim();}
async function signin(scope,allowed){
 const email='oi-'+randomBytes(8).toString('hex')+'@example.test';
 await call(authBase,'/signup',{method:'POST',body:{email,password}});
 const session=await call(authBase,'/token?grant_type=password',{method:'POST',body:{email,password}});
 const user=await call(authBase,'/user',{token:session.access_token});
 assert.match(user.id,/^[0-9a-f-]{36}$/);
 sql("insert into fixture_access values ('"+user.id+"','"+scope+"',"+allowed+")");
 const auth={isSignedIn:true,userId:user.id,authorized:path=>call(restBase,path.replace('/rest/v1',''),{token:session.access_token})};
 const api={rpc:(name,body)=>call(restBase,'/rpc/'+name,{method:'POST',body,token:session.access_token})};
 if(process.env.OI_VERIFY_MUTATIONS==='1')sql("insert into workspace_members values ('"+scope+"','"+user.id+"',true)");
 return {auth,api,client:new OrderIntakeRegistryClient({auth,api,workspaceId:scope})};
}
await ready(authBase,'/health');await ready(restBase,'/');
const {client,auth,api}=await signin(workspace,true);
const rows=[];let more=true,pages=0;
while(more){const page=await client.list({offset:rows.length,limit:100});rows.push(...page.items);more=page.hasMore;pages++;}
assert.equal(rows.length,manifest.sourceCount+1);
assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
const legacy=rows.filter(r=>r.record_kind==='legacy');
const byKey=new Map(manifest.records.map(r=>[r.identity.key,r]));
for(const row of legacy){
 const original=byKey.get(row.source_key);
 assert.ok(original);assert.equal(row.po_number,original.values.poNumber);
 assert.equal(row.po_amount,original.values.poAmount);assert.equal(row.gross_profit,original.values.grossProfit);
 assert.equal(row.currency,original.values.currency);assert.equal(row.archived,original.sourceArchiveState);
}
assert.equal(legacy.length,manifest.sourceCount);
for(const row of [legacy[0],legacy.at(-1),rows.find(r=>r.record_kind==='native')])assert.deepEqual(await client.detail(row.id),row);
assert.equal((await client.list({archived:true})).items.length,1);
const p=projectUnifiedOrders(rows);assert.equal(p.totalOrders,rows.length);assert.equal(p.legacyCount,909);
assert.equal(p.legacyUnknownCurrency,728);assert.equal(p.legacyTotals.find(r=>r.currency==='USD').amount,'185352.889');
assert.equal(p.currencyTotals[0].grossProfit,'84.29');
for(const section of ['dashboard','workflow','search','all-orders']){
 const html=renderOrderIntake({route:parseOrderIntakeRoute('#/order-intake/'+section),snapshot:{rows,hasMore:false}});
 assert.match(html,/910 matching of 910/);assert.doesNotMatch(html,/role="alert"/);
}
const foreignUser=await signin(foreign,true);
assert.equal((await foreignUser.client.list()).items.length,0);
const cross=new OrderIntakeRegistryClient({auth:foreignUser.auth,api:{},workspaceId:workspace});
assert.equal((await cross.list()).items.length,0);
await assert.rejects(cross.detail(legacy[0].id),/unavailable/);
const denied=await signin(workspace,false);assert.equal((await denied.client.list()).items.length,0);
await assert.rejects(call(restBase,'/order_intake_registry'),e=>[401,403].includes(e.status));
console.log(JSON.stringify({signed:'disposable GoTrue logins + real PostgREST; fixture workspace helpers',legacy:legacy.length,native:1,pages,exactFinancialReadback:legacy.length,detailSamples:3,views:4,foreignAndDeniedReads:'PASS',anon:'PASS'}));

await verifySignedRegistryBrowser({workspaceId:workspace,signedAuth:auth});

if(process.env.OI_VERIFY_MUTATIONS==='1'){
 await verifyOrderEditorSigned({client,auth,api,sql,workspace});
 await verifyOrderEditorBrowser({auth,api,workspace});
}
