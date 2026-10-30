/** Gate the shipped frontend against accidental local-host or privileged backend coupling. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const html=read('index.html'),cfg=read('frontend/config.js');
assert.match(html,/Content-Security-Policy/);
assert.match(html,/connect-src 'self' https:\/\/jtlusodorfnyzgyuewkz\.supabase\.co/);
assert.match(html,/frontend\/app\.js/);
assert.match(cfg,/SUPABASE_URL.*https:\/\/jtlusodorfnyzgyuewkz\.supabase\.co/);
assert.match(cfg,/sb_publishable_/);
assert.ok(statSync('.nojekyll').isFile(),'Publish frontend assets without Jekyll transformations');
const assets=['app.js','config.js','session.js','data.js','acceptance.js','pages-persistence.js','pages-acceptance-ui.js','native-client.js','native-qa.js',
 'board-manifest.js','board-foundation.js','board-foundation-ui.js','board-grid.js','board-operational-qa.js','board-security-targets.js','board-negative-acceptance.js','board-security-ui.js','board-negative-write.js','role-configuration-ui.js','role-configuration-client.js'];
for(const asset of assets){
 const text=read('frontend/'+asset);
 assert.doesNotMatch(text,/127\.0\.0\.1|localhost|postgresql:\/\/|sb_secret_|service_role|SUPABASE_SERVICE_ROLE_KEY/i,
   'Frontend must never depend on a private localhost backend or privileged key: '+asset);
}
for(const file of ['app.js','acceptance.js','pages-acceptance-ui.js','data.js']){
 assert.doesNotMatch(read('frontend/'+file),/\bHuly\b/,
  'Legacy product branding must not appear in the visible application or its errors: '+file);
}
for(const file of readdirSync('frontend').filter(f=>f.endsWith('.js'))){
 const s=read('frontend/'+file);
 for(const match of s.matchAll(/from\s+['"]([^'"]+)['"]/g)){
  assert.ok(match[1].startsWith('./'),'Frontend imports must be local ESM assets: '+file);
 }
}
console.log('PASS: Pages-first static asset graph, HTTPS Supabase only, CSP and public client key.');
