/** Strict CSP regression: no inline style attributes or CSSOM style injections.
 * Keep style-src 'self' and ensure same-origin stylesheet has each utility class.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const css=readFileSync('frontend/styles.css','utf8');
const html=readFileSync('index.html','utf8');
test('strict style-src self is preserved without unsafe-inline or unsafe-hashes',()=>{
 assert.match(html,/style-src 'self'/);
 assert.doesNotMatch(html,/unsafe-inline|unsafe-hashes/);
});
test('frontend generated markup never uses blocked inline styles or CSSOM injection',()=>{
 for(const file of readdirSync('frontend').filter(x=>x.endsWith('.js'))){
  const source=readFileSync('frontend/'+file,'utf8');
  assert.doesNotMatch(source,/\bstyle\s*=\s*(?:["']|\x60)/,'blocked inline style in '+file);
  assert.doesNotMatch(source,/\.style\s*\.|\.style\s*=|\.cssText\s*=|setAttribute\s*\(\s*["']style["']/,'runtime style injection in '+file);
  for(const m of source.matchAll(/\bcsp-u\d{3}\b/g)){
   assert.ok(css.includes('.'+m[0]+'{'),'missing same-origin CSS for '+m[0]+' in '+file);
  }
 }
});
test('dynamic acceptance check status uses named CSS classes',()=>{
 const code=readFileSync('frontend/app.js','utf8');
 for(const name of ['csp-check-pass','csp-check-fail','csp-check-pending']){
  assert.match(code,new RegExp(name));
  assert.match(css,new RegExp('\\.'+name+'\\{'));
 }
});
