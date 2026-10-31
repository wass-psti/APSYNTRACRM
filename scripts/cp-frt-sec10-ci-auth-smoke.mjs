/** CP-FRT-SEC10 ephemeral Supabase GoTrue smoke.
 * Runs ONLY on a GitHub Actions runner, ONLY against loopback, never cloud.
 * Proves real Auth sessions; does not claim platform-role transition acceptance.
 */
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function localStackConfig(source, env=process.env){
 if(env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||
   env.SEC10_CI_AUTH_SMOKE!=='EPHEMERAL_ONLY')
  throw Error('CI_ONLY');
 const parsed=Object.fromEntries(source.split(/\r?\n/).map(l=>{
  const m=l.match(/^([A-Z_]+)=(?:"([^"]*)"|'([^']*)'|([^\s]*))$/);
  return m?[m[1],m[2]??m[3]??m[4]]:null;
 }).filter(Boolean));
 const api=parsed.API_URL;
 let url;
 try{url=new URL(api);}catch{throw Error('NO_LOCAL_API_URL');}
 if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||
  !/^\d+$/.test(url.port)||url.port==='80'||
  url.username||url.password||url.search||url.hash||url.pathname!=='/')
  throw Error('LOOPBACK_ENDPOINT_REQUIRED');
 const anonKey=parsed.ANON_KEY||parsed.PUBLISHABLE_KEY;
 const serviceKey=parsed.SERVICE_ROLE_KEY||parsed.SECRET_KEY;
 if(!anonKey||!serviceKey||anonKey===serviceKey)
  throw Error('LOCAL_KEYS_UNAVAILABLE');
 return {api:url.origin,anonKey,serviceKey};
}
export function jwtSessionProof(token){
 if(typeof token!=='string'||token.split('.').length!==3)
  throw Error('JWT_REQUIRED');
 let claims;
 try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}
 catch{throw Error('JWT_PARSE_FAILED');}
 if(!/^[0-9a-f-]{36}$/i.test(claims?.sub||'')||
  !/^[0-9a-f-]{36}$/i.test(claims?.session_id||'')||
  !Number.isInteger(claims?.iat))throw Error('SESSION_ID_UNAVAILABLE');
 return {userId:claims.sub,sessionId:claims.session_id,issuedAt:claims.iat};
}
export async function runLocalGoTrueSmoke(settings,fetchImpl=globalThis.fetch){
 const log=[];
 const request=async(path,method,auth,body)=>{
  const response=await fetchImpl(settings.api+path,{
   method,cache:'no-store',redirect:'error',headers:{
    'apikey':auth==='admin'?settings.serviceKey:settings.anonKey,
    ...(auth==='admin'?{Authorization:'Bearer '+settings.serviceKey}:
      auth?{Authorization:'Bearer '+auth}:{}),
    'Content-Type':'application/json'
   },...(body?{body:JSON.stringify(body)}:{})
  });
  if(!response.ok)throw Error('GOTRUE_HTTP_'+response.status);
  return response.status===204?null:response.json();
 };
 const secret=randomBytes(20).toString('hex')+'A!3';
 const suffix=randomBytes(6).toString('hex');
 const accounts=[];
 try{
  for(const label of ['administrator','member']){
   const email='sec10-ci-'+label+'-'+suffix+'@example.invalid';
   const record=await request('/auth/v1/admin/users','POST','admin',{
    email,password:secret,email_confirm:true
   });
   if(!record?.id)throw Error('EPHEMERAL_USER_CREATION_FAILED');
   accounts.push({id:record.id,email,label});
  }
  const seen=new Set();
  const userSessions={};
  for(const account of accounts){
   const count=account.label==='member'?3:1;
   for(let i=0;i<count;i++){
    const session=await request('/auth/v1/token?grant_type=password','POST',null,{
     email:account.email,password:secret
    });
    const proof=jwtSessionProof(session?.access_token);
    if(proof.userId!==account.id||seen.has(proof.sessionId))
     throw Error('AUTH_SESSION_LINEAGE_FAILED');
    seen.add(proof.sessionId);
    const real=await request('/auth/v1/user','GET',session.access_token);
    if(real?.id!==account.id)throw Error('GOTRUE_USER_NOT_VERIFIED');
    if(account.label==='member')userSessions[account.label]=(userSessions[account.label]||0)+1;
    await request('/auth/v1/logout','POST',session.access_token);
   }
   log.push({name:account.label+'-signed-user',status:'PASS'});
  }
  if(userSessions.member!==3)throw Error('THREE_MEMBER_SESSIONS_NOT_ISSUED');
  log.push({name:'three-distinct-member-sessions',status:'PASS'});
  return {checkpoint:'CP-FRT-SEC10-CI-AUTH',status:'PASS',checks:log,
   realGoTrueSessionsVerified:4,crmRoleTransitionsVerified:0,
   financialOperationsVerified:0,productionTouched:false};
 }finally{
  // The isolated runner directory is destroyed by the hosted CI worker.
  // No token, password or user ID is logged, exported or stored as an artifact.
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const index=process.argv.indexOf('--env-file');
  if(index<0||!process.argv[index+1])throw Error('ENV_FILE_REQUIRED');
  const c=localStackConfig(readFileSync(process.argv[index+1],'utf8'));
  const result=await runLocalGoTrueSmoke(c);
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(e){
  process.stdout.write(JSON.stringify({checkpoint:'CP-FRT-SEC10-CI-AUTH',
   status:'BLOCKED',reason:/^[A-Z0-9_]{3,80}$/.test(e.message)?e.message:'CI_AUTH_SMOKE_FAILED',
   productionTouched:false})+'\n');
  process.exitCode=1;
 }
}
