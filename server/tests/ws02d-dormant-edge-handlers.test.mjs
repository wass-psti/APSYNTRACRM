import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dormantWorkspaceInvitationHandler} from '../../supabase/functions/_shared/ws02d-inactive.mjs';
const origin='https://wass-psti.github.io';
for(const name of ['ws02d-invite','ws02d-accept']){
 test(`${name}: deployed source cannot issue invitations, accept tokens or bypass gateway JWT`,()=>{
  const source=readFileSync(`supabase/functions/${name}/index.ts`,'utf8');
  assert.match(source,/Deno\.serve\(dormantWorkspaceInvitationHandler\)/);
  assert.doesNotMatch(source,/--no-verify-jwt|private\.ws02d|sendEmail|service_role/);
 });
}
test('dormant routes deny foreign origins and never read or persist invitation payloads',async()=>{
 const call=(method,site=origin)=>dormantWorkspaceInvitationHandler(new Request('https://example.invalid',{method,
  headers:{origin:site,...(method==='POST'?{'content-type':'application/json'}:{})},
  ...(method==='POST'?{body:JSON.stringify({token:'secret-token',email:'private@example.invalid'})}:{})}));
 assert.equal(call('POST','https://evil.invalid').status,403);
 assert.equal(call('GET').status,405);
 assert.equal(call('OPTIONS').status,204);
 const res=call('POST');
 assert.equal(res.status,503);
 assert.equal(res.headers.get('cache-control'),'no-store, max-age=0');
 assert.equal(res.headers.get('access-control-allow-origin'),origin);
 assert.deepEqual(await res.json(),{state:'unavailable'});
});
