import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync('frontend/app.js','utf8');
const mobile=readFileSync('frontend/mobile-home.js','utf8');
const css=readFileSync('frontend/mobile-home.css','utf8');
test('mobile launcher pins verified clock state above search and uses two-column favorites',()=>{
 assert.match(mobile,/clockCard\(items\) \+[\s\S]*?apsm-search/);
 assert.match(mobile,/apsm-clock-elapsed/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 const read=app.slice(app.indexOf('async function readMobileHomeClock()'),app.indexOf('function settingsPage()'));
 assert.match(read,/snapshot\(board.id,\{clockOnly:true\}\)/);
 assert.match(read,/snapshot\.access\?\.userId!==actor/);
 assert.match(read,/snapshot\.access\?\.workspaceId!==workspace/);
 assert.match(read,/SHARED_LOGIN/);
 assert.match(read,/timeTrackerPendingRecovery\.read/);
 assert.doesNotMatch(read,/\.commit\(|captureAttendanceGeo/);
});
test('mobile account switch explicitly requires a fresh login and stores no credentials',()=>{
 const markup=app.slice(app.indexOf('function mobileAccountIdentity()'),app.indexOf('async function readMobileHomeClock()'));
 assert.match(markup,/state\.context\.user_id!==auth\.userId/);
 assert.match(markup,/mobileAccountChoices\.values/);
 assert.match(markup,/data-action="logout"/);
 assert.match(markup,/Sign out of/);
 assert.doesNotMatch(markup,/access_token|refresh_token|localStorage|sessionStorage|password/);
 assert.match(app,/target&&!mobileAccountChoices\.has\(target\)/);
 assert.match(app,/insertAdjacentHTML\('afterbegin',mobileAccountMarkup\(\)\)/);
 assert.match(app,/auth\.onExpired=\(\)=>\{boardCacheChannel\.stop\(\);db\.invalidateBoardCache\(\);boardPreferences\.clearMemory\(\);ttWorkNoteDraft\.clear\(\);mobileAccountChoices\.clear\(\)/);
 assert.match(app,/if\(isMobileSwitch\)await auth\.signOut\(\{scope:'local'\}\)/);
});

test('mobile settings actions preserve signed security revocation and login cleanup',()=>{
 const settingsAction=app.slice(app.indexOf(" case 'mobile-account-security':{"),app.indexOf(" case 'ws01-open':{"));
 assert.match(settingsAction,/case 'mobile-account-security':\{[\s\S]*?break;\n \}\n case 'mobile-account-profile':\{[\s\S]*?break;\n \}\n case 'mobile-account-switch':\n case 'security-tl03-revoke-run':\n case 'security-ws02d-b3-revoke-run':\n case 'security-ws02d-b3-rls-handoff':\s*case 'logout':\{/);
 assert.match(settingsAction,/runTradeLinkLocalSessionRevocation\(\{auth,api:db\}\)/);
 assert.match(settingsAction,/runWs02dB3LocalSessionRevocation\(\{auth\}\)/);
 const login=app.slice(app.indexOf('function renderLogin('),app.indexOf('function renderLogin(')+800);
 assert.match(login,/stopTimeTrackerPixi\(\);\n \/\/ Clear detached protected item values on every signed-out transition\.\n hideModal\(\);\n if\(mode==='login'&&!emailValue\)emailValue=mobileAccountEmail;/);
});
