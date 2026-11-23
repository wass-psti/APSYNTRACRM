// CP-FT-UI-06 — disposable real GoTrue logins + PostgREST ticket lifecycle.
// The runner creates and destroys all services. Nothing contacts production.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {buildChange} from '../frontend/fueltrans/workflow-domain.js';
import {buildSourceTicketRecord,validateSourceTicketDraft,IMPACTS,CHANNELS,SYSTEM_TYPES} from '../frontend/fueltrans/ticket-create16.js';

const [authPort,restPort,dbName]=process.argv.slice(2);
if(!/^\d{2,5}$/.test(authPort||'')||!/^\d{2,5}$/.test(restPort||'')||
 !/^cpft06-\d+-pg$/.test(dbName||''))throw Error('Isolated runner arguments are required.');
const authBase='http://127.0.0.1:'+authPort;
const restBase='http://127.0.0.1:'+restPort;
const workspaceId=randomUUID(),otherWorkspaceId=randomUUID();
const password=randomBytes(22).toString('base64url')+'Aa1!';
const mailbox='cpft06-'+randomBytes(6).toString('hex');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let checks=0;

function sql(query){
 // All dynamic values below are generated UUIDs or fixed allowlisted role strings.
 const result=execFileSync('docker',['exec',dbName,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-A','-t','-c',query],{encoding:'utf8',timeout:12000});
 return result.trim();
}
async function call(base,path,{method='GET',body,token,extra={}}={}){
 const response=await fetch(base+path,{
  method,headers:{
   Accept:'application/json',
   ...(body===undefined?{}:{'Content-Type':'application/json'}),
   ...(token?{Authorization:'Bearer '+token}:{}),
   ...extra
  },...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(10000)
 });
 const text=await response.text();
 let value;
 try{value=JSON.parse(text);}catch{value=text;}
 return {status:response.status,data:value,range:response.headers.get('content-range')};
}
async function requireStatus(promise,expected,label){
 const result=await promise;
 if(result.status!==expected){
  const error=typeof result.data==='object'?JSON.stringify(result.data).slice(0,420):String(result.data).slice(0,420);
  throw Error(label+' expected '+expected+', got '+result.status+': '+error);
 }
 checks++;
 return result.data;
}
async function readiness(base,path){
 for(let tries=0;tries<42;tries++){
  try{const result=await call(base,path);if(result.status<500){return;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,350));
 }
 throw Error('Isolated service failed readiness: '+path);
}
const fixtureRoles=['unioil','global_l1_support','local_l2_support','aramco','foreign'];
async function signup(role){
 const email=mailbox+'-'+role+'@example.test';
 const signupData=await requireStatus(call(authBase,'/signup',{method:'POST',body:{email,password}}),200,'GoTrue signup '+role);
 const uuid=signupData?.user?.id||signupData?.id;
 assert.match(uuid,UUID);
 const signin=await requireStatus(call(authBase,'/token?grant_type=password',{method:'POST',body:{email,password}}),200,'GoTrue password login '+role);
 assert.match(signin?.access_token||'',/^[A-Za-z0-9_-]+\./);
 const claims=JSON.parse(Buffer.from(signin.access_token.split('.')[1],'base64url').toString('utf8'));
 assert.equal(claims.sub,uuid);
 assert.equal(claims.role,'authenticated');
 const who=await requireStatus(call(authBase,'/user',{token:signin.access_token}),200,'GoTrue identity verification '+role);
 assert.equal(who.id,uuid);
 return {role,email,id:uuid,token:signin.access_token,
  user:{id:uuid,email},
  member:{user_id:uuid,workspace_id:role==='foreign'?otherWorkspaceId:workspaceId,
   enabled:true,status:'active',role:role==='foreign'?'admin':role,
   client_code:role==='unioil'?'UNIOIL':role==='aramco'?'ARAMCO':null,
   display_name:'Synthetic '+role}
 };
}
async function rest(table,query,{token,method='GET',body,returnRows=true}={}){
 const suffix=query?'?'+query:'';
 return call(restBase+'/',''+table+suffix,{method,body,token,extra:{Prefer:returnRows?'return=representation':'return=minimal'}});
}
function queryTicket(ticketId,extra=''){
 return new URLSearchParams({workspace_id:'eq.'+workspaceId,id:'eq.'+ticketId,...(extra?{updated_at:'eq.'+extra}:{})}).toString();
}
async function readTicket(actor,id){
 const data=await requireStatus(rest('fueltrans_tickets',queryTicket(id),{token:actor.token}),200,'read ticket');
 assert.ok(Array.isArray(data));
 return data[0]||null;
}
async function patch(actor,previous,action,now){
 const changes=buildChange(previous,actor.member,actor.user,action,{now});
 const data=await requireStatus(rest('fueltrans_tickets',queryTicket(previous.id,previous.updated_at),{token:actor.token,method:'PATCH',body:changes}),200,'persist '+action);
 assert.equal(data.length,1,'compare-and-swap must affect one row');
 const persisted=await readTicket(actor,previous.id);
 assert.equal(persisted.status,changes.status);
 assert.equal(Date.parse(persisted.updated_at),Date.parse(now));
 return persisted;
}

await readiness(authBase,'/health');
await readiness(restBase,'/');
console.log('ISOLATED_AUTH_AND_REST_READY');

const actors={};
for(const role of fixtureRoles){actors[role]=await signup(role);}
assert.notEqual(actors.global_l1_support.id,actors.local_l2_support.id);
assert.notEqual(actors.global_l1_support.token,actors.local_l2_support.token);
console.log('GOTRUE_FIVE_INDEPENDENT_SIGNUPS_AND_LOGINS PASS');

sql("insert into public.workspaces(id) values ('"+workspaceId+"'),('"+otherWorkspaceId+"')");
for(const actor of Object.values(actors)){
 assert.match(actor.id,UUID);
 sql("insert into public.profiles(id,display_name,email) values ('"+actor.id+"','Synthetic Test','"+
  actor.email+"')");
 sql("insert into public.fueltrans_memberships(workspace_id,user_id,role,client_code,status,enabled) values ('"+
  actor.member.workspace_id+"','"+actor.id+"','"+actor.member.role+"',"+
  (actor.member.client_code?"'"+actor.member.client_code+"'":"null")+",'active',true)");
}
console.log('SIGNED_IDENTITIES_LINKED_TO_ISOLATED_MEMBERSHIP PASS');

const reporter=actors.unioil,l1=actors.global_l1_support,l2=actors.local_l2_support,other=actors.aramco,foreign=actors.foreign;
const valid=validateSourceTicketDraft({
 client:'UNIOIL',title:'Disposable POS transaction test',
 description:'Disposable E2E test of a failed station transaction workflow; no real station is impacted.',
 priority:'High',stationId:'TEST06',stationName:'SYNTHETIC TEST STATION',
 systemType:SYSTEM_TYPES[0],impactLevel:IMPACTS[1],reportingChannel:CHANNELS[0],
 handoverFlag:false
},reporter.member);
const now='2026-11-23T03:10:00.000Z',ticketId='cpft06-'+randomUUID();
const record=buildSourceTicketRecord(valid,reporter.member,reporter.user,{
 id:ticketId,now,ticketId:'UNI-TEST-06'
});
const created=await requireStatus(rest('fueltrans_tickets','',{token:reporter.token,method:'POST',body:record}),201,'POST reporter ticket');
assert.equal(created.length,1);
let current=await readTicket(reporter,ticketId);
assert.equal(current.status,'Open');
console.log('REAL_GOTRUE_REPORTER_CREATE_PERSISTED_READBACK PASS');

const anonymousRead=await rest('fueltrans_tickets',queryTicket(ticketId));
assert.ok([401,403].includes(anonymousRead.status),'anonymous ticket access must be denied');
checks++;
const parts=reporter.token.split('.');
assert.equal(parts.length,3);
const corruptedPayload=parts[1].slice(0,-2)+(parts[1].at(-2)==='A'?'B':'A')+parts[1].at(-1);
const forgedRead=await rest('fueltrans_tickets',queryTicket(ticketId),{
 token:parts[0]+'.'+corruptedPayload+'.'+parts[2]
});
assert.ok([401,403].includes(forgedRead.status),'tampered JWT must be rejected');
checks++;
console.log('ANONYMOUS_AND_FORGED_JWT_ACCESS_DENIED PASS');

const outsiderRead=await requireStatus(rest('fueltrans_tickets',queryTicket(ticketId),{token:other.token}),200,'cross client read');
assert.deepEqual(outsiderRead,[]);
const foreignRead=await requireStatus(rest('fueltrans_tickets',queryTicket(ticketId),{token:foreign.token}),200,'other workspace read');
assert.deepEqual(foreignRead,[]);
const deniedUpdate=await rest('fueltrans_tickets',queryTicket(ticketId),{
 token:other.token,method:'PATCH',body:{status:'Resolved'}});
assert.ok([200,204,403,401].includes(deniedUpdate.status));
assert.equal(Array.isArray(deniedUpdate.data)?deniedUpdate.data.length:0,0);
console.log('GOTRUE_CROSS_CLIENT_AND_WORKSPACE_RLS_DENIAL PASS');

current=await patch(l1,current,'claim-l1','2026-11-23T03:11:00.000Z');
assert.equal(current.assigned_l1,l1.id);
current=await patch(l1,current,'status:Escalated to L2','2026-11-23T03:12:00.000Z');
current=await patch(l2,current,'claim-l2','2026-11-23T03:13:00.000Z');
assert.equal(current.assigned_l2,l2.id);
const stale=current.updated_at;
current=await patch(l2,current,'status:Resolved','2026-11-23T03:14:00.000Z');
assert.equal(current.payload.closureDate,'2026-11-23T03:14:00.000Z');
assert.ok(current.payload.activity.length>=5);
const staleAttempt=await requireStatus(rest('fueltrans_tickets',queryTicket(ticketId,stale),
 {token:l2.token,method:'PATCH',body:{status:'Under L2 Review'}}),200,'stale update');
assert.equal(staleAttempt.length,0);
assert.equal((await readTicket(l1,ticketId)).status,'Resolved');
console.log('TWO_SESSION_L1_L2_CLAIM_ESCALATE_RESOLVE_READBACK_CAS PASS');

sql("update public.fueltrans_memberships set enabled=false where workspace_id='"+workspaceId+"' and user_id='"+l2.id+"'");
const afterRevoke=await requireStatus(rest('fueltrans_tickets',queryTicket(ticketId),{token:l2.token}),200,'revoked membership read');
assert.deepEqual(afterRevoke,[]);
assert.equal((await readTicket(l1,ticketId)).status,'Resolved');
console.log('SIGNED_TOKEN_MEMBERSHIP_REVOCATION_ISOLATION PASS');
console.log('PASS CP-FT-UI-06 real local GoTrue signups/login, two separate authenticated REST sessions, existing FuelTrans workflow-domain writes, RLS, persistence, CAS and revocation; '+checks+' HTTP checks');
