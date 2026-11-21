/** Existing SMTP provider for workspace-specific one-time invitation emails.
 * Reuses the operator's SMTP server without changing GoTrue's Auth emails.
 * Credentials are injected only from Edge secrets. Never print sensitive data.
 * Submission != inbox delivery. An ambiguous outcome is never auto-retried.
 */
const EMAIL=/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET=/[\r\n\u0000]/;
export function validWorkspaceSmtpConfig({host,port,user,password,from}={}){
 return typeof host==='string'&&host.length<=253&&
  /^[a-zA-Z0-9.-]+$/.test(host)&&!host.startsWith('-')&&
  (Number(port)===465||Number(port)===587)&&
  typeof user==='string'&&user.length>0&&user.length<256&&!SECRET.test(user)&&
  typeof password==='string'&&password.length>0&&
  typeof from==='string'&&from.length<=254&&EMAIL.test(from);
}
export async function verifyWorkspaceSmtp({config,createTransport}={}){
 if(!validWorkspaceSmtpConfig(config)||typeof createTransport!=='function')
  return {state:'unavailable'};
 let transporter;
 try{
  const port=Number(config.port);
  transporter=createTransport({host:config.host,port,
   secure:port===465,requireTLS:port===587,
   auth:{user:config.user,pass:config.password},
   tls:{minVersion:'TLSv1.2'},
   connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
   pool:false});
  if(typeof transporter?.verify!=='function')return {state:'unavailable'};
  const verified=await transporter.verify();
  if(verified!==true)return {state:'unavailable'};
  return {state:'verified'};
 }catch{
  // Never expose SMTP errors; they can contain usernames or provider details.
  return {state:'unavailable'};
 }finally{
  try{transporter?.close?.()}catch{}
 }
}

export async function sendWorkspaceSmtp({config,envelope,createTransport}={}){
 if(!validWorkspaceSmtpConfig(config)||typeof createTransport!=='function')
  throw Error('SMTP provider is unavailable');
 const {to,subject,text,invitationId}=envelope??{};
 if(typeof to!=='string'||!EMAIL.test(to)||typeof subject!=='string'||
  subject.length>150||SECRET.test(subject)||typeof text!=='string'||
  text.length<12||text.length>12000||!UUID.test(invitationId))
  throw Error('Invalid SMTP invitation envelope');
 const port=Number(config.port);
 let transporter;
 try{
  transporter=createTransport({host:config.host,port,
   secure:port===465,requireTLS:port===587,
   auth:{user:config.user,pass:config.password},
   tls:{minVersion:'TLSv1.2'},
   connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
   pool:false});
  const response=await transporter.sendMail({from:config.from,to,subject,text,
   envelope:{from:config.from,to:[to]},disableFileAccess:true,disableUrlAccess:true});
  if(!Array.isArray(response?.accepted)||!response.accepted.some(x=>
   typeof x==='string'&&x.toLowerCase()===to.toLowerCase())||
   typeof response.messageId!=='string'||response.messageId.length<3)
   return {state:'uncertain',providerId:null};
  // Delivery ledger only permits alphanumeric/underscore/dash provider IDs.
  // Hash the provider message ID, not the invitation token or email address.
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(
   String(invitationId)+':'+response.messageId));
  const providerId='smtp_'+Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,40);
  return {state:'submitted',providerId};
 }catch{
  // May have succeeded before disconnect: never retry after ambiguous receipt.
  return {state:'uncertain',providerId:null};
 }finally{
  try{transporter?.close?.()}catch{}
 }
}
