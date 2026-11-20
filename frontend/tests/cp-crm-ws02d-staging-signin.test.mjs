import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../ws02d-staging-signin.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]+?)<\/script>/)?.[1];
test('staging sign-in is an isolated HTML entry point with no production credentials or auth calls',()=>{
 assert.ok(script); assert.match(html,/<meta name="referrer" content="no-referrer"/);
 assert.match(script,/https:\/\/jeqwjlxubntsddeauvqa\.supabase\.co/);
 assert.doesNotMatch(script,/jtlusodorfnyzgyuewkz|service_role|sb_secret_|localStorage|sessionStorage|indexedDB|document\.cookie|console\.log|window\.location/);
 assert.match(script,/email_confirmed_at/);assert.match(script,/is_anonymous===true/);
 assert.match(script,/a\.id===b\.id/);
 assert.match(script,/type:'email'/);
});
test('two-account sign-in uses GoTrue password or email OTP, never admin identity mutation',()=>{
 assert.match(script,/\/auth\/v1\/token\?grant_type=password/);
 assert.match(script,/\/auth\/v1\/otp/);
 assert.match(script,/\/auth\/v1\/verify/);
 assert.match(script,/\/auth\/v1\/user/);
 assert.doesNotMatch(script,/\/auth\/v1\/admin|updateUserById|email_confirmed_at\s*=|INSERT INTO auth/);
 assert.match(script,/field\.value=''/);
});
test('invitation controls remain user-initiated and validate isolated workspace and inbox token',()=>{
 assert.match(script,/crypto\.randomUUID\(\)/);
 assert.match(script,/INVITE_TOKEN\.test\(token\)/);
 assert.match(script,/UUID\.test\(id\)/);
 assert.match(script,/ws02d-\x27\+route/);
 for(const id of ['pair','send','list','accept']) assert.match(script,new RegExp('\\$\\(\\x27'+id+'\\x27\\)\\.addEventListener'));
});
test('staging script parses as JavaScript in an ES module',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:script,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});