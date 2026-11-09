/** CP-WS-02D/D: fail-closed, non-mutating production reservation of routes.
 * Does not read payloads, invoke Auth/SQL, send email or grant memberships.
 * This guard must be replaced only after signed rollout and recovery proof.
 */
const APP_ORIGIN='https://wass-psti.github.io';
export function dormantWorkspaceInvitationHandler(request){
 const origin=request?.headers?.get('origin');
 const allowed=origin===APP_ORIGIN;
 const headers={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store, max-age=0',
  'pragma':'no-cache',
  'referrer-policy':'no-referrer',
  'x-content-type-options':'nosniff',
  'vary':'Origin',
  ...(allowed?{
   'access-control-allow-origin':APP_ORIGIN,
   'access-control-allow-methods':'POST, OPTIONS',
   'access-control-allow-headers':'authorization,apikey,content-type'
  }:{})
 };
 if(!allowed)return new Response(JSON.stringify({state:'denied'}),{status:403,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return new Response(JSON.stringify({state:'denied'}),{status:405,headers});
 return new Response(JSON.stringify({state:'unavailable'}),{status:503,headers});
}
