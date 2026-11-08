import test from 'node:test';
import assert from 'node:assert/strict';
import {
 captureWs02dB3OwnerRlsFixture,verifyWs02dB3ForeignRlsDenial,
 clearWs02dB3ForeignRlsFixture,hasWs02dB3ForeignRlsFixture,
 sanitizeWs02dB3ForeignRlsReport,renderWs02dB3ForeignRlsDenial
} from '../workspace-b3-foreign-rls-denial.js';
import {SUPABASE_PUBLISHABLE_KEY} from '../config.js';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const WA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',WB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROW='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TOKEN='synthetic_signed_token_'.repeat(5);
const HOST='https://jtlusodorfnyzgyuewkz.supabase.co/rest/v1/order_intake_orders?';
function signed({actor=A,workspace=WA,rows,code=200,drift=false,networkDown=false}={}){
 let sent=0,verified=0;
 const auth={userId:actor,
  getVerifiedUser:async()=>({id:drift&&++verified>1?B:(verified++,actor)}),
  token:async()=>TOKEN
 };
 const api={context:async()=>({user_id:actor,workspace_id:workspace,profile:{status:'active'}})};
 const fetchImpl=async(url,options)=>{
  sent++;
  assert.ok(url.startsWith(HOST));
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');
  assert.equal(options.cache,'no-store');
  assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
  assert.equal(options.headers.apikey,SUPABASE_PUBLISHABLE_KEY);
  const q=new URL(url).searchParams;
  assert.equal(q.get('limit'),'1');
  if(actor===A){
   assert.equal(q.get('select'),'id,workspace_id');
   assert.equal(q.get('workspace_id'),'eq.'+WA);
  }else{
   assert.equal(q.get('select'),'id');
   assert.equal(q.get('id'),'eq.'+ROW);
  }
  if(networkDown)throw Error('sensitive network information');
  return Response.json(rows??(actor===A?[{id:ROW,workspace_id:WA}]:[]),{status:code});
 };
 return {auth,api,fetchImpl,origin:'https://wass-psti.github.io',sent:()=>sent};
}
test('real-owner positive then distinct signed foreign principal direct-table denial, no secret disclosure',async()=>{
 clearWs02dB3ForeignRlsFixture();
 const owner=signed();
 const prepare=await captureWs02dB3OwnerRlsFixture({...owner,clock:()=>100});
 assert.equal(prepare.status,'READY');
 assert.equal(owner.sent(),1);
 const target=signed({actor:B,workspace:WB});
 const actual=await verifyWs02dB3ForeignRlsDenial({...target,clock:()=>200});
 assert.equal(actual.status,'PASS');
 assert.equal(actual.foreignWorkspaceDenialVerified,true);
 assert.equal(actual.independentTableRlsVerified,true);
 assert.equal(actual.allWatchedTablesRlsVerified,false);
 assert.equal(actual.revokedSessionDenialVerified,false);
 assert.equal(target.sent(),1);
 assert.equal(hasWs02dB3ForeignRlsFixture(()=>201),false);
 assert.doesNotMatch(sanitizeWs02dB3ForeignRlsReport(actual),
  /11111111|22222222|aaaaaaaa-aaaa|bbbbbbbb-bbbb|cccccccc-cccc|synthetic_signed_token_|sb_publishable_/);
});

test('same actor or same workspace never certify foreign RLS and perform zero foreign requests',async()=>{
 clearWs02dB3ForeignRlsFixture();
 await captureWs02dB3OwnerRlsFixture({...signed(),clock:()=>100});
 const same=signed();
 const sameResult=await verifyWs02dB3ForeignRlsDenial({...same,clock:()=>200});
 assert.equal(sameResult.status,'INCONCLUSIVE');
 assert.equal(sameResult.stage,'foreign-same-user');
 assert.equal(same.sent(),0);
 assert.match(renderWs02dB3ForeignRlsDenial({result:sameResult,hasFixture:true}),
  /still using the row owner account/);
 const sameWorkspace=signed({actor:B,workspace:WA});
 const workspaceResult=await verifyWs02dB3ForeignRlsDenial({...sameWorkspace,clock:()=>200});
 assert.equal(workspaceResult.status,'INCONCLUSIVE');
 assert.equal(workspaceResult.stage,'foreign-same-workspace');
 assert.equal(sameWorkspace.sent(),0);
 assert.equal(hasWs02dB3ForeignRlsFixture(()=>201),true);
 assert.match(renderWs02dB3ForeignRlsDenial({result:workspaceResult,hasFixture:true}),
  /server-authoritative active workspace is the same/);
 assert.equal(JSON.parse(sanitizeWs02dB3ForeignRlsReport(workspaceResult)).stage,
  'foreign-same-workspace');
 assert.doesNotMatch(sanitizeWs02dB3ForeignRlsReport(workspaceResult),
  /11111111|22222222|aaaaaaaa-aaaa|bbbbbbbb-bbbb|cccccccc-cccc|synthetic_signed_token_/);
 clearWs02dB3ForeignRlsFixture();
});

test('missing owner row, absent or expired volatile fixture and unapproved origin are not PASS',async()=>{
 clearWs02dB3ForeignRlsFixture();
 assert.equal((await captureWs02dB3OwnerRlsFixture({...signed({rows:[]})})).status,'INCONCLUSIVE');
 assert.equal((await verifyWs02dB3ForeignRlsDenial({...signed({actor:B,workspace:WB})})).status,'INCONCLUSIVE');
 const bad=signed();
 assert.equal((await captureWs02dB3OwnerRlsFixture({...bad,origin:'https://forbidden.invalid'})).status,'BLOCKED');
 assert.equal(bad.sent(),0);
 await captureWs02dB3OwnerRlsFixture({...signed(),clock:()=>100});
 assert.equal(hasWs02dB3ForeignRlsFixture(()=>100+15*60*1000),false);
});

test('foreign existing row visible is FAIL; 403 and network errors are INCONCLUSIVE',async()=>{
 clearWs02dB3ForeignRlsFixture();
 await captureWs02dB3OwnerRlsFixture({...signed(),clock:()=>100});
 const leak=await verifyWs02dB3ForeignRlsDenial({...signed({actor:B,workspace:WB,rows:[{id:ROW}]}),clock:()=>200});
 assert.equal(leak.status,'FAIL');
 assert.equal(leak.stage,'foreign-row-visible');
 await captureWs02dB3OwnerRlsFixture({...signed(),clock:()=>100});
 assert.equal((await verifyWs02dB3ForeignRlsDenial({...signed({actor:B,workspace:WB,code:403}),clock:()=>200})).status,'INCONCLUSIVE');
 assert.equal((await verifyWs02dB3ForeignRlsDenial({...signed({actor:B,workspace:WB,networkDown:true}),clock:()=>200})).status,'INCONCLUSIVE');
});

test('mismatched owner workspace, extra data and mid-read identity changes fail closed',async()=>{
 for(const agent of [
  signed({rows:[{id:ROW,workspace_id:WB}]}),
  signed({rows:[{id:ROW,workspace_id:WA,extra:'do not export'}]}),
  signed({drift:true})
 ]){
  const result=await captureWs02dB3OwnerRlsFixture({...agent});
  assert.notEqual(result.status,'READY');
  assert.equal(hasWs02dB3ForeignRlsFixture(),false);
 }
});

test('sanitizer rejects forged PASS and UI never renders retained row/user identifiers',()=>{
 const safe=JSON.parse(sanitizeWs02dB3ForeignRlsReport({
  status:'PASS',stage:'foreign-row-denied',foreignWorkspaceDenialVerified:true,
  independentTableRlsVerified:false,genuineDistinctSignedPrincipalsVerified:true,
  token:TOKEN
 }));
 assert.equal(safe.status,'BLOCKED');
 assert.equal(safe.foreignWorkspaceDenialVerified,false);
 assert.equal(safe.revokedSessionDenialVerified,false);
 assert.doesNotMatch(JSON.stringify(safe),/synthetic_signed_token_/);
 const html=renderWs02dB3ForeignRlsDenial({hasFixture:true});
 assert.match(html,/without refreshing this tab/);
 assert.match(html,/Use Step 2 ONLY under the foreign account/);
 assert.doesNotMatch(html,/11111111|cccccccc-cccc/);
 assert.match(renderWs02dB3ForeignRlsDenial({hasFixture:false}),
  /data-action="security-ws02d-b3-rls-verify" disabled/);
});
