/** CP-FRT-SEC01B: real public-API denial for retired role-admin endpoints.
 * No access tokens, database writes, service credentials, or fake signed sessions.
 */
import assert from 'node:assert/strict';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '../frontend/config.js';
assert.equal(SUPABASE_URL,'https://jtlusodorfnyzgyuewkz.supabase.co');
const headers={apikey:SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json',accept:'application/json'};
const ws='00000000-0000-4000-8000-000000000001';
const tests=[
 ['frt_admin_users',{p_workspace_id:ws}],
 ['frt_admin_set_role',{p_workspace_id:ws,p_user_id:'11111111-1111-4111-8111-111111111111',p_role:'REQUESTOR'}],
 ['wm_admin_set_application_role',{p_user_id:'11111111-1111-4111-8111-111111111111',
    p_module_id:'fund-released-tracker',p_role:'REQUESTOR',p_enabled:true}],
 ['apsyntra_role_manage_user_access',{p_workspace_id:ws,
    p_target_user_id:'11111111-1111-4111-8111-111111111111',p_scope:'module',
    p_resource_id:'fund-released-tracker',p_role:'REQUESTOR',p_enabled:true}]
];
for(const [name,payload] of tests){
 const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,
  {method:'POST',headers,body:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(15000)});
 assert.ok([401,403].includes(r.status),name+' anonymous request unexpectedly accepted: '+r.status);
 console.log('PASS: anonymous '+name+' denied HTTP '+r.status);
}
console.log('CP-FRT-SEC01B direct API anonymous denial PASS (4/4)');
