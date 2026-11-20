import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessSignedPair} from '../../scripts/cp-crm-urm-integrity-03-signed-native.mjs';
const a='1111111111111111',b='2222222222222222';
const ws='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const primary={tab:1,signed:true,active:true,accountKey:a,workspaceId:ws};
const peer={tab:2,signed:true,active:true,accountKey:b,workspaceId:ws};
test('same-workspace two separately signed accounts are eligible, never automatically accepted',()=>{
 assert.deepEqual(assessSignedPair([primary,peer],[a,b]),
  {status:'ELIGIBLE',reason:'Genuine same-workspace signed accounts verified'});
});
test('different workspaces, different user expectations or missing tabs block cross-user claim',()=>{
 assert.equal(assessSignedPair([primary,{...peer,workspaceId:other}],[a,b]).status,'BLOCKED');
 assert.equal(assessSignedPair([primary,peer],[a,a]).status,'BLOCKED');
 assert.equal(assessSignedPair([primary,peer],[a,'ffffffffffffffff']).status,'BLOCKED');
 assert.equal(assessSignedPair([primary,{...peer,active:false}],[a,b]).status,'BLOCKED');
 assert.equal(assessSignedPair([primary,{...peer,signed:false}],[a,b]).status,'BLOCKED');
 assert.equal(assessSignedPair([primary,{...peer,tab:1}],[a,b]).status,'BLOCKED');
});
test('read-only signed probing only visits positively authorized modules and restores each tab',()=>{
 const s=readFileSync('scripts/cp-crm-urm-integrity-03-signed-native.mjs','utf8');
 assert.ok(s.includes("if(module.allowed!==true)"));
 assert.ok(s.includes('await page.goto(original'));
 assert.ok(s.includes('native_application_board_context'));
 assert.ok(s.includes('access.modules.find'));
 assert.ok(s.includes('hash(obj.userId)===key'));
 assert.doesNotMatch(s,/sessionStorage|localStorage|document.cookie|setSession\(|signIn\(|service_role|\.fill\(|\.click\(|\.submit\(/);
});
test('scoped-role matrix runs five isolated canonical SQL setter acceptance contracts',()=>{
 const script=readFileSync('scripts/cp-crm-urm-integrity-03-scoped-matrix.sh','utf8');
 const workflow=readFileSync('.github/workflows/cp-crm-urm-integrity-03-scoped-matrix.yml','utf8');
 for(const domain of ['fund-tracker','six-apps','charter','fueltrans','tooltrace']){
  assert.ok(script.includes(`${domain})`),domain);
  assert.ok(workflow.includes(domain));
 }
 assert.ok(script.includes('case "$PGHOST" in 127.0.0.1|localhost'));
 assert.match(workflow,/image: postgres:17/);
 assert.doesNotMatch(script,/supabase db push|supabase link|service_role|production\.supabase\.co/);
});
