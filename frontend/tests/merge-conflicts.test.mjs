/** PR #2 merge guard: CSP stylesheet numbering and Role Configuration must remain coherent. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const css=readFileSync('frontend/styles.css','utf8');
const js=readFileSync('frontend/app.js','utf8');
test('no Git conflict markers remain in runtime assets',()=>{
 for(const file of readdirSync('frontend').filter(x=>x.endsWith('.js')||x.endsWith('.css'))){
  const source=readFileSync('frontend/'+file,'utf8');
  assert.doesNotMatch(source,/^(?:<{7}|={7}|>{7})(?:\s|$)/m,'Unresolved conflict marker: '+file);
 }
});
test('every numbered CSP utility has a matching scoped declaration',()=>{
 for(const file of readdirSync('frontend').filter(x=>x.endsWith('.js'))){
  const source=readFileSync('frontend/'+file,'utf8');
  for(const item of source.matchAll(/\bcsp-u\d{3}\b/g)){
   assert.ok(css.includes('#app .'+item[0]+'{'),
    'Inconsistent CSP numbering in '+file+': '+item[0]);
  }
 }
});
test('bootstrap authorization and security routes survived merge',()=>{
 for(const source of [
  "import {RoleConfigurationClient} from './role-configuration-client.js'",
  "import {renderRoleConfiguration,ROLE_MODULE_OPTIONS} from './role-configuration-ui.js'",
  "roleConfig.bootstrapVerified()",
  "roleConfig.snapshot(context.workspace_id)",
  "state.roleVerified===true",
  "role-propose-permission",
  "role-propose-workspace",
  "runSignedNegativeBoardAcceptance",
  "runTwelveBoardQa",
 ]) assert.ok(js.includes(source),'Lost security integration: '+source);
});
