/**
 * CP-WS-02D/B3 — true two-session PostgreSQL race checks.
 * Disposable PG17 GitHub Actions only; no production DB URL, no real users.
 * Uses psql from the existing CI runner: no additional runtime packages.
 */
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

if (process.env.CI!=='true' ||
    process.env.PGDATABASE!=='workspace_disposable' ||
    process.env.PGHOST!=='127.0.0.1' ||
    process.env.PGUSER!=='postgres') {
  throw new Error('Concurrent acceptance requires the isolated PG17 CI fixture');
}
const args=['-X','-qAt','-v','ON_ERROR_STOP=1'];
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session='aaaaaaaa-0000-4000-8000-000000000001';
const workspace='00000000-0000-4000-8000-000000000001';
const assetVendor='ws02d-b3-race-asset';
const assetData='data:image/png;base64,YWJj';
const stateKey='fueltrackplus.requests.v3';
const eventIds=['b3-race-fueltrack-alpha','b3-race-fueltrack-beta'];

function sql(command){
 return execFileSync('psql',[...args,'-c',command],{
  encoding:'utf8',timeout:15000,maxBuffer:65536
 }).trim();
}
assert.equal(sql("SELECT CASE WHEN current_database()='workspace_disposable' AND current_setting('server_version_num')::int>=170000 THEN 'PG17_DISPOSABLE' ELSE 'DENIED' END"),
 'PG17_DISPOSABLE');

function openPsql(){
 const proc=spawn('psql',args,{env:process.env,stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='',closed=false;
 proc.stdout.setEncoding('utf8');
 proc.stderr.setEncoding('utf8');
 proc.stdout.on('data',v=>{stdout=(stdout+v).slice(-4000);});
 proc.stderr.on('data',v=>{stderr=(stderr+v).slice(-4000);});
 const completion=new Promise(resolve=>{
  proc.once('close',code=>{closed=true;resolve({code,stdout,stderr});});
 });
 return {
  proc,completion,
  read:()=>({stdout,stderr,closed}),
  send:line=>{if(!closed)proc.stdin.write(line+'\n');},
  finish:()=>{if(!closed)proc.stdin.end();}
 };
}
async function acquireLock(command){
 const p=openPsql();
 p.send('BEGIN;');
 p.send(command);
 p.send("SELECT 'WS02D_B3_LOCK_HELD';");
 for(let i=0;i<80;i++){
  const {stdout,stderr,closed}=p.read();
  if(stdout.includes('WS02D_B3_LOCK_HELD'))return p;
  if(closed)throw new Error('Coordinator exited before lock: '+stderr.slice(0,140));
  await delay(50);
 }
 p.send('ROLLBACK;');p.finish();
 throw new Error('Coordinator did not acquire fixture lock');
}
async function runWorkers(label,lockCommand,queries,check){
 const coord=await acquireLock(lockCommand);
 const workers=queries.map((query,i)=>{
  const p=openPsql();
  p.send("SELECT set_config('application_name','ws02d_b3_"+label+"_"+(i+1)+"',false);");
  p.send('BEGIN;');
  p.send("SELECT set_config('request.jwt.claim.sub','"+actor+"',true);");
  p.send("SELECT set_config('request.jwt.claim.session_id','"+session+"',true);");
  p.send(query);
  p.send('COMMIT;');
  p.finish();
  return p;
 });
 try{
  let waiting=0;
  for(let i=0;i<110;i++){
   waiting=Number(sql("SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'ws02d_b3_"+label+"_%' AND wait_event_type='Lock'"));
   if(waiting===2)break;
   if(workers.some(p=>p.read().closed))break;
   await delay(70);
  }
  assert.equal(waiting,2,'Both independent signed DB sessions must block before release ('+label+')');
 }finally{
  coord.send('COMMIT;');
  coord.finish();
  await coord.completion;
 }
 const outcomes=await Promise.all(workers.map(w=>w.completion));
 const accepted=outcomes.filter(r=>r.code===0);
 const rejected=outcomes.filter(r=>r.code!==0);
 assert.equal(accepted.length,1,label+': exactly one concurrent write must commit');
 assert.equal(rejected.length,1,label+': exactly one competing write must fail');
 assert.match(rejected[0].stderr,check,label+': rejected write must be a CAS conflict');
 // No tokens, payloads, emails or profile identifiers in CI evidence.
 process.stdout.write('WS02D_B3_'+label.toUpperCase()+
  '_RACE_PASS waiters=2 committed=1 conflict=1\n');
}

try{
 assert.equal(sql("SELECT count(*) FROM public.tradelink_vendor_assets WHERE vendor_id='"+assetVendor+"'"),'0');
 await runWorkers('asset',
  "SELECT pg_advisory_xact_lock(hashtextextended('"+workspace+"/"+assetVendor+"/logo',0));",
  [0,1].map(()=>"SELECT public.tradelink_asset_write('"+assetVendor+"','logo','"+assetData+"',0);"),
  /TRADELINK_ASSET_REVISION_CONFLICT/);
 assert.equal(sql("SELECT count(*)::text||':'||min(revision)::text FROM public.tradelink_vendor_assets WHERE workspace_id='"+workspace+"' AND vendor_id='"+assetVendor+"' AND asset_kind='logo'"),'1:1');

 assert.equal(sql("SELECT count(*) FROM public.module_state_entries WHERE module_id='fueltrack-plus' AND state_key='"+stateKey+"'"),'0');
 sql("INSERT INTO public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by) VALUES('"+
  workspace+"','fueltrack-plus','"+stateKey+"','shared','*','{\"requests\":[]}',1,'"+actor+"')");
 await runWorkers('fueltrack',
  "SELECT 1 FROM public.module_state_entries WHERE workspace_id='"+workspace+"' AND module_id='fueltrack-plus' AND state_key='"+stateKey+"' AND scope='shared' AND owner_key='*' FOR UPDATE;",
  eventIds.map((event,i)=>"SELECT public.commit_fueltrack_requests_with_activity('{\"requests\":[{\"id\":\"race-"+i+"\"}]}',1,'"+event+"','submit','Synthetic simultaneous commit','','', '{}'::jsonb);"),
  /WM_STATE_CONFLICT/);
 assert.equal(sql("SELECT revision FROM public.module_state_entries WHERE workspace_id='"+workspace+"' AND module_id='fueltrack-plus' AND state_key='"+stateKey+"'"),'2');
 assert.equal(sql("SELECT count(*) FROM public.module_activity_events WHERE module_id='fueltrack-plus' AND event_id IN ('"+eventIds.join("','")+"')"),'1');
 process.stdout.write('WS02D_B3_CONCURRENCY_VERIFIED both signed-CAS races serialized correctly\n');
}finally{
 // Only the fixture-only named rows, regardless of success/failure.
 sql("DELETE FROM public.module_activity_events WHERE module_id='fueltrack-plus' AND event_id IN ('"+eventIds.join("','")+"');");
 sql("DELETE FROM public.module_state_entries WHERE workspace_id='"+workspace+"' AND module_id='fueltrack-plus' AND state_key='"+stateKey+"';");
 sql("DELETE FROM public.tradelink_vendor_assets WHERE workspace_id='"+workspace+"' AND vendor_id='"+assetVendor+"';");
 assert.equal(sql("SELECT count(*) FROM public.tradelink_vendor_assets WHERE vendor_id='"+assetVendor+"'"),'0');
 assert.equal(sql("SELECT count(*) FROM public.module_state_entries WHERE module_id='fueltrack-plus' AND state_key='"+stateKey+"'"),'0');
 process.stdout.write('WS02D_B3_DISPOSABLE_CLEANUP_VERIFIED\n');
}
