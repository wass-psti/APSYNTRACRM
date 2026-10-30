/** Independent post-deployment smoke test against the LIVE GitHub Pages CDN.
 * No access tokens, cookies, database writes or server-side secrets are used.
 * Compares served assets with the exact checked-out source SHA.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
const origin='https://wass-psti.github.io/APSYNTRACRM/';
const sha=process.env.EXPECTED_DEPLOY_SHA || process.env.GITHUB_SHA || 'main';
const paths=['index.html','frontend/app.js','frontend/config.js','frontend/session.js',
 'frontend/data.js','frontend/acceptance.js','frontend/pages-persistence.js',
 'frontend/pages-acceptance-ui.js','frontend/native-client.js','frontend/native-qa.js',
 'frontend/board-manifest.js','frontend/board-foundation.js','frontend/board-foundation-ui.js',
 'frontend/board-grid.js','frontend/board-operational-qa.js',
 'frontend/board-security-targets.js','frontend/board-negative-acceptance.js','frontend/board-security-ui.js','frontend/board-negative-write.js',
 'frontend/role-configuration-ui.js','frontend/role-configuration-client.js','frontend/user-role-management.js','frontend/styles.css'];
const digest=x=>createHash('sha256').update(x).digest('hex');
function url(path){
 const remote=new URL(path==='index.html'?'./':path,origin);
 remote.searchParams.set('deploy_verify',sha);
 assert.equal(remote.origin,'https://wass-psti.github.io');
 return remote;
}
async function fetchAsset(path){
 const response=await fetch(url(path),{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200,path+' HTTP '+response.status);
 const type=response.headers.get('content-type')||'';
 const suffix=path.split('.').at(-1);
 assert.ok(suffix==='js'?(/javascript/.test(type)):suffix==='css'?type.includes('text/css'):type.includes('text/html'),
  path+' MIME '+type);
 const data=Buffer.from(await response.arrayBuffer());
 assert.ok(data.length>0,path+' empty');
 const local=readFileSync(path);
 assert.equal(digest(data),digest(local),path+' is stale or modified on the CDN');
}
async function check(){
 for(const path of paths){await fetchAsset(path);console.log('PASS: live '+path);}
 const backend=new URL('https://jtlusodorfnyzgyuewkz.supabase.co/auth/v1/health');
 const key=readFileSync('frontend/config.js','utf8').match(/sb_publishable_[A-Za-z0-9_]+/)?.[0];
 assert.ok(key,'Public publishable key missing');
 const response=await fetch(backend,{headers:{apikey:key},redirect:'error',signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200,'Supabase Auth health HTTP '+response.status);
 console.log('PASS: approved HTTPS Supabase Auth endpoint is reachable');
 const edge=new URL('https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/apsyntra-native-issues');
 const denied=await fetch(edge,{method:'POST',headers:{apikey:key,'content-type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(15000)});
 assert.ok([401,403].includes(denied.status),
  'Hosted native Issue endpoint must reject unsigned requests (HTTP '+denied.status+')');
 console.log('PASS: hosted native Issue endpoint rejects requests without a signed bearer');
}
let last;
for(let attempt=1;attempt<=10;attempt++){
 try{await check();console.log('LIVE PAGES SMOKE: PASS for '+sha);process.exit(0);}
 catch(error){last=error;console.error('Deployment propagation attempt '+attempt+': '+error.message);
   if(attempt<10)await sleep(4000);}
}
console.error('LIVE PAGES SMOKE: FAIL — '+last?.message);
process.exitCode=1;
