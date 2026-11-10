/**
 * BS01 Local Invitation Lab — loopback only. NEVER deploy this as a public
 * server. Simulated actors, in-memory grants, and demo records ONLY.
 * Production Supabase is not contacted by any part of this server.
 */
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createBs01Sandbox} from './bs01-local-sandbox-core.mjs';

const __dirname=dirname(fileURLToPath(import.meta.url));
const allowedHost=new Set(['127.0.0.1','localhost']);
const MAX_BODY=4096;
const contentTypes={
 '/':'text/html; charset=utf-8',
 '/bs01-local-lab.js':'text/javascript; charset=utf-8',
 '/bs01-local-lab.css':'text/css; charset=utf-8'
};
const sources={
 '/':'../frontend/bs01-local-lab.html',
 '/bs01-local-lab.js':'../frontend/bs01-local-lab.js',
 '/bs01-local-lab.css':'../frontend/bs01-local-lab.css'
};
const csp="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
function send(res,status,body,{type='application/json; charset=utf-8'}={}){
 res.writeHead(status,{
  'Content-Type':type,'Cache-Control':'no-store, max-age=0',
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer','Content-Security-Policy':csp,
  'Cross-Origin-Resource-Policy':'same-origin'
 });
 res.end(typeof body==='string'?body:JSON.stringify(body));
}
const deny=(res,status=403,code='denied')=>send(res,status,{error:code});
function parseUrl(req){
 const host=req.headers.host||'';
 const valid=/^(?:localhost|127\.0\.0\.1):\d{2,5}$/i.test(host);
 if(!valid)throw Error('foreign_host');
 const url=new URL(req.url,'http://'+host);
 if(!allowedHost.has(url.hostname))throw Error('foreign_host');
 return url;
}
function actorToken(req){
 const authorization=req.headers['x-demo-session'];
 return typeof authorization==='string'&&authorization.length===64&&/^[a-f0-9]{64}$/.test(authorization)?
  authorization:null;
}
async function jsonBody(req){
 if(req.headers['content-type']!=='application/json')throw Object.assign(Error('invalid_json'),{status:415});
 if(Number(req.headers['content-length'])>MAX_BODY)throw Object.assign(Error('body_too_large'),{status:413});
 const chunks=[];let total=0;
 for await(const c of req){
  total+=c.length;
  if(total>MAX_BODY)throw Object.assign(Error('body_too_large'),{status:413});
  chunks.push(c);
 }
 if(!total)throw Object.assign(Error('invalid_json'),{status:400});
 let data;
 try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch{throw Object.assign(Error('invalid_json'),{status:400});}
 if(!data||typeof data!=='object'||Array.isArray(data))
  throw Object.assign(Error('invalid_json'),{status:400});
 return data;
}
function pathParams(url){
 if(url.pathname.startsWith('/api/guest/')){
  const match=/^\/api\/guest\/([0-9a-f-]{36})$/.exec(url.pathname);
  return match?{action:'guest-read',boardId:match[1]}:{action:'unknown'};
 }
 return {action:url.pathname};
}
function validRequestOrigin(req,url){
 const origin=req.headers.origin;
 // Requests from the local UI must be same-origin; no cross-site mutations.
 if(req.method!=='POST')return true;
 return typeof origin==='string'&&origin===url.origin;
}
export function createBs01LocalLabServer({sandbox=createBs01Sandbox()}={}){
 const server=http.createServer(async(req,res)=>{
  let url;
  try{url=parseUrl(req);}
  catch{return deny(res,403,'local_only');}
  if(!validRequestOrigin(req,url))return deny(res,403,'foreign_origin');
  if(req.method==='GET'&&sources[url.pathname]){
   try{
    const data=await readFile(join(__dirname,sources[url.pathname]));
    return send(res,200,data.toString('utf8'),{type:contentTypes[url.pathname]});
   }catch{return deny(res,500,'asset_unavailable');}
  }
  if(!url.pathname.startsWith('/api/'))return deny(res,404,'not_found');
  try{
   const {action,boardId}=pathParams(url);
   const sid=actorToken(req);
   if(action==='/api/session'&&req.method==='POST'){
    const body=await jsonBody(req);
    return send(res,200,sandbox.enter({role:body.role,email:body.email}));
   }
   if(!sid)return deny(res,401,'simulated_sign_in_required');
   if(action==='/api/boards'&&req.method==='GET')
    return send(res,200,{boards:sandbox.list(sid)});
   if(action==='/api/policy'&&req.method==='POST'){
    const body=await jsonBody(req);
    return send(res,200,sandbox.setPolicy(sid,{
     boardId:body.boardId,mode:body.mode,expectedRevision:body.expectedRevision
    }));
   }
   if(action==='/api/issue'&&req.method==='POST'){
    const body=await jsonBody(req);
    return send(res,200,sandbox.issue(sid,{
     boardId:body.boardId,recipientEmail:body.recipientEmail||null
    }));
   }
   if(action==='/api/accept'&&req.method==='POST'){
    const body=await jsonBody(req);
    return send(res,200,sandbox.accept(sid,body.token));
   }
   if(action==='/api/revoke'&&req.method==='POST'){
    const body=await jsonBody(req);
    return send(res,200,sandbox.revoke(sid,{invitationId:body.invitationId}));
   }
   if(action==='/api/events'&&req.method==='GET')
    return send(res,200,{events:sandbox.events(sid)});
   if(action==='guest-read'&&req.method==='GET')
    return send(res,200,sandbox.read(sid,boardId));
   return deny(res,404,'not_found');
  }catch(e){
   const code=typeof e?.code==='string'?'request_denied':typeof e?.message==='string'?'invalid_request':'unknown';
   const status=Number.isInteger(e?.status)&&e.status>=400&&e.status<=499?e.status:403;
   return deny(res,status,code);
  }
 });
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const server=createBs01LocalLabServer();
 const port=Number(process.env.BS01_LAB_PORT||8765);
 if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Invalid local port');
 server.listen(port,'127.0.0.1',()=>{
  process.stdout.write('BS01 LOCAL DEMO ONLY: http://127.0.0.1:'+port+'\n');
  process.stdout.write('No Supabase connection, real users, real permissions, or production records.\n');
 });
}
