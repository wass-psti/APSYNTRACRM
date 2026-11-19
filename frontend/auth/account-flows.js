/** APSYNTRA CRM account access — no new identity database.
 * Registration MUST remain disabled until the existing production triggers are
 * corrected and the verified server-side admission gate is approved.
 * This module never saves recovery tokens to sessionStorage/localStorage.
 */
export const REGISTRATION_ADMISSION_ENABLED=false;
export const RECOVERY_REDIRECT_URL='https://wass-psti.github.io/APSYNTRACRM/?auth_action=recovery';
export const PASSWORD_MIN_LENGTH=12;
export const PASSWORD_MAX_LENGTH=72;
export const RECOVERY_CONFIRMATION='If the address is eligible, password recovery instructions will be sent. Check your inbox and spam folder.';
export const REGISTRATION_BLOCKED='Self-service registration is temporarily unavailable while verified-email signup and automatic personal Main Workspace provisioning are being secured. Existing accounts can still sign in.';

export function validateRegistration({name='',email='',password='',confirmation=''}={}){
 const errors={};
 if(String(name).trim().length<2||String(name).trim().length>120)
  errors.name='Enter your full name (2–120 characters).';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())||
    String(email).length>254)
  errors.email='Enter a valid email address.';
 const pw=validatePassword(password);
 if(pw)errors.password=pw;
 if(password!==confirmation)errors.confirmation='Passwords do not match.';
 return errors;
}
export function validatePassword(value){
 const pw=String(value??'');
 if(pw.length<PASSWORD_MIN_LENGTH||pw.length>PASSWORD_MAX_LENGTH)
  return 'Use a password between 12 and 72 characters.';
 if(!/[A-Za-z]/.test(pw)||!/[0-9]/.test(pw))
  return 'Include at least one letter and one number.';
 return '';
}
export function safeRecoveryError(error){
 if(error?.status===429)return 'Too many requests. Please try again later.';
 return RECOVERY_CONFIRMATION;
}
function tokenString(value){
 if(typeof value!=='string'||value.length<8||value.length>8192||
    !/^[A-Za-z0-9._-]+$/.test(value))return '';
 return value;
}
/** Parse and remove a GoTrue redirect fragment BEFORE any authenticated app load.
 * Supports both implicit access_token fragments and explicit token_hash links.
 */
export function captureAuthReturn(location,history){
 const query=new URLSearchParams(String(location?.search||'').replace(/^\?/,''));
 const fragment=new URLSearchParams(String(location?.hash||'').replace(/^#/,''));
 const hasAuthMarker=query.has('auth_action')||query.has('token_hash')||
  fragment.has('access_token')||fragment.has('error_code')||
  fragment.has('error_description')||fragment.has('type');
 if(!hasAuthMarker)return null;
 const type=String(fragment.get('type')||query.get('type')||'');
 const token=tokenString(fragment.get('access_token'));
 const hashToken=tokenString(query.get('token_hash'));
 const error=!!(fragment.get('error')||fragment.get('error_code')||
  query.get('error')||query.get('error_code'));
 const kind=type==='recovery'&&query.get('auth_action')!=='signup'?
  'recovery':type==='signup'||type==='email'?'confirmation':'invalid';
 const route=kind==='recovery'?'#/reset-password':'#/login';
 // Never leave one-time tokens or bearer credentials in address-bar history.
 if(typeof history?.replaceState==='function')
  history.replaceState(history.state??null,'',String(location.pathname||'/')+route);
 if(error||kind==='invalid'||kind==='recovery'&&!token&&!hashToken)
  return {kind:'invalid'};
 if(kind==='confirmation')return {kind:'confirmation'};
 return token?{kind:'recovery',accessToken:token}:
  {kind:'recovery',tokenHash:hashToken};
}
export async function inspectRecoveryToken(auth,callback){
 if(callback?.kind!=='recovery')throw Error('Invalid or expired password recovery link.');
 let token=callback.accessToken;
 if(!token&&callback.tokenHash){
  const response=await auth.call('/auth/v1/verify',{
   method:'POST',body:{type:'recovery',token_hash:callback.tokenHash}
  });
  token=tokenString(response?.access_token);
 }
 if(!token)throw Error('Invalid or expired password recovery link.');
 const user=await auth.call('/auth/v1/user',{accessToken:token});
 if(!user||typeof user.id!=='string'||!user.id)
  throw Error('Invalid or expired password recovery link.');
 return {accessToken:token,userId:user.id};
}
export async function requestPasswordRecovery(auth,email){
 const address=String(email||'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||address.length>254)
  throw Error('Enter a valid work email address.');
 try{await auth.passwordRecovery(address,RECOVERY_REDIRECT_URL);}
 catch(error){return safeRecoveryError(error);}
 return RECOVERY_CONFIRMATION;
}
/** A recovery token authorizes only a password update, never workspace admission.
 * Supabase global sign-out revokes refresh sessions; issued JWTs may remain
 * valid until expiry unless the server's session guard checks revocation.
 */
export async function applyRecoveredPassword(auth,recovery,password,confirmation){
 if(!recovery?.accessToken||!recovery?.userId)
  throw Error('Recovery link unavailable or expired.');
 const problem=validatePassword(password);
 if(problem)throw Error(problem);
 if(password!==confirmation)throw Error('Passwords do not match.');
 const user=await auth.call('/auth/v1/user',{accessToken:recovery.accessToken});
 if(!user?.id||user.id!==recovery.userId)
  throw Error('Recovery session could not be verified. Request a new link.');
 await auth.call('/auth/v1/user',{
  method:'PUT',accessToken:recovery.accessToken,body:{password}
 });
 let globalRevoked=false;
 try{
  await auth.call('/auth/v1/logout?scope=global',{
   method:'POST',accessToken:recovery.accessToken
  });
  globalRevoked=true;
 }catch{/* Do not claim global revocation when the provider did not confirm it. */}
 auth.clear();
 return {passwordChanged:true,globalRevoked};
}
