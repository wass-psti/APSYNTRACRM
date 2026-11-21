import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sendWorkspaceSmtp,verifyWorkspaceSmtp,validWorkspaceSmtpConfig} from '../../supabase/functions/_shared/ws02d-smtp.mjs';
const config={host:'smtp.example.invalid',port:'465',user:'system@example.invalid',
 password:'synthetic-password-never-real',from:'invite@example.invalid'};
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token=id+'.'+'cd'.repeat(32);
const envelope={invitationId:id,to:'recipient@example.invalid',
 subject:'APSYNTRA CRM workspace invitation',text:'Accept this invitation: '+token};
function harness(response={accepted:[envelope.to],messageId:'<synthetic-msg@test.invalid>'}){
 const calls=[];
 let closes=0;
 const createTransport=opts=>{
  calls.push({opts});return {async sendMail(mail){calls.push({mail});
   if(response instanceof Error)throw response;return response},close(){closes++}};
 };
 return {createTransport,calls,get closes(){return closes}};
}
test('SMTP connection and authentication are verified before an invitation can be issued',async()=>{
 const calls=[];let closes=0;
 const createTransport=opts=>{calls.push(opts);return{
  async verify(){calls.push('verified');return true},close(){closes++}
 }};
 const result=await verifyWorkspaceSmtp({config,createTransport});
 assert.deepEqual(result,{state:'verified'});
 assert.equal(calls[0].host,config.host);
 assert.equal(calls[0].secure,true);
 assert.equal(calls[0].requireTLS,false);
 assert.equal(calls[0].tls.minVersion,'TLSv1.2');
 assert.deepEqual(calls[0].auth,{user:config.user,pass:config.password});
 assert.equal(calls[1],'verified');
 assert.equal(closes,1);
});
test('SMTP authentication failure is sanitized and closes the connection',async()=>{
 let closes=0;
 const result=await verifyWorkspaceSmtp({config,createTransport:()=>({
  async verify(){throw Error('bad password '+config.password)},close(){closes++}
 })});
 assert.deepEqual(result,{state:'unavailable'});
 assert.equal(closes,1);
 assert.doesNotMatch(JSON.stringify(result),/synthetic-password/);
});
test('SMTP verification requires a positive provider response',async()=>{
 const result=await verifyWorkspaceSmtp({config,createTransport:()=>({
  async verify(){return false},close(){}
 })});
 assert.deepEqual(result,{state:'unavailable'});
});
test('SMTP verification rejects incomplete config without opening a connection',async()=>{
 let connects=0;
 const result=await verifyWorkspaceSmtp({config:{...config,password:''},
  createTransport:()=>{connects++;return{async verify(){return true}}}});
 assert.deepEqual(result,{state:'unavailable'});
 assert.equal(connects,0);
});

test('SMTP 465 uses verified implicit TLS and authenticates from server-only config',async()=>{
 const h=harness();const r=await sendWorkspaceSmtp({config,envelope,createTransport:h.createTransport});
 assert.equal(r.state,'submitted');assert.match(r.providerId,/^smtp_[0-9a-f]{40}$/);
 assert.equal(h.calls.length,2);assert.equal(h.closes,1);
 assert.equal(h.calls[0].opts.secure,true);
 assert.equal(h.calls[0].opts.requireTLS,false);
 assert.equal(h.calls[0].opts.tls.minVersion,'TLSv1.2');
 assert.deepEqual(h.calls[0].opts.auth,{user:config.user,pass:config.password});
 assert.equal(h.calls[1].mail.to,envelope.to);
 assert.deepEqual(h.calls[1].mail.envelope,{from:config.from,to:[envelope.to]});
 assert.equal(h.calls[1].mail.disableFileAccess,true);
 assert.equal(h.calls[1].mail.disableUrlAccess,true);
 assert.equal(r.providerId.includes(token),false);
});
test('SMTP 587 requires STARTTLS; no insecure fallback',async()=>{
 const h=harness();const r=await sendWorkspaceSmtp({config:{...config,port:587},envelope,createTransport:h.createTransport});
 assert.equal(r.state,'submitted');assert.equal(h.calls[0].opts.secure,false);
 assert.equal(h.calls[0].opts.requireTLS,true);
});
test('missing SMTP credentials, invalid port, invalid sender, control characters rejected before connect',async()=>{
 for(const bad of [{...config,password:''},{...config,port:25},{...config,port:2525},
  {...config,from:'from@example.invalid\nBcc: evil@example.test'},
  {...config,user:'username\nwrong'},{...config,host:'not a host'}]){
  assert.equal(validWorkspaceSmtpConfig(bad),false);
  const h=harness();await assert.rejects(sendWorkspaceSmtp({config:bad,envelope,createTransport:h.createTransport}));
  assert.equal(h.calls.length,0);
 }
});
test('recipient/header token validation rejects before connecting',async()=>{
 for(const change of [{to:'invalid'},{subject:'Valid\nBcc: bad@example.invalid'},
  {text:'x'},{invitationId:'bad'}]){
  const h=harness();await assert.rejects(sendWorkspaceSmtp({config,envelope:{...envelope,...change},createTransport:h.createTransport}));
  assert.equal(h.calls.length,0);
 }
});
test('SMTP rejection, disconnect and no exact recipient receipt remain uncertain; never resend',async()=>{
 for(const response of [{accepted:[],rejected:[envelope.to],messageId:'<id>'},
  {accepted:['other@example.invalid'],messageId:'<id>'},
  new Error('contains '+token+' '+config.password)]){
  const h=harness(response);const r=await sendWorkspaceSmtp({config,envelope,createTransport:h.createTransport});
  assert.deepEqual(r,{state:'uncertain',providerId:null});
  assert.equal(h.calls.filter(v=>v.mail).length,1);
  assert.equal(h.closes,1);
  assert.equal(JSON.stringify(r).includes(token),false);
  assert.equal(JSON.stringify(r).includes(config.password),false);
 }
});
test('Edge trusted invitation maintains existing Resend fallback, default-off gate and SMTP config preflight before issuance',()=>{
 const edge=readFileSync('supabase/functions/_shared/ws02d-trusted.ts','utf8');
 assert.match(edge,/APSYNTRA_INVITE_TRANSPORT/);
 assert.match(edge,/validWorkspaceSmtpConfig\(config\)/);
 assert.match(edge,/verifyWorkspaceSmtp\(/);
 assert.ok(edge.indexOf('await verifyWorkspaceSmtp')<edge.indexOf('const receipt = await trustedSql'));
 assert.match(edge,/SMTP authentication failed; no invitation was issued/);
 assert.match(edge,/sendWorkspaceSmtp\(/);
 assert.match(edge,/import\('npm:nodemailer@10\.6\.0'\)/);
 assert.match(edge,/https:\/\/api\.resend\.com\/emails/);
 assert.match(edge,/APSYNTRA_INVITES_EDGE_ENABLED/);
 assert.match(edge,/recordDelivery\(actor,request\.workspaceId,receipt\.invitationId,/);
});
