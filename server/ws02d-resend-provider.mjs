/** CP-WS-02D/D — trusted Resend provider transport, disabled by default.
 * No email is delivered by importing this module; credentials and sender
 * configuration must be provisioned server-side after domain verification.
 * Provider HTTP acceptance is NOT inbox delivery or membership activation.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const URL='https://api.resend.com/emails';
const unavailable=()=>new Error('Trusted mail provider unavailable');

export function createResendInvitationProvider({
 enabled=false,apiKey,verifiedSender,fetchImpl=globalThis.fetch,
 timeoutMs=8000
}={}){
 const configured=enabled===true&&typeof apiKey==='string'&&
  /^re_[A-Za-z0-9_-]{12,}$/.test(apiKey)&&
  typeof verifiedSender==='string'&&EMAIL.test(verifiedSender)&&
  !verifiedSender.endsWith('@resend.dev')&&
  typeof fetchImpl==='function'&&Number.isSafeInteger(timeoutMs)&&
  timeoutMs>=1000&&timeoutMs<=15000;
 return async function sendEmail(envelope){
  if(!configured)throw unavailable();
  const {to,subject,text,invitationId}=envelope||{};
  if(typeof to!=='string'||to.length>254||!EMAIL.test(to)||
   typeof subject!=='string'||subject.length<1||subject.length>160||
   typeof text!=='string'||text.length<1||text.length>4000||
   !UUID.test(invitationId)||!text.includes('https://wass-psti.github.io/APSYNTRACRM/#/invitations/accept/'))
   throw new Error('Invalid trusted invitation envelope');
  let response;
  try{
   response=await fetchImpl(URL,{
    method:'POST',redirect:'error',cache:'no-store',
    headers:{
     authorization:'Bearer '+apiKey,
     'content-type':'application/json',
     'idempotency-key':'apsyntra-ws02d-'+invitationId
    },
    body:JSON.stringify({from:verifiedSender,to:[to],subject,text}),
    signal:AbortSignal.timeout(timeoutMs)
   });
  }catch{throw unavailable();}
  if(response?.ok!==true)throw unavailable();
  let body;
  try{body=await response.json();}catch{throw unavailable();}
  if(!UUID.test(body?.id))throw unavailable();
  // Only a provider-accepted receipt, never an inbox delivered indication.
  return Object.freeze({accepted:true,providerMessageId:body.id});
 };
}
