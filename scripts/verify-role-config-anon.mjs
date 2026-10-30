/** CP-RC01.1: live anonymous denial against the installed Supabase Role Configuration API.
 * Uses ONLY the public publishable key. Never signs in, requests or logs a JWT, creates
 * a role, writes audit data, mutates memberships or modifies an application board.
 */
import assert from 'node:assert/strict';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '../frontend/config.js';

const safeHost='https://jtlusodorfnyzgyuewkz.supabase.co';
assert.equal(SUPABASE_URL,safeHost);
assert.match(SUPABASE_PUBLISHABLE_KEY,/^sb_publishable_[A-Za-z0-9_]+$/);
const noIdentity={
  apikey:SUPABASE_PUBLISHABLE_KEY,
  'content-type':'application/json',
  accept:'application/json'
};
const WORKSPACE='00000000-0000-4000-8000-000000000001';
const probes=[
 ['Bootstrap eligibility', '/rest/v1/rpc/apsyntra_role_is_bootstrap',{}],
 ['Bootstrap-scoped data snapshot','/rest/v1/rpc/apsyntra_role_configuration_snapshot',{p_workspace_id:WORKSPACE}],
 ['Direct proposal RPC', '/rest/v1/rpc/apsyntra_role_configuration_propose',
  {p_workspace_id:WORKSPACE,p_operation:'role.create',p_payload:{roleKey:'anon_must_never_write'}}]
];
for(const [name,path,payload] of probes){
 const res=await fetch(safeHost+path,{
  method:'POST',headers:noIdentity,body:JSON.stringify(payload),
  redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)
 });
 const data=await res.json().catch(()=>null);
 // Non-EXECUTABLE for anon; must not accept 2xx or a false value as authorization.
 assert.ok([401,403].includes(res.status),
  name+' must be denied to unsigned clients, received HTTP '+res.status);
 assert.ok(data&&typeof data==='object'&&!Array.isArray(data),
  name+' missing API denial response');
 console.log('PASS: unsigned '+name+' denied with HTTP '+res.status);
}
const table=await fetch(safeHost+'/rest/v1/apsyntra_role_templates?select=id&limit=1',{
  headers:noIdentity,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)
});
assert.ok([401,403].includes(table.status),
 'Anonymous direct table read must be denied, received HTTP '+table.status);
console.log('PASS: anonymous direct role catalog read denied HTTP '+table.status);
console.log('CP-RC01.1 REAL UNSIGNED API DENIAL: PASS (4/4) — no authentication impersonation or writes');
