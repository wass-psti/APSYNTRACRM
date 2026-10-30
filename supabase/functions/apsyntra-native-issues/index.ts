/** APSYNTRA native Issue transactions hosted at the existing Supabase project.
 * Signed-user only, existing RBAC/RLS, and the canonical atomic transaction RPC.
 * No service-role key, database password, local host or new authorization framework.
 */
import {createLiveSb06NativeIssues} from './vendor/supabase-live.ts';
import {Denied,VersionConflict,ServiceUnavailable,isUuid} from './vendor/sb02.ts';

const PAGE_ORIGIN='https://wass-psti.github.io';
const MAX_BYTES=230000;
const headers=(origin:string|null)=>({
 'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store',
 'x-content-type-options':'nosniff',
 ...(origin===PAGE_ORIGIN?{'access-control-allow-origin':PAGE_ORIGIN,'vary':'Origin'}:{}),
 'access-control-allow-headers':'authorization,apikey,content-type',
 'access-control-allow-methods':'POST,OPTIONS'
});
function json(status:number,body:unknown,origin:string|null):Response{
 return new Response(JSON.stringify(body),{status,headers:headers(origin)});
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin');
 if(origin!==null&&origin!==PAGE_ORIGIN)return json(403,{error:'Origin denied'},null);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=='POST')return json(405,{error:'Method not allowed'},origin);
 const rawAuth=req.headers.get('authorization')??'';
 if(!rawAuth.startsWith('Bearer ')||rawAuth.length>8200)return json(401,{error:'Authentication required'},origin);
 const token=rawAuth.slice(7);
 const contentType=req.headers.get('content-type')??'';
 if(!/^application\/json(?:;|$)/i.test(contentType))return json(415,{error:'JSON required'},origin);
 const declared=Number(req.headers.get('content-length')??0);
 if(declared>MAX_BYTES)return json(413,{error:'Request too large'},origin);
 let body:unknown;
 try{
   const raw=await req.text();
   if(new TextEncoder().encode(raw).byteLength>MAX_BYTES)return json(413,{error:'Request too large'},origin);
   body=JSON.parse(raw);
 }catch{return json(400,{error:'Malformed JSON'},origin);}
 if(!body||typeof body!=='object'||Array.isArray(body))return json(400,{error:'Invalid request'},origin);
 const data=body as Record<string,unknown>;
 if(!isUuid(data.boardId as string)||!isUuid(data.workspaceId as string)||
    !Array.isArray(data.txes)||data.txes.length<1||data.txes.length>25)
  return json(400,{error:'Invalid transaction scope or batch'},origin);
 const url=Deno.env.get('SUPABASE_URL');
 const key=Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!key)return json(503,{error:'Backend configuration unavailable'},origin);
 try{
   const gateway=createLiveSb06NativeIssues(url,key);
   const result=await gateway.commit(token,data.workspaceId as string,data.boardId as string,data.txes);
   return json(200,result,origin);
 }catch(err){
   if(err instanceof Denied)return json(403,{error:'Not permitted by central workspace authorization'},origin);
   if(err instanceof VersionConflict)return json(409,{error:'Revision conflict'},origin);
   if(err instanceof ServiceUnavailable)return json(503,{error:'Existing transaction service unavailable'},origin);
   // Never emit exception content or any credentials to public clients.
   return json(400,{error:'Native Issue transaction rejected'},origin);
 }
});
