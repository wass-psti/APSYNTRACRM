/** Independent post-deployment smoke test against the LIVE GitHub Pages CDN.
 * No access tokens, cookies, database writes or server-side secrets are used.
 * Compares served assets with the exact checked-out source SHA.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {classifyPagesSmokeHead} from './pages-smoke-supersession.mjs';
const origin='https://wass-psti.github.io/APSYNTRACRM/';
const sha=process.env.EXPECTED_DEPLOY_SHA || process.env.GITHUB_SHA || 'main';
const inMainCI=process.env.GITHUB_ACTIONS==='true' &&
 process.env.GITHUB_REF==='refs/heads/main';
const repository=process.env.GITHUB_REPOSITORY;
if(inMainCI && (repository!=='wass-psti/APSYNTRACRM'||sha!==process.env.GITHUB_SHA))
 throw Error('Pages smoke CI repository or commit mismatch');
const githubHeaders={
 'Accept':'application/vnd.github+json',
 ...(process.env.GH_TOKEN?{Authorization:'Bearer '+process.env.GH_TOKEN}:{})
};
async function githubJSON(path){
 const response=await fetch('https://api.github.com/repos/wass-psti/APSYNTRACRM/'+path,{
  headers:githubHeaders,redirect:'error',cache:'no-store',
  signal:AbortSignal.timeout(15000)
 });
 assert.equal(response.status,200,'GitHub Pages source ancestry HTTP '+response.status);
 return response.json();
}
async function sourceIsSuperseded(){
 if(!inMainCI)return false;
 const head=(await githubJSON('git/ref/heads/main'))?.object?.sha;
 if(head===sha)return false;
 // Never waive live verification for an unrelated or rewritten branch.
 const comparison=await githubJSON('compare/'+sha+'...'+head);
 return classifyPagesSmokeHead(sha,head,comparison)==='SUPERSEDED';
}
function reportSuperseded(){
 console.log('LIVE PAGES SMOKE: SUPERSEDED — a newer verified descendant is main.');
 console.log('This source commit was NOT deployment-verified. Latest main remains responsible for live verification.');
}
const paths=['index.html','frontend/app.js','frontend/config.js','frontend/session.js',
 'frontend/data.js','frontend/acceptance.js','frontend/pages-persistence.js',
 'frontend/pages-acceptance-ui.js','frontend/native-client.js','frontend/native-qa.js',
 'frontend/board-manifest.js','frontend/board-foundation.js','frontend/board-foundation-ui.js',
 'frontend/board-grid.js','frontend/board-operational-qa.js',
 'frontend/board-security-targets.js','frontend/board-negative-acceptance.js','frontend/board-security-ui.js','frontend/board-negative-write.js',
 'frontend/role-configuration-ui.js','frontend/role-configuration-client.js','frontend/user-role-management.js',
 'frontend/frt-finance-readonly.js','frontend/frt-finance-ui.js','frontend/frt-finance-workflow.js',
 'frontend/styles.css','frontend/sidebar-experience.css','frontend/sidebar-visuals.js',
 'frontend/overview-experience.css','frontend/overview-visuals.js',
 'frontend/apsyntra-logo.webp','frontend/time-tracker-map.js',
 'frontend/time-tracker-log.js','frontend/time-tracker-gps.js',
 'frontend/time-tracker-gps.css','frontend/initialization-core.js',
 'frontend/initialization-neural-scene.js','frontend/initialization-core.css'];
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
 assert.ok(suffix==='js'?(/javascript/.test(type)):suffix==='css'?type.includes('text/css'):suffix==='webp'?type.includes('image/webp'):type.includes('text/html'),
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
for(let attempt=1;attempt<=25;attempt++){
 // CDN contents are inherently mutable. Do not compare a superseded source
 // against newer production assets and then report a false source regression.
 if(await sourceIsSuperseded()){reportSuperseded();process.exit(0);}
 try{
  await check();
  if(await sourceIsSuperseded()){reportSuperseded();process.exit(0);}
  console.log('LIVE PAGES SMOKE: PASS for '+sha);process.exit(0);
 }catch(error){
  last=error;console.error('Deployment propagation attempt '+attempt+': '+error.message);
  if(attempt<25)await sleep(4000);
 }
}
console.error('LIVE PAGES SMOKE: FAIL — '+last?.message);
process.exitCode=1;
