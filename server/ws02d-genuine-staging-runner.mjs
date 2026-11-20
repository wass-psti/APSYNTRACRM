/** Isolated staging-only, credential-in-memory two-account invitation transport.
 * Never creates GoTrue identities or assumes email receipt. No production URL.
 * No writes in preflight. Send/accept require explicit operator action.
 */
const BASE='https://jeqwjlxubntsddeauvqa.supabase.co';
const ORIGIN='https://wass-psti.github.io';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/;
const EMAIL=/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const assert=(condition,message)=>{if(!condition)throw Error(message)};
const json=async r=>{try{return await r.json()}catch{return null}};
function ensureNoBearerOutput(data){
  if(data && typeof data==='object'){
    if('token' in data||'access_token' in data||'refresh_token' in data)
      throw Error('Unsafe bearer-secret response');
  }
}
export function createGenuineStagingRunner({fetchImpl=fetch,origin=ORIGIN}={}){
 async function request(path,{jwt,publishableKey,body,method='GET'}={}){
  assert(typeof publishableKey==='string'&&publishableKey.length>8,'Staging publishable key required');
  assert(typeof jwt==='string'&&jwt.length>50,'Signed staging JWT required');
  const url=BASE+path;
  const res=await fetchImpl(url,{
   method,
   headers:{'authorization':'Bearer '+jwt,'apikey':publishableKey,
    'origin':origin,'accept':'application/json',
    ...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),redirect:'error',cache:'no-store',
   signal:AbortSignal.timeout(10000)
  });
  return {status:res.status,data:await json(res)};
 }
 async function identity({jwt,publishableKey}){
  const res=await request('/auth/v1/user',{jwt,publishableKey});
  assert(res.status===200,'GoTrue signed-user verification denied');
  assert(UUID.test(res.data?.id)&&typeof res.data?.email==='string',
   'GoTrue identity was invalid');
  assert(res.data?.email_confirmed_at&&res.data?.is_anonymous!==true,
   'GoTrue account not confirmed');
  return {id:res.data.id,email:res.data.email.trim().toLowerCase()};
 }
 async function pair({inviterJwt,recipientJwt,publishableKey}){
  const inviter=await identity({jwt:inviterJwt,publishableKey});
  const recipient=await identity({jwt:recipientJwt,publishableKey});
  assert(inviter.id!==recipient.id&&inviter.email!==recipient.email,
   'Two independent signed staging users required');
  return {inviter,recipient};
 }
 async function send({inviterJwt,recipientJwt,publishableKey,workspaceId,requestId}){
  assert(UUID.test(workspaceId)&&UUID.test(requestId),'Valid workspace and idempotency IDs required');
  const {recipient}=await pair({inviterJwt,recipientJwt,publishableKey});
  assert(EMAIL.test(recipient.email),'Confirmed recipient email is invalid');
  const response=await request('/functions/v1/ws02d-invite',{
   jwt:inviterJwt,publishableKey,method:'POST',body:{workspaceId,requestId,
    email:recipient.email,role:'member',message:''}
  });
  assert(response.status===200,'Invitation issue/delivery not confirmed; reconcile manager listing');
  ensureNoBearerOutput(response.data);
  assert(UUID.test(response.data?.invitationId)&&
   ['delivery-submitted','already-issued'].includes(response.data?.state),
   'Invalid trusted invitation receipt');
  return {state:response.data.state,invitationId:response.data.invitationId,
   providerAccepted:response.data.state==='delivery-submitted',
   inboxDelivered:false};
 }
 async function accept({inviterJwt,recipientJwt,publishableKey,token}){
  assert(TOKEN.test(token),'Token must come from confirmed recipient inbox link');
  await pair({inviterJwt,recipientJwt,publishableKey});
  const response=await request('/functions/v1/ws02d-accept',{
   jwt:recipientJwt,publishableKey,method:'POST',body:{token}
  });
  assert(response.status===200,'Invitation acceptance denied or ambiguous');
  ensureNoBearerOutput(response.data);
  assert(response.data?.state==='accepted'&&response.data?.role==='member'&&
   response.data?.switched===false&&UUID.test(response.data?.workspaceId),
   'Trusted acceptance receipt invalid');
  return {state:'accepted',workspaceId:response.data.workspaceId,switched:false};
 }
 async function list({inviterJwt,publishableKey,workspaceId}){
  assert(UUID.test(workspaceId),'Workspace ID required');
  await identity({jwt:inviterJwt,publishableKey});
  const response=await request('/functions/v1/ws02d-manage',{
   jwt:inviterJwt,publishableKey,method:'POST',body:{operation:'list',workspaceId}
  });
  assert(response.status===200,'Trusted manager listing unavailable');
  assert(response.data?.authorized===true&&response.data?.workspaceId===workspaceId
    &&Array.isArray(response.data?.invitations),'Invalid manager scoped readback');
  return {authorized:true,workspaceId,states:response.data.invitations.map(v=>v.state)};
 }
 return Object.freeze({identity,pair,send,accept,list});
}
