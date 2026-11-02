/**
 * CP-BOARD-COL01 — real HTTPS GoTrue / PostgREST signed-session acceptance.
 * This is an opt-in read-only probe except explicit logout of one newly issued,
 * designated disposable test-account session. Never grants roles or changes data.
 * No bearer token, password, email or user ID is printed or saved.
 */
import {fileURLToPath} from 'node:url';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCTION_REF='jtlusodorfnyzgyuewkz';
const fail=code=>{throw Error(code);};
export function readSignedConfig(env){
 const ref=String(env.COL01_PROJECT_REF||'').trim();
 if(!/^[a-z0-9]{20}$/.test(ref))fail('PROJECT_REF_REQUIRED');
 let uri;try{uri=new URL(env.COL01_SUPABASE_URL||'');}catch{fail('INVALID_SUPABASE_URL');}
 if(uri.protocol!=='https:'||uri.hostname!==ref+'.supabase.co'||uri.port||uri.username||
    uri.password||uri.pathname!=='/'||uri.search||uri.hash)fail('PROJECT_ORIGIN_MISMATCH');
 if(ref===PRODUCTION_REF&&env.COL01_PRODUCTION_READ_ONLY!=='ACKNOWLEDGED')
   fail('PRODUCTION_READ_ONLY_CONFIRMATION_REQUIRED');
 for(const [key,label] of [['COL01_WORKSPACE_ID','WORKSPACE'],['COL01_BOARD_ID','BOARD'],
   ['COL01_FOREIGN_BOARD_ID','FOREIGN_BOARD']]){
  if(!UUID.test(env[key]||''))fail('INVALID_'+label+'_UUID');
 }
 if(env.COL01_BOARD_ID===env.COL01_FOREIGN_BOARD_ID)fail('TWO_DISTINCT_BOARDS_REQUIRED');
 const publishable=String(env.COL01_PUBLISHABLE_KEY||'').trim();
 if(!publishable.startsWith('sb_publishable_')||publishable.length<25)
  fail('PUBLISHABLE_KEY_REQUIRED');
 const identities=['ADMIN','MEMBER'].map(role=>{
  const email=String(env['COL01_'+role+'_EMAIL']||'').trim();
  const password=String(env['COL01_'+role+'_PASSWORD']||'');
  if(!email.includes('@')||!password)fail('DEDICATED_'+role+'_ACCOUNT_REQUIRED');
  return {email,password};
 });
 if(identities[0].email.toLowerCase()===identities[1].email.toLowerCase())
  fail('TWO_DIFFERENT_ACCOUNTS_REQUIRED');
 return Object.freeze({url:uri.origin,ref,workspace:env.COL01_WORKSPACE_ID,
  board:env.COL01_BOARD_ID,foreign:env.COL01_FOREIGN_BOARD_ID,publishable,
  identities,revoke:env.COL01_REVOKE_DISPOSABLE_SESSION==='YES'&&
    env.COL01_TEST_ACCOUNTS_DISPOSABLE==='YES',
  nearExpiryToken:String(env.COL01_NEAR_EXPIRY_ACCESS_TOKEN||'')});
}
function claims(token){
 if(typeof token!=='string'||token.split('.').length!==3)fail('INVALID_SIGNED_JWT');
 let data;try{data=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}
 catch{fail('INVALID_SIGNED_JWT');}
 if(!UUID.test(data.sub||'')||!UUID.test(data.session_id||'')||
    !Number.isSafeInteger(data.exp)||!Number.isSafeInteger(data.iat))
   fail('SIGNED_SESSION_PROOF_MISSING');
 return {user:data.sub,session:data.session_id,iat:data.iat,exp:data.exp};
}
export function tokenClaims(token){return claims(token);}
const ok=(condition,code)=>{if(!condition)fail(code);};
async function http(config,fetcher,path,{token,body,method='POST'}={}){
 if(!/^\/(auth\/v1\/(token\?grant_type=password|user|logout)|rest\/v1\/rpc\/[a-z_]+)$/.test(path))
  fail('UNAPPROVED_ENDPOINT');
 const response=await fetcher(config.url+path,{
  method,redirect:'error',cache:'no-store',
  headers:{apikey:config.publishable,'Content-Type':'application/json',
   ...(token?{Authorization:'Bearer '+token}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 const status=Number(response.status);
 let value=null;
 if(response.ok&&status!==204){try{value=await response.json();}catch{fail('INVALID_RESPONSE_JSON');}}
 return {status,ok:response.ok,value};
}
async function signIn(config,fetcher,identity){
 const session=await http(config,fetcher,'/auth/v1/token?grant_type=password',{
  body:identity});
 ok(session.ok&&typeof session.value?.access_token==='string','GOTRUE_SIGN_IN_FAILED');
 const token=session.value.access_token,proof=claims(token);
 ok(proof.exp>Math.floor(Date.now()/1000)+30,'GOTRUE_TOKEN_EXPIRED_ON_ISSUE');
 const user=await http(config,fetcher,'/auth/v1/user',{token,method:'GET'});
 ok(user.ok&&user.value?.id===proof.user,'GOTRUE_SIGNED_IDENTITY_MISMATCH');
 return {token,proof};
}
async function permission(config,fetcher,token,board,required){
 const response=await http(config,fetcher,'/rest/v1/rpc/work_board_access',{
  token,body:{p_board_id:board,p_required:required}});
 ok(response.ok&&typeof response.value==='boolean','SIGNED_BOARD_ACCESS_UNAVAILABLE');
 return response.value;
}
function record(list,name,condition){
 const status=condition?'PASS':'FAIL';
 list.push({name,status});return condition;
}
async function revoked(config,fetcher,identity){
 const session=await signIn(config,fetcher,identity);
 const url='/rest/v1/rpc/wm_list_board_events_page';
 const body={p_board_id:config.board,p_limit:1};
 const before=await http(config,fetcher,url,{token:session.token,body});
 ok(before.ok&&Array.isArray(before.value),'COL01_SIGNED_READER_NOT_ACTIVATED');
 const logout=await http(config,fetcher,'/auth/v1/logout',{token:session.token});
 ok(logout.ok,'GOTRUE_LOGOUT_FAILED');
 const stale=await http(config,fetcher,url,{token:session.token,body});
 // Revoked access must be denied by the newly protected COL01 RPC, not by
 // legacy work_board_access, which predates the candidate session guard.
 return !stale.ok;
}
async function expired(config,fetcher,token,identityUserId,nowSeconds,sleep){
 const proof=claims(token);
 ok(proof.user===identityUserId,'EXPIRY_TOKEN_IDENTITY_MISMATCH');
 const remaining=proof.exp-nowSeconds();
 // A previously expired or fabricated token alone cannot establish valid lineage.
 ok(remaining>=2&&remaining<=45,'NEAR_EXPIRY_SIGNED_TOKEN_REQUIRED');
 const beforeUser=await http(config,fetcher,'/auth/v1/user',{token,method:'GET'});
 const endpoint='/rest/v1/rpc/wm_list_board_events_page';
 const body={p_board_id:config.board,p_limit:1};
 const beforeBoard=await http(config,fetcher,endpoint,{token,body});
 ok(beforeUser.ok&&beforeUser.value?.id===identityUserId&&
  beforeBoard.ok&&Array.isArray(beforeBoard.value),
  'EXPIRY_PRIOR_SIGNED_PROOF_FAILED');
 await sleep((remaining+2)*1000);
 const authResult=await http(config,fetcher,'/auth/v1/user',{token,method:'GET'});
 const rpcResult=await http(config,fetcher,endpoint,{token,body});
 return !authResult.ok&&!rpcResult.ok;
}
export async function runCol01SignedHttp(env,fetcher=globalThis.fetch,{
  nowSeconds=()=>Math.floor(Date.now()/1000),
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
 }={}){
 const report={checkpoint:'CP-BOARD-COL01',environment:'REAL_HTTPS',
  boardOrPermissionMutations:0,tests:[],status:'BLOCKED',reason:null};
 const createdSessions=[];
 let c;
 try{c=readSignedConfig(env);}
 catch(e){report.reason=e.message;return report;}
 if(typeof fetcher!=='function'){report.reason='FETCH_REQUIRED';return report;}
 try{
  const admin=await signIn(c,fetcher,c.identities[0]);
  createdSessions.push(admin);
  const member=await signIn(c,fetcher,c.identities[1]);
  createdSessions.push(member);
  ok(admin.proof.user!==member.proof.user,'SAME_SIGNED_ACTOR');
  record(report.tests,'two-distinct-gotrue-signed-sessions',true);
  const contexts=await Promise.all([admin,member].map(x=>http(c,fetcher,
   '/rest/v1/rpc/wm_auth_access_context',{token:x.token,body:{}})));
  ok(contexts.every((v,i)=>v.ok&&v.value?.user_id===[admin,member][i].proof.user&&
    v.value?.workspace_id===c.workspace),'SIGNED_WORKSPACE_CONTEXT_MISMATCH');
  record(report.tests,'signed-workspace-and-actor',true);
  const access=await Promise.all([
   permission(c,fetcher,admin.token,c.board,'manage'),
   permission(c,fetcher,member.token,c.board,'view'),
   permission(c,fetcher,member.token,c.board,'manage'),
   permission(c,fetcher,admin.token,c.foreign,'view'),
   permission(c,fetcher,member.token,c.foreign,'view')
  ]);
  ok(access[0]&&access[1]&&!access[2]&&!access[3]&&!access[4],
   'ROLE_OR_WORKSPACE_BOUNDARY_FAILED');
  record(report.tests,'administrator-vs-nonadministrator',true);
  record(report.tests,'foreign-workspace-board-denied',true);
  if(c.revoke){
   const denied=await revoked(c,fetcher,c.identities[1]);
   record(report.tests,'fresh-disposable-session-revocation',denied);
  }else report.tests.push({name:'fresh-disposable-session-revocation',status:'PENDING'});
  if(c.nearExpiryToken){
   record(report.tests,'preverified-then-expired-bearer-token',
     await expired(c,fetcher,c.nearExpiryToken,member.proof.user,nowSeconds,sleep));
  }else report.tests.push({name:'preverified-then-expired-bearer-token',status:'PENDING'});
  const incomplete=report.tests.some(x=>x.status!=='PASS');
  report.status=incomplete?'BLOCKED':'VERIFIED';report.reason=incomplete?'SIGNED_GATES_INCOMPLETE':null;
 }catch(e){
  report.status='BLOCKED';
  report.reason=/^[A-Z0-9_]{3,90}$/.test(String(e.message))?e.message:'SIGNED_HTTP_TEST_FAILED';
 }finally{
  for(const session of createdSessions){
   try{
    const closed=await http(c,fetcher,'/auth/v1/logout',{token:session.token});
    if(!closed.ok){report.status='BLOCKED';report.reason='TEST_SESSION_CLEANUP_FAILED';}
   }catch{report.status='BLOCKED';report.reason='TEST_SESSION_CLEANUP_FAILED';}
  }
 }
 return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const result=await runCol01SignedHttp(process.env);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(result.status!=='VERIFIED')process.exitCode=1;
}
