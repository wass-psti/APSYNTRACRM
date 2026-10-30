/** Ensure the deployed Edge vendor snapshot exactly matches authoritative code.
 * No silent fork, new authorization framework or privileged key in native gateway.
 */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const source=name=>readFileSync(name,'utf8');
const names=['sb02.ts','transactions.ts','huly-issue.ts','native-operators.ts','native-huly.ts','supabase-live.ts'];
for(const name of names){
 const expected=source('packages/huly-supabase/src/'+name)
   .replace(/from (['"])(\.\/[^'"]+)\.js\1/g,(_m,q,p)=>'from '+q+p+'.ts'+q);
 const actual=source('supabase/functions/apsyntra-native-issues/vendor/'+name);
 assert.equal(actual,expected,'Edge vendor differs from canonical signed gateway: '+name);
}
const edge=source('supabase/functions/apsyntra-native-issues/index.ts');
assert.match(edge,/createLiveSb06NativeIssues/);
assert.match(edge,/PAGE_ORIGIN='https:\/\/wass-psti.github.io'/);
assert.match(edge,/Bearer /);
assert.doesNotMatch(edge,/service_role|sb_secret_|postgresql:\/\/|localhost|127\.0\.0\.1/i);
console.log('PASS: Hosted native Issue gateway is byte-equivalent to canonical source after Deno import transformation.');
