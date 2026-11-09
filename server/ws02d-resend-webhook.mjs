/** Signed Resend (Svix) webhooks only. Never trusts provider event JSON alone.
 * This does not mount an unauthenticated production function or mutate SQL.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNATURE=/^v1,([A-Za-z0-9+/]+={0,2})$/;
const ID=/^[A-Za-z0-9_-]{4,128}$/;
const EVENTS=Object.freeze({
 'email.sent':'submitted',
 'email.delivered':'delivered',
 'email.bounced':'failed',
 'email.failed':'failed',
 'email.complained':'failed'
});
const deny=()=>new Response(JSON.stringify({state:'denied'}),{
 status:400,headers:{'content-type':'application/json','cache-control':'no-store'}
});
const unavail=()=>new Response(JSON.stringify({state:'unavailable'}),{
 status:503,headers:{'content-type':'application/json','cache-control':'no-store'}
});
function decode(value){
 try{const binary=atob(value);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
 catch{return null;}
}
export function createVerifiedResendWebhook({enabled=false,signingSecret,
 recordVerifiedEvent,clock=()=>Date.now()}={}){
 return async function handle(request){
  if(!enabled)return unavail();
  if(request?.method!=='POST'||typeof recordVerifiedEvent!=='function'||
   typeof signingSecret!=='string'||!/^whsec_[A-Za-z0-9+/=]{16,}$/.test(signingSecret))
   return deny();
  const eventId=request.headers.get('svix-id')||'';
  const timestamp=request.headers.get('svix-timestamp')||'';
  const signatures=request.headers.get('svix-signature')||'';
  if(!ID.test(eventId)||!/^\d{10}$/.test(timestamp)||
   !Number.isFinite(clock())||Math.abs(clock()/1000-Number(timestamp))>300)
   return deny();
  let raw;
  try{raw=await request.text();}catch{return deny();}
  if(typeof raw!=='string'||raw.length<1||raw.length>8192)return deny();
  const keyBytes=decode(signingSecret.slice(6));
  if(!keyBytes||keyBytes.length<16)return deny();
  let valid=false;
  try{
   const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['verify']);
   const content=new TextEncoder().encode(`${eventId}.${timestamp}.${raw}`);
   for(const field of signatures.split(/\s+/).slice(0,5)){
    const match=SIGNATURE.exec(field);
    if(!match)continue;
    const signature=decode(match[1]);
    if(signature?.length!==32)continue;
    if(await crypto.subtle.verify('HMAC',key,signature,content)){valid=true;break;}
   }
  }catch{return deny();}
  if(!valid)return deny();
  let payload;
  try{payload=JSON.parse(raw);}catch{return deny();}
  const state=EVENTS[payload?.type];
  const providerMessageId=payload?.data?.email_id;
  if(!state||!UUID.test(providerMessageId))return deny();
  try{
   // The durable database adapter MUST also verify the message correlation,
   // recorded provider ID, unique webhook ID, and monotonic state transition.
   const result=await recordVerifiedEvent(Object.freeze({
    eventId,providerMessageId,state
   }));
   if(result?.persisted!==true)return unavail();
  }catch{return unavail();}
  return new Response(JSON.stringify({state:'recorded'}),{
   status:200,headers:{'content-type':'application/json','cache-control':'no-store'}
  });
 };
}
