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
const currentYear=new Intl.DateTimeFormat('en',{timeZone:'Asia/Manila',year:'numeric'}).format(new Date());
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
const fixtureRoles=['unioil','global_l1_support','global_l1_competitor','local_l2_support','call_center_specialist','admin','client_manager','aramco','foreign'];
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
   enabled:true,status:'active',role:role==='foreign'?'admin':role==='global_l1_competitor'?'global_l1_support':role==='client_manager'?'viewer':role,
   client_code:role==='unioil'||role==='client_manager'?'UNIOIL':role==='aramco'?'ARAMCO':null,
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
async function patch(actor,previous,action,now,note=''){
 const changes=buildChange(previous,actor.member,actor.user,action,{now,note});
 const data=await requireStatus(rest('fueltrans_tickets',queryTicket(previous.id,previous.updated_at),{token:actor.token,method:'PATCH',body:changes}),200,'persist '+action);
 assert.equal(data.length,1,'compare-and-swap must affect one row');
 const persisted=await readTicket(actor,previous.id);
 assert.equal(persisted.status,changes.status);
 assert.equal(Date.parse(persisted.updated_at),Date.parse(now));
 return persisted;
}
function sourceTicketForClient(client,member,user,id,now){
 const draft=validateSourceTicketDraft({
  client,title:'Disposable '+client+' ticket numbering test',
  description:'Disposable integration test for the authoritative server-allocated ticket reference.',
  priority:'Medium',stationId:'TEST06',stationName:'SYNTHETIC TEST STATION',
  category:'Station Assistance',systemType:SYSTEM_TYPES[0],impactLevel:IMPACTS[1],
  reportingChannel:CHANNELS[0],handoverFlag:false
 },member);
 return buildSourceTicketRecord(draft,member,user,{id,now});
}

await readiness(authBase,'/health');
await readiness(restBase,'/');
console.log('ISOLATED_AUTH_AND_REST_READY');

const actors={};
for(const role of fixtureRoles){actors[role]=await signup(role);}
assert.notEqual(actors.global_l1_support.id,actors.local_l2_support.id);
assert.notEqual(actors.global_l1_support.token,actors.local_l2_support.token);
console.log('GOTRUE_NINE_INDEPENDENT_ROLE_FIXTURES_SIGNUP_AND_LOGIN PASS');

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

const reporter=actors.unioil,l1=actors.global_l1_support,l2=actors.local_l2_support,other=actors.aramco,foreign=actors.foreign,admin=actors.admin,callCenter=actors.call_center_specialist,clientManager=actors.client_manager,secondL1=actors.global_l1_competitor;
const valid=validateSourceTicketDraft({
 client:'UNIOIL',title:'Disposable POS transaction test',
 description:'Disposable E2E test of a failed station transaction workflow; no real station is impacted.',
 priority:'High',stationId:'TEST06',stationName:'SYNTHETIC TEST STATION',category:'POS Software Issue',
 systemType:SYSTEM_TYPES[0],impactLevel:IMPACTS[1],reportingChannel:CHANNELS[0],
 handoverFlag:false
},reporter.member);
const now='2026-11-23T03:10:00.000Z',ticketId='cpft06-'+randomUUID();
const record=buildSourceTicketRecord(valid,reporter.member,reporter.user,{id:ticketId,now});
// Simulate a client whose clock is materially wrong. The operational date remains
// a business-form field, while persisted creation timestamps must come from Postgres.
const staleClientTimestamp='2001-01-01T00:00:00.000Z';
record.created_at=staleClientTimestamp;
record.updated_at=staleClientTimestamp;
record.payload.createdAt=staleClientTimestamp;
record.payload.updatedAt=staleClientTimestamp;
record.payload.activity[0].timestamp=staleClientTimestamp;
const createStartedAt=Date.now();
const created=await requireStatus(rest('fueltrans_tickets','',{token:reporter.token,method:'POST',body:record}),201,'POST reporter ticket');
const createFinishedAt=Date.now();
assert.equal(created.length,1);
const persisted=created[0];
const persistedCreatedAt=Date.parse(persisted.created_at);
const localYear=new Intl.DateTimeFormat('en',{timeZone:'Asia/Manila',year:'numeric'}).format(new Date(persistedCreatedAt));
assert.ok(persistedCreatedAt>=createStartedAt-5000&&persistedCreatedAt<=createFinishedAt+5000,
 'created_at must be generated by the database clock, not the stale browser timestamp');
assert.equal(persisted.ticket_number,'UNI-'+localYear+'-038','UNIOIL counter resumes from the existing 037 reference in the server-derived year');
assert.equal(Date.parse(persisted.updated_at),persistedCreatedAt,'new row updated_at must match database created_at');
assert.equal(Date.parse(persisted.payload.createdAt),persistedCreatedAt,'payload.createdAt must match database created_at');
assert.equal(Date.parse(persisted.payload.updatedAt),persistedCreatedAt,'payload.updatedAt must match database updated_at');
assert.equal(Date.parse(persisted.payload.activity[0].timestamp),persistedCreatedAt,'ticket_created activity timestamp must match database created_at');
assert.equal(persisted.payload.ticketId,persisted.ticket_number);
assert.equal(persisted.payload.activity[0].metadata.ticketId,persisted.ticket_number);
let current=await readTicket(reporter,ticketId);
assert.equal(current.status,'Open');
assert.equal(current.ticket_number,persisted.ticket_number);
console.log('REAL_GOTRUE_DATABASE_CLOCK_CREATION_TIMESTAMP_PAYLOAD_ACTIVITY_AND_NUMBER_READBACK PASS');

const secondUnioilId='cpft06-sequence-'+randomUUID();
const secondUnioil=sourceTicketForClient('UNIOIL',reporter.member,reporter.user,secondUnioilId,'2026-11-23T03:10:01.000Z');
const secondUnioilResult=await requireStatus(rest('fueltrans_tickets','',{token:reporter.token,method:'POST',body:secondUnioil}),201,'second UNIOIL ticket');
assert.equal(secondUnioilResult[0].ticket_number,'UNI-'+currentYear+'-039');

const rollbackId='cpft06-rollback-'+randomUUID();
sql(`BEGIN; SET LOCAL request.jwt.claim.sub = '${reporter.id}'; INSERT INTO public.fueltrans_tickets (workspace_id,id,client_code,status,archived,payload,created_at,updated_at) VALUES ('${workspaceId}','${rollbackId}','UNIOIL','Open',false,'{"ticketId":null,"activity":[]}'::jsonb,'2026-11-23T03:10:02.000Z','2026-11-23T03:10:02.000Z'); ROLLBACK;`);
assert.equal(sql("select last_value from private.fueltrans_ticket_number_counters where client_code='UNIOIL' and ticket_year="+currentYear),'39','rolled-back ticket insert must not consume a sequence number');

const concurrentIds=Array.from({length:12},()=> 'cpft06-concurrent-'+randomUUID());
const concurrentNumbers=await Promise.all(concurrentIds.map(async(id,index)=>{
 const row=sourceTicketForClient('UNIOIL',reporter.member,reporter.user,id,'2026-11-23T03:10:03.000Z');
 const saved=await requireStatus(rest('fueltrans_tickets','',{token:reporter.token,method:'POST',body:row}),201,'concurrent UNIOIL insert '+index);
 return saved[0].ticket_number;
}));
assert.equal(new Set(concurrentNumbers).size,12,'concurrent ticket numbers must be unique');
const sortedConcurrent=[...concurrentNumbers].sort();
assert.deepEqual(sortedConcurrent,Array.from({length:12},(_,index)=>'UNI-'+currentYear+'-'+String(index+40).padStart(3,'0')));
console.log('REAL_GOTRUE_CONCURRENT_TICKET_NUMBER_ALLOCATION_12_WRITES_SINGLE_SEQUENCE PASS');

const aramcoId='cpft06-aramco-'+randomUUID();
const aramcoTicket=sourceTicketForClient('ARAMCO',other.member,other.user,aramcoId,'2026-11-23T03:10:04.000Z');
const aramcoCreated=await requireStatus(rest('fueltrans_tickets','',{token:other.token,method:'POST',body:aramcoTicket}),201,'ARAMCO ticket');
assert.equal(aramcoCreated[0].ticket_number,'ARA-'+currentYear+'-013');

// Exercise the exact Asia/Manila year conversion at both sides of midnight.
// 16:00 UTC is 00:00 on January 1 in the Philippines.
const yearBoundary=sql(`select
 extract(year from (timestamptz '2026-12-31 15:59:59.999999+00' at time zone 'Asia/Manila'))::int
 || ':' ||
 extract(year from (timestamptz '2026-12-31 16:00:00+00' at time zone 'Asia/Manila'))::int`);
assert.equal(yearBoundary,'2026:2027','Philippine year boundary must be independent of UTC date');
const rephilTicket=sourceTicketForClient('REPHIL',admin.member,admin.user,'cpft06-rephil-'+randomUUID(),'2001-01-01T00:00:00.000Z');
const rephilCreated=await requireStatus(rest('fueltrans_tickets','',{token:admin.token,method:'POST',body:rephilTicket}),201,'REPHIL ticket with stale client year');
assert.equal(rephilCreated[0].ticket_number,'REP-'+currentYear+'-001','server timestamp must select the actual current Philippine year');
const petronTicket=sourceTicketForClient('PETRON',admin.member,admin.user,'cpft06-petron-'+randomUUID(),'2001-01-01T00:00:00.000Z');
const petronCreated=await requireStatus(rest('fueltrans_tickets','',{token:admin.token,method:'POST',body:petronTicket}),201,'PETRON ticket');
assert.equal(petronCreated[0].ticket_number,'PET-'+currentYear+'-001');
console.log('REAL_GOTRUE_CLIENT_PREFIXES_DATABASE_YEAR_AND_PHILIPPINE_YEAR_BOUNDARY PASS');

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

// Role matrix checks use disposable GoTrue users. Existing authority policies are observed, not changed.
const adminRead=await readTicket(admin,ticketId);
assert.equal(adminRead.id,ticketId);
console.log('GOTRUE_ADMIN_INTERNAL_TICKET_READ PASS');
const managerRead=await requireStatus(rest('fueltrans_tickets',queryTicket(ticketId),{token:clientManager.token}),200,'client manager scoped read');
assert.deepEqual(managerRead,[]);
console.log('CLIENT_MANAGER_VIEWER_CLIENT_SCOPE_PENDING_CURRENT_DATABASE_CONTRACT');
const callCenterAttempt=await rest('fueltrans_tickets',queryTicket(ticketId),{
 token:callCenter.token,method:'PATCH',body:{status:'Under L1 Review',assigned_l1:callCenter.id}
});
assert.ok([200,400,401,403].includes(callCenterAttempt.status));
assert.equal(Array.isArray(callCenterAttempt.data)?callCenterAttempt.data.length:0,0);
assert.equal((await readTicket(reporter,ticketId)).status,'Open');
console.log('CALL_CENTER_CLAIM_BLOCKED_BY_EXISTING_WORKFLOW_AUTHORITY_CONTRACT');

const adminTicketId='cpft06-admin-'+randomUUID();
const adminValid=validateSourceTicketDraft({
 client:'UNIOIL',title:'Disposable administrator workflow test',
 description:'Disposable administrator test of ticket claim and resolution documentation; no real station is impacted.',
 priority:'Medium',stationId:'TEST06A',stationName:'SYNTHETIC ADMIN STATION',category:'Station Assistance',
 systemType:SYSTEM_TYPES[0],impactLevel:IMPACTS[1],reportingChannel:CHANNELS[0],handoverFlag:false
},admin.member);
const adminRecord=buildSourceTicketRecord(adminValid,admin.member,admin.user,{
 id:adminTicketId,now:'2026-11-23T03:09:30.000Z'
});
const adminCreated=await requireStatus(rest('fueltrans_tickets','',{token:admin.token,method:'POST',body:adminRecord}),201,'admin create ticket');
assert.equal(adminCreated[0].ticket_number,'UNI-'+currentYear+'-052');
let adminCurrent=await readTicket(admin,adminTicketId);
adminCurrent=await patch(admin,adminCurrent,'claim-l1','2026-11-23T03:09:31.000Z');
adminCurrent=await patch(admin,adminCurrent,'status:Resolved','2026-11-23T03:09:32.000Z','Administrator completed the station diagnostic and verified successful recovery.');
assert.equal(adminCurrent.status,'Resolved');
assert.match(adminCurrent.payload.resolutionDetails,/verified successful recovery/);
console.log('GOTRUE_ADMIN_CREATE_CLAIM_RESOLVE_WITH_DOCUMENTATION PASS');

// Two distinct L1 sessions attempt the same ticket revision at the same time.
const raceTicketId='cpft06-race-'+randomUUID();
const raceRecord=buildSourceTicketRecord(valid,reporter.member,reporter.user,{
 id:raceTicketId,now:'2026-11-23T03:09:00.000Z'
});
const raceCreated=await requireStatus(rest('fueltrans_tickets','',{token:reporter.token,method:'POST',body:raceRecord}),201,'create claim-race ticket');
assert.equal(raceCreated[0].ticket_number,'UNI-'+currentYear+'-053');
const raceCurrent=await readTicket(reporter,raceTicketId);
const claimants=[l1,secondL1];
const raceTimes=['2026-11-23T03:09:01.000Z','2026-11-23T03:09:02.000Z'];
const raceResults=await Promise.all(claimants.map((actor,index)=>{
 const change=buildChange(raceCurrent,actor.member,actor.user,'claim-l1',{now:raceTimes[index]});
 return rest('fueltrans_tickets',queryTicket(raceTicketId,raceCurrent.updated_at),{
  token:actor.token,method:'PATCH',body:change
 });
}));
checks+=raceResults.length;
const raceWinners=raceResults.filter(result=>result.status===200&&Array.isArray(result.data)&&result.data.length===1);
const raceLosers=raceResults.filter(result=>result.status===200&&Array.isArray(result.data)&&result.data.length===0);
assert.equal(raceWinners.length,1,'exactly one competing L1 claim must win');
assert.equal(raceLosers.length,1,'the stale competing L1 claim must affect zero rows');
const racePersisted=await readTicket(reporter,raceTicketId);
assert.equal(racePersisted.status,'Under L1 Review');
assert.ok(claimants.some(actor=>actor.id===racePersisted.assigned_l1));
console.log('REAL_GOTRUE_SIMULTANEOUS_L1_CLAIM_RACE_SINGLE_WINNER PASS');

current=await patch(l1,current,'claim-l1','2026-11-23T03:11:00.000Z');
assert.equal(current.assigned_l1,l1.id);
current=await patch(l1,current,'status:Escalated to L2','2026-11-23T03:12:00.000Z','POS transaction service unavailable after repeated terminal restart.');
current=await patch(l2,current,'claim-l2','2026-11-23T03:13:00.000Z');
assert.equal(current.assigned_l2,l2.id);
const stale=current.updated_at;
current=await patch(l2,current,'status:Resolved','2026-11-23T03:14:00.000Z','Replaced the failed terminal cable and verified successful station transactions.');
assert.equal(current.payload.closureDate,'2026-11-23T03:14:00.000Z');
assert.ok(current.payload.activity.length>=5);
const staleAttempt=await requireStatus(rest('fueltrans_tickets',queryTicket(ticketId,stale),
 {token:l2.token,method:'PATCH',body:{status:'Under L2 Review'}}),200,'stale update');
assert.equal(staleAttempt.length,0);
assert.equal((await readTicket(l1,ticketId)).status,'Resolved');
console.log('TWO_SESSION_L1_L2_CLAIM_ESCALATE_RESOLVE_READBACK_CAS PASS');

// Opt-in real browser acceptance requires local Playwright; CI's existing API gate stays unchanged.
if(process.env.FT_UI07_BROWSER==='1'||process.env.CP_CRM_PERF_01B_FUELTRANS==='1'){
 const {verifyFuelTransTwoSessionBrowser}=await import('./cp-ft-ui07-real-browser.mjs');
 const perf=process.env.CP_CRM_PERF_01B_FUELTRANS==='1';
 const integrity=()=>sql("SELECT md5(coalesce(string_agg(to_jsonb(t)::text, ',' ORDER BY id),'')) FROM public.fueltrans_tickets t");
 const before=perf?integrity():null;
 await verifyFuelTransTwoSessionBrowser({restPort,workspaceId,actors});
 if(perf){assert.equal(integrity(),before,'FuelTrans tickets changed during read benchmark');console.log('CP_CRM_PERF_01B_FUELTRANS_INTEGRITY_PASS');}
}

sql("update public.fueltrans_memberships set enabled=false where workspace_id='"+workspaceId+"' and user_id='"+l2.id+"'");
const afterRevoke=await requireStatus(rest('fueltrans_tickets',queryTicket(ticketId),{token:l2.token}),200,'revoked membership read');
assert.deepEqual(afterRevoke,[]);
assert.equal((await readTicket(l1,ticketId)).status,'Resolved');
console.log('SIGNED_TOKEN_MEMBERSHIP_REVOCATION_ISOLATION PASS');
console.log('PASS CP-FT-UI-06 real local GoTrue signups/login, two separate authenticated REST sessions, existing FuelTrans workflow-domain writes, RLS, persistence, CAS and revocation; '+checks+' HTTP checks');
