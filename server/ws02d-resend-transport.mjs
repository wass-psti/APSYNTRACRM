/**
 * CP-WS-02D/B2 — OPTIONAL Resend HTTP transport, disabled by default.
 * Backend only. Not imported by the GitHub Pages frontend or deployed.
 * Provider selection, DNS verification, credentials and live sends remain
 * separately approved work. No API key is stored in this repository.
 *
 * Current provider API: POST https://api.resend.com/emails, bearer credential,
 * {from,to,subject,text}, Idempotency-Key (provider caches for 24 hours).
 */
const RESEND_EMAILS_URL='https://api.resend.com/emails';
const EMAIL=/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const WS02D_RESEND_TRANSPORT_ENABLED=false;

function normalizeSender(sender){
 if(typeof sender!=='string'||sender.length>254||/[\r\n]/.test(sender))return null;
 const value=sender.trim();
 // Deliberately plain address only until sender-domain verification is
 // externally approved; display-name parsing complicates injection safety.
 return EMAIL.test(value)?value:null;
}

export function createResendTransport({
 apiKey,from,fetchImpl,enabled=false
}={}){
 if(enabled!==true) return async()=>{throw new Error('Email provider is disabled');};
 if(typeof apiKey!=='string'||!/^[A-Za-z0-9_-]{12,}$/.test(apiKey)||
    !apiKey.startsWith('re_'))
  throw new Error('Server email credential not configured');
 const sender=normalizeSender(from);
 if(!sender)throw new Error('Verified sender email not configured');
 if(typeof fetchImpl!=='function')
  throw new Error('Trusted HTTP transport not configured');
 return async function sendEmail(message){
  if(!message||typeof message!=='object'||
     typeof message.to!=='string'||message.to.length>254||
     !EMAIL.test(message.to)||!UUID.test(message.invitationId)||
     typeof message.subject!=='string'||message.subject.length>200||
     /[\r\n]/.test(message.subject)||
     typeof message.text!=='string'||message.text.length>12000||
     message.text.trim().length===0)
   throw new Error('Invalid email transport envelope');
  let response;
  try{
   response=await fetchImpl(RESEND_EMAILS_URL,{
    method:'POST',
    headers:{
     'Authorization':'Bearer '+apiKey,
     'Content-Type':'application/json',
     'Idempotency-Key':'workspace-invite/'+message.invitationId
    },
    body:JSON.stringify({
     from:sender,to:[message.to],subject:message.subject,text:message.text
    }),
    redirect:'error',
    signal:AbortSignal.timeout(8000)
   });
  }catch{
   // The provider may have sent the email despite a timeout.
   // Never leak keys, response bodies, or bearer invitation URLs.
   throw new Error('Email delivery result uncertain; reconciliation required');
  }
  if(!response||response.ok!==true||response.status<200||response.status>=300)
   throw new Error('Email provider refused or could not confirm delivery');
  let body;
  try{
   body=await response.json();
  }catch{
   throw new Error('Email provider response could not be verified');
  }
  if(!body||typeof body.id!=='string'||!UUID.test(body.id))
   throw new Error('Email provider acceptance receipt invalid');
  return Object.freeze({accepted:true});
 };
}
