/** SB07: token-free diagnostic for the canonical WatchdogWorkspace 5173 host.
 * Read-only GET only. This file never launches a listener or makes DB writes.
 */
import {pathToFileURL} from 'node:url';
export const HOST_ORIGIN='http://127.0.0.1:5173';
const BOARD='11111111-1111-4111-8111-111111111111';
const WORKSPACE='22222222-2222-4222-8222-222222222222';
const diagnosticPath='/api/v1/huly/boards/'+BOARD+'/documents/huly.issue.sb07.probe?workspace_id='+WORKSPACE;
function reason(error){
 const code=error?.cause?.code||error?.code;
 if(code==='ECONNREFUSED')return 'CONNECTION_REFUSED';
 if(code==='ETIMEDOUT'||error?.name==='TimeoutError')return 'CONNECTION_TIMEOUT';
 if(code==='EHOSTUNREACH'||code==='ENETUNREACH')return 'UNREACHABLE_HOST';
 return 'NETWORK_FAILURE';
}
function detail(status,contentType,marker){
 if(marker==='board-api-v1')return{status:'ready',code:'HULY_MOUNT_CONFIRMED',detail:'The Huly middleware responded with its integration marker.'};
 if(status===401)return{status:'pending',code:'AUTH_GUARD_ONLY',detail:'An authentication guard answered 401, but the Huly middleware marker is missing. Mount still unverified.'};
 if(contentType.includes('text/html'))return{status:'blocked',code:'SPA_FALLBACK',detail:'The host returned HTML for an API route; Huly middleware is not mounted before SPA fallback.'};
 if(status===404)return{status:'blocked',code:'ROUTE_NOT_FOUND',detail:'The host is reachable, but the Huly endpoint was not found.'};
 return{status:'blocked',code:'UNEXPECTED_ROUTE',detail:'The host returned HTTP '+status+' without the Huly middleware marker.'};
}
export async function probeHost({fetchImpl=fetch,origin=HOST_ORIGIN}={}){
 if(origin!==HOST_ORIGIN)throw Error('Only the approved 127.0.0.1:5173 origin is supported');
 let root;
 try{
  root=await fetchImpl(origin+'/',{method:'GET',redirect:'error',signal:AbortSignal.timeout(5000)});
 }catch(err){return{status:'blocked',code:reason(err),detail:'No HTTP response from '+origin+'. Start the existing WatchdogWorkspace host using scripts/cp1612h-start-board-host.mjs.'};}
 let response;
 try{
  response=await fetchImpl(origin+diagnosticPath,{method:'GET',redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(5000)});
 }catch(err){return{status:'blocked',code:reason(err),detail:'The host responded to / but failed on the Huly API request.'};}
 const result=detail(response.status,response.headers.get('content-type')||'',response.headers.get('x-apsyntra-huly')||'');
 return{...result,rootStatus:root.status,routeStatus:response.status};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await probeHost();
 console.log('========== CANONICAL 5173 HOST PREFLIGHT ==========');
 console.log('Status: '+result.status.toUpperCase()+' — '+result.code);
 console.log(result.detail);
 if(result.rootStatus!==undefined)console.log('Frontend HTTP: '+result.rootStatus);
 if(result.routeStatus!==undefined)console.log('Huly API HTTP: '+result.routeStatus);
 if(result.status==='blocked')process.exitCode=2;
 else if(result.status==='pending')process.exitCode=3;
}
