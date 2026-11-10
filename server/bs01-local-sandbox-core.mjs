/**
 * BS01 LOCAL SANDBOX CORE
 * Isolated, in-memory, simulated identities + demonstration records ONLY.
 * Not a Supabase/Auth substitute. Never use these functions in production.
 */
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';

const DEMO_BOARDS=Object.freeze([
 Object.freeze({id:'11111111-1111-4111-8111-111111111111',name:'Demo Project Collaboration',kind:'generic',items:['Sample action: collect specifications','Sample action: review delivery date']}),
 Object.freeze({id:'22222222-2222-4222-8222-222222222222',name:'Demo Private HR',kind:'protected_app',items:['Never accessible to guests']}),
 Object.freeze({id:'33333333-3333-4333-8333-333333333333',name:'Demo Supplier Coordination',kind:'generic',items:['Sample action: confirm material availability']})
]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([0-9a-f]{64})$/i;
const EMAIL=/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
export const DEMO_ONLY=true;
export const DEMO_PROJECTS=DEMO_BOARDS.map(({id,name,kind})=>({id,name,kind}));

export class SandboxDenied extends Error{
 constructor(code='denied',status=403){super(code);this.code=code;this.status=status;}
}
const fail=(code,status)=>{throw new SandboxDenied(code,status);};
const bytes=n=>randomBytes(n);
const secret=()=>bytes(32).toString('hex');
const hexHash=(salt,token)=>createHash('sha256').update(salt).update(Buffer.from(token,'hex')).digest();
const normalizedEmail=value=>{
 const s=typeof value==='string'?value.trim().toLowerCase():'';
 if(s.length>254||!EMAIL.test(s))fail('invalid_email',400);
 return s;
};
const publicBoard=b=>({id:b.id,name:b.name,kind:b.kind});

export function createBs01Sandbox({clock=()=>Date.now()}={}){
 const boards=new Map(DEMO_BOARDS.map(b=>[b.id,{...b,mode:'private',revision:1}]));
 const sessions=new Map(),links=new Map(),grants=new Map(),audit=[];
 const requireSession=(sid,role)=>{
  const actor=sessions.get(sid);
  if(!actor||typeof sid!=='string'||(role&&actor.role!==role))
   fail('authentication_required',401);
  return actor;
 };
 const requireBoard=id=>{
  if(!UUID.test(id||''))fail('invalid_board',400);
  const board=boards.get(id);
  if(!board)fail('not_found',404);
  return board;
 };
 const requireShareable=b=>{
  if(b.kind!=='generic'||b.mode!=='guest_shareable')
   fail('not_shareable',403);
 };
 const record=(event,board,actor,linkId=null)=>{
  audit.push({event,boardId:board.id,actor:actor.email,linkId,at:new Date(clock()).toISOString()});
 };
 return Object.freeze({
  enter({role,email}={}){
   if(!['owner','guest'].includes(role))fail('invalid_role',400);
   const address=normalizedEmail(email);
   const sid=secret();
   sessions.set(sid,{role,email:address});
   return {session:sid,role,email:address,disclaimer:'SIMULATED ACCOUNT. Not a Supabase identity.'};
  },
  list(sid){
   requireSession(sid,'owner');
   return [...boards.values()].map(b=>({...publicBoard(b),mode:b.mode,revision:b.revision}));
  },
  setPolicy(sid,{boardId,mode,expectedRevision}={}){
   const actor=requireSession(sid,'owner'),b=requireBoard(boardId);
   if(!['private','workspace_restricted','guest_shareable'].includes(mode))
    fail('invalid_mode',400);
   if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
    fail('invalid_revision',400);
   if(b.revision!==expectedRevision)fail('stale_revision',409);
   if(mode==='guest_shareable'&&b.kind!=='generic')fail('protected_app',403);
   if(mode===b.mode)return {...publicBoard(b),mode:b.mode,revision:b.revision,changed:false};
   b.mode=mode;b.revision++;
   if(mode!=='guest_shareable'){
    for(const inv of links.values())if(inv.boardId===b.id)inv.revoked=true;
    for(const grant of grants.values())if(grant.boardId===b.id)grant.revoked=true;
   }
   record('policy.changed',b,actor);
   return {...publicBoard(b),mode:b.mode,revision:b.revision,changed:true};
  },
  issue(sid,{boardId,recipientEmail=null}={}){
   const actor=requireSession(sid,'owner'),b=requireBoard(boardId);
   requireShareable(b);
   const recipient=recipientEmail===null||recipientEmail===''?null:normalizedEmail(recipientEmail);
   const id=cryptoRandomUuid();
   const raw=secret(),salt=bytes(16);
   links.set(id,{id,boardId,salt,hash:hexHash(salt,raw),
    recipient,issuedBy:actor.email,expiresAt:clock()+24*60*60*1000,
    redeemedBy:null,revoked:false});
   record('link.issued',b,actor,id);
   return {invitationId:id,boardId,token:id+'.'+raw,expiresInHours:24,uses:1,
    warning:'This is a local simulation. The link contains NO production board access.'};
  },
  accept(sid,token){
   const actor=requireSession(sid,'guest');
   const match=typeof token==='string'&&TOKEN.exec(token);
   if(!match)fail('invalid_or_expired',403);
   const [,id,raw]=match,inv=links.get(id);
   if(!inv)fail('invalid_or_expired',403);
   const digest=hexHash(inv.salt,raw);
   if(!timingSafeEqual(digest,inv.hash)||inv.revoked||inv.redeemedBy||
      inv.expiresAt<=clock()||inv.recipient&&inv.recipient!==actor.email)
    fail('invalid_or_expired',403);
   const b=requireBoard(inv.boardId);
   requireShareable(b);
   const key=b.id+'|'+actor.email;
   if(grants.has(key))fail('already_granted',409);
   inv.redeemedBy=actor.email;
   grants.set(key,{boardId:b.id,actor:actor.email,linkId:id,revoked:false});
   record('link.redeemed',b,actor,id);
   return {boardId:b.id,role:'viewer',workspaceAccess:false,state:'accepted'};
  },
  read(sid,boardId){
   const actor=requireSession(sid,'guest'),b=requireBoard(boardId);
   const grant=grants.get(b.id+'|'+actor.email);
   if(!grant||grant.revoked)fail('access_denied',403);
   const invite=links.get(grant.linkId);
   if(!invite||invite.revoked||invite.redeemedBy!==actor.email)
    fail('access_denied',403);
   requireShareable(b);
   return {boardId:b.id,name:b.name,role:'viewer',workspaceAccess:false,
    items:[...b.items],notice:'SIMULATED DEMO RECORDS ONLY. No Supabase data.'};
  },
  revoke(sid,{invitationId}={}){
   const actor=requireSession(sid,'owner');
   const inv=links.get(invitationId);
   if(!inv)fail('not_found',404);
   inv.revoked=true;
   for(const grant of grants.values())if(grant.linkId===invitationId)grant.revoked=true;
   record('link.revoked',requireBoard(inv.boardId),actor,invitationId);
   return {revoked:true,boardId:inv.boardId};
  },
  events(sid){requireSession(sid,'owner');return audit.map(e=>({...e}));}
 });
}
function cryptoRandomUuid(){
 // UUID v4 from secure randomness; no dependencies required.
 const b=bytes(16);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const s=b.toString('hex');
 return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);
}
