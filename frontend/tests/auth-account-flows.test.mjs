import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderAuthMarkup} from '../auth-markup.js';
import {formSubmitAction,validateAccessRequest,FORM_SUBMIT_RECIPIENT_ALIAS} from '../request-access.js';
import {
 REGISTRATION_ADMISSION_ENABLED,REGISTRATION_BLOCKED,RECOVERY_REDIRECT_URL,
 RECOVERY_CONFIRMATION,validateRegistration,validatePassword,
 safeRecoveryError,captureAuthReturn,inspectRecoveryToken,requestPasswordRecovery,
 applyRecoveredPassword
} from '../auth-account-flows.js';

const client=readFileSync('frontend/session.js','utf8');
const app=readFileSync('frontend/app.js','utf8');
const source=readFileSync('frontend/auth-account-flows.js','utf8');
const css=readFileSync('frontend/auth-experience.css','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

test('activated FormSubmit request form never creates a Supabase account',()=>{
 assert.equal(REGISTRATION_ADMISSION_ENABLED,false);
 assert.match(REGISTRATION_BLOCKED,/Self-service registration is temporarily unavailable/);
 assert.equal(FORM_SUBMIT_RECIPIENT_ALIAS,'a87807597aa2d1a9a77c6e28e2413e1a');
 assert.equal(formSubmitAction(),'https://formsubmit.co/a87807597aa2d1a9a77c6e28e2413e1a');
 const markup=renderAuthMarkup({mode:'register',year:2026});
 for(const piece of ['id="register-form" method="POST"',
  'id="register-name"','id="register-email"',
  'autocomplete="name"','aria-describedby="auth-registration-status"',
  'Submit access request','name="_honey"','name="_next"',
  'name="consent" value="yes" type="checkbox" required'])
  assert.ok(markup.includes(piece),piece);
 assert.match(markup,/action="https:\/\/formsubmit.co\/a87807597aa2d1a9a77c6e28e2413e1a"/);
 assert.doesNotMatch(markup,/name="password"|name="confirmation"|Create account/);
 assert.match(markup,/FormSubmit may retain requests for 30 days/);
 assert.match(markup,/formsubmit.co\/privacy.pdf/);
 const blocked=renderAuthMarkup({mode:'register',requestAlias:''});
 assert.match(blocked,/Request access — awaiting setup/);
 assert.match(blocked,/disabled aria-describedby="auth-registration-status"/);
 assert.equal(formSubmitAction(''),'');
 assert.equal(formSubmitAction('x" onsubmit=evil'), '');
 assert.match(app,/validateAndSubmitAccessRequest/);
 assert.doesNotMatch(app,/auth\.signUp\(|auth\.register\(/);
 assert.doesNotMatch(client,/auth\/v1\/signup/);
});
test('FormSubmit inputs are validated without collecting credentials',()=>{
 assert.equal(validateAccessRequest({name:'Example Person',email:'request@example.invalid',consent:true}),'');
 assert.match(validateAccessRequest({name:'',email:'a@example.com',consent:true}),/full name/);
 assert.match(validateAccessRequest({name:'<img>',email:'a@example.com',consent:true}),/full name/);
 assert.match(validateAccessRequest({name:'Example',email:'invalid',consent:true}),/valid email/);
 assert.match(validateAccessRequest({name:'Example',email:'ok@example.com'}),/Consent/);
 assert.match(app,/Native POST preserves FormSubmit CAPTCHA/);
 assert.match(app,/validateAndSubmitAccessRequest\(event.target,event\)/);
 assert.doesNotMatch(readFileSync('frontend/request-access.js','utf8'),/service_role|secret_key|createUser\(|app_metadata/);
});
test('registration validation handles names, format, password and mismatched confirmation without role claims',()=>{
 assert.deepEqual(validateRegistration({
  name:'Test Candidate',email:'candidate@example.test',
  password:'SafePassword2026!',confirmation:'SafePassword2026!'
 }),{});
 const bad=validateRegistration({name:'',email:'bad',password:'x',confirmation:'y'});
 assert.ok(bad.name);assert.ok(bad.email);assert.ok(bad.password);assert.ok(bad.confirmation);
 assert.match(validatePassword(''),/12 and 72/);
 assert.match(validatePassword('lettersbutnonumbers'),/letter and one number/);
 assert.equal(validatePassword('LongEnough2026'), '');
 assert.match(source,/REGISTRATION_ADMISSION_ENABLED=false/);
 assert.doesNotMatch(source,/platform_role|workspace_id|admin_general_manager|user_metadata|role:/);
});

test('login and recovery navigation retain known form IDs and accessible password controls',()=>{
 const login=renderAuthMarkup({mode:'login',year:2026});
 const forgot=renderAuthMarkup({mode:'forgot'});
 const reset=renderAuthMarkup({mode:'reset',resetReady:true});
 assert.match(login,/id="login-form"/);
 assert.match(login,/id="email" name="email" type="email"/);
 assert.match(login,/id="password" name="password" type="password"/);
 assert.match(login,/data-action="toggle-password"/);
 assert.match(login,/href="#\/register"/);
 assert.match(login,/href="#\/forgot-password"/);
 assert.match(forgot,/id="forgot-form"/);
 assert.match(forgot,/autocomplete="email"/);
 assert.match(reset,/id="reset-form"/);
 assert.match(reset,/id="reset-password"/);
 assert.match(reset,/autocomplete="new-password"/);
 assert.match(reset,/data-password-target="reset-confirm"/);
 assert.match(renderAuthMarkup({mode:'reset',resetReady:false}),/recovery link is unavailable or expired/i);
 assert.match(renderAuthMarkup({notice:'Please check your email'}),/role="status">Please check your email/);
 assert.doesNotMatch(renderAuthMarkup({notice:'<img onerror=x>'}),/<img onerror=/);
});
test('production redirect has fixed HTTPS origin, clean base path and no open redirect parameter',()=>{
 const u=new URL(RECOVERY_REDIRECT_URL);
 assert.equal(u.origin,'https://wass-psti.github.io');
 assert.equal(u.pathname,'/APSYNTRACRM/');
 assert.equal(u.search,'?auth_action=recovery');
 assert.equal(u.hash,'');
 assert.doesNotMatch(RECOVERY_REDIRECT_URL,/redirect_to=|next=|access_token/);
 assert.match(client,/passwordRecovery\(email,redirectTo\)/);
 assert.match(client,/encodeURIComponent\(redirect.href\)/);
});
function locationParts(fragment,query=''){
 return {pathname:'/APSYNTRACRM/',search:query,hash:fragment};
}
test('implicit recovery fragment is immediately scrubbed before verification or app restoration',()=>{
 let replaced='';
 const history={state:null,replaceState(_state,_title,url){replaced=url;}};
 const token='a'.repeat(64);
 const callback=captureAuthReturn(locationParts('#access_token='+token+'&refresh_token='+
  'b'.repeat(64)+'&type=recovery','?auth_action=recovery'),history);
 assert.deepEqual(callback,{kind:'recovery',accessToken:token});
 assert.equal(replaced,'/APSYNTRACRM/#/reset-password');
 assert.equal(replaced.includes('a'.repeat(64)),false);
 assert.equal(replaced.includes('refresh_token'),false);
 assert.match(app,/captureAuthReturn\(location,history\)/);
 assert.ok(app.indexOf('captureAuthReturn(location,history)')<
  app.indexOf('if(await startupVerifiedRead(async()=>await auth.restore()))'));
 assert.match(app,/auth\.clear\(\)/);
});
test('token-hash recovery links and missing or malformed callbacks fail closed',()=>{
 const cases=[
  {url:locationParts('','?type=recovery&token_hash='+'f'.repeat(64)),kind:'recovery'},
  {url:locationParts('#error=access_denied&error_code=otp_expired','?auth_action=recovery'),kind:'invalid'},
  {url:locationParts('#access_token=x&type=recovery'),kind:'invalid'},
  {url:locationParts('#access_token='+'x'.repeat(64)+'&type=unknown'),kind:'invalid'},
  {url:locationParts('#access_token='+'x'.repeat(64)+'&type=signup'),kind:'confirmation'}
 ];
 for(const {url,kind} of cases){
  let replaced='';
  const result=captureAuthReturn(url,{replaceState:(_a,_b,r)=>{replaced=r;}});
  assert.equal(result.kind,kind);
  assert.ok(replaced.startsWith('/APSYNTRACRM/#/'));
  assert.ok(!replaced.includes('access_token'));
  assert.ok(!replaced.includes('token_hash'));
 }
 assert.equal(captureAuthReturn(locationParts('#/login'),{replaceState(){throw Error('not auth');}}),null);
});
test('recovery callback verifies bearer identity with provider but never installs a normal CRM session',async()=>{
 const token='R'.repeat(120);
 const calls=[];
 const auth={call:async(path,params)=>{
  calls.push({path,params});
  if(path==='/auth/v1/user')return {id:'verified-user-id'};
  throw Error('Unexpected');
 }};
 const got=await inspectRecoveryToken(auth,{kind:'recovery',accessToken:token});
 assert.deepEqual(got,{accessToken:token,userId:'verified-user-id'});
 assert.equal(calls.length,1);
 assert.equal(calls[0].params.accessToken,token);
 assert.doesNotMatch(source,/auth\.save\(|\.storage\.setItem\(/);
 await assert.rejects(inspectRecoveryToken(auth,{kind:'invalid',accessToken:token}),/invalid or expired/i);
});
test('token-hash uses verified recovery-only OTP exchange',async()=>{
 const paths=[];
 const hash='f'.repeat(64);
 const auth={call:async(path,opts)=>{
  paths.push({path,opts});
  if(path==='/auth/v1/verify')return {access_token:'T'.repeat(100)};
  return {id:'same-person'};
 }};
 const result=await inspectRecoveryToken(auth,{kind:'recovery',tokenHash:hash});
 assert.equal(result.userId,'same-person');
 assert.equal(paths[0].path,'/auth/v1/verify');
 assert.deepEqual(paths[0].opts.body,{type:'recovery',token_hash:hash});
 assert.equal(paths[1].path,'/auth/v1/user');
});
test('forgot password confirmation is neutral for known and unknown identities, including network failure',async()=>{
 const sent=[];
 const success={passwordRecovery:async(email,url)=>{sent.push([email,url]);}};
 const failure={passwordRecovery:async()=>{throw Object.assign(Error('User not found'),{status:400});}};
 assert.equal(await requestPasswordRecovery(success,'  candidate@example.test  '),RECOVERY_CONFIRMATION);
 assert.equal(await requestPasswordRecovery(failure,'candidate@example.test'),RECOVERY_CONFIRMATION);
 assert.deepEqual(sent,[['candidate@example.test',RECOVERY_REDIRECT_URL]]);
 assert.equal(safeRecoveryError({status:429}),'Too many requests. Please try again later.');
 assert.equal(safeRecoveryError({status:404}),RECOVERY_CONFIRMATION);
 await assert.rejects(requestPasswordRecovery(success,'bad'),/valid work email/);
});
test('successful reset verifies same actor, updates password, requests global logout then clears local session',async()=>{
 const calls=[];
 let cleared=0;
 const auth={
  call:async(path,options)=>{
   calls.push({path,method:options?.method,token:options?.accessToken,body:options?.body});
   if(path==='/auth/v1/user'&&options?.method!=='PUT')return {id:'account-A'};
   return {};
  },
  clear(){cleared++;}
 };
 const ticket={accessToken:'T'.repeat(64),userId:'account-A'};
 const result=await applyRecoveredPassword(auth,ticket,'StrongPassword2026!','StrongPassword2026!');
 assert.deepEqual(result,{passwordChanged:true,globalRevoked:true});
 assert.deepEqual(calls.map(c=>c.path),
  ['/auth/v1/user','/auth/v1/user','/auth/v1/logout?scope=global']);
 assert.equal(calls[1].method,'PUT');
 assert.deepEqual(calls[1].body,{password:'StrongPassword2026!'});
 assert.equal(calls[2].method,'POST');
 assert.equal(cleared,1);
 assert.ok(calls.every(c=>c.token===ticket.accessToken));
});
test('failed revocation never claims global logout, mismatched token never updates password',async()=>{
 let cleared=0,updated=0;
 const auth={
  call:async(path,options)=>{
   if(path==='/auth/v1/user'&&options?.method!=='PUT')return {id:'account-A'};
   if(path.startsWith('/auth/v1/logout'))throw Error('Provider revocation failed');
   updated++;return {};
  },
  clear(){cleared++;}
 };
 const ticket={accessToken:'T'.repeat(64),userId:'account-A'};
 assert.deepEqual(await applyRecoveredPassword(auth,ticket,'StrongPassword2026!','StrongPassword2026!'),
  {passwordChanged:true,globalRevoked:false});
 assert.equal(updated,1);assert.equal(cleared,1);
 const mismatch={call:async()=>({id:'different-account'}),clear(){throw Error('not allowed');}};
 await assert.rejects(applyRecoveredPassword(mismatch,ticket,'StrongPassword2026!','StrongPassword2026!'),
  /could not be verified/);
});
test('password validation fails before provider update and prevents replay without a recovery ticket',async()=>{
 const auth={call:async()=>{throw Error('Unexpected network request');},clear(){}};
 await assert.rejects(applyRecoveredPassword(auth,null,'SafePassword2026','SafePassword2026'),/unavailable/);
 await assert.rejects(applyRecoveredPassword(auth,{accessToken:'x',userId:'id'},'short','short'),/12 and 72/);
 await assert.rejects(applyRecoveredPassword(auth,{accessToken:'x',userId:'id'},'SafePassword2026','Mismatch'),/do not match/);
 assert.match(app,/recoveryContext=null/);
 assert.match(app,/renderLogin\(.*mode:'login'/s);
});
test('existing login, sessions, RLS, bootstrap access and signed routes remain unchanged',()=>{
 assert.match(app,/await auth\.signIn\(email,password\)/);
 assert.match(app,/await refreshWorkspace\(\)/);
 assert.match(app,/await auth\.signOut\(\)/);
 assert.match(app,/roleConfig\.bootstrapVerified\(\)/);
 assert.match(app,/if\(!state\.context\)return/);
 assert.match(app,/window\.addEventListener\('hashchange'/);
 assert.match(client,/STORE_KEY='apsyntra\.crm\.auth\.v1'/);
 assert.match(client,/async restore\(\)/);
 assert.match(client,/async getVerifiedUser\(\)/);
 assert.match(client,/async authorized\(/);
 assert.doesNotMatch(source,/user_metadata|platform_role|workspace_members|service_role/);
});
test('auth styling uses existing responsive design and strict CSP',()=>{
 for(const part of ['.auth-access-links','.auth-admission-warning','.auth-form-explanation',
  '.auth-message', '@media(max-width:540px)','@media(prefers-reduced-motion:reduce)',
  '@media(prefers-contrast:more)'])assert.ok(css.includes(part),part);
 assert.doesNotMatch(css,/@import|url\(https?:|@keyframes|animation:.*infinite/);
 assert.doesNotMatch(source,/\.innerHTML\s*=|document\.write|eval\(|\.storage\.setItem\(|\.storage\.getItem\(/);
 assert.match(smoke,/'frontend\/auth-account-flows\.js'/);
});
