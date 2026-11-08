import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AuthClient} from '../session.js';

test('password change is signed-session-only and changes only Supabase Auth password',async()=>{
 const auth=new AuthClient({storage:null});
 await assert.rejects(auth.changePassword('TestPassword2026!'),/Sign in/);
 auth.session={user:{id:'actor-id'},access_token:'test-access-token',
  refresh_token:'test-refresh-token',expires_at:Date.now()+120000};
 let calls=0;
 auth.authorized=async(path,options)=>{
  calls++;
  assert.equal(path,'/auth/v1/user');
  assert.equal(options.method,'PUT');
  assert.deepEqual(options.body,{password:'TestPassword2026!'});
  return {id:'actor-id'};
 };
 assert.equal(await auth.changePassword('TestPassword2026!'),true);
 assert.equal(calls,1);
 assert.equal(auth.isSignedIn,true,'caller controls logout after verified update');
});
test('provider identity mismatch denies success and does not claim update',async()=>{
 const auth=new AuthClient({storage:null});
 auth.session={user:{id:'actor-id'},access_token:'token',refresh_token:'refresh',
  expires_at:Date.now()+120000};
 auth.authorized=async()=>({id:'another-id'});
 await assert.rejects(auth.changePassword('TestPassword2026!'),/could not be verified/);
});
test('Settings exposes protected password fields, validates and ends session after success',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/id="settings-change-password"/);
 assert.match(app,/name="password" type="password" autocomplete="new-password"/);
 assert.match(app,/name="confirmation" type="password" autocomplete="new-password"/);
 assert.match(app,/validatePassword\(password\)/);
 assert.match(app,/await auth\.changePassword\(password\)/);
 assert.match(app,/await auth\.signOut\(\{scope:'global'\}\)/);
 assert.match(app,/event\.target\.id==='settings-change-password'/);
 assert.doesNotMatch(app,/localStorage\.setItem\([^)]*password/);
});
