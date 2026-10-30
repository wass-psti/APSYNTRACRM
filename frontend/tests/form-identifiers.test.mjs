import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
test('rendered form controls have explicit identifiers',()=>{
 for(const file of readdirSync('frontend').filter(f=>f.endsWith('.js'))){
  const source=readFileSync('frontend/'+file,'utf8');
  for(const tag of source.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi)){
   assert.match(tag[0],/\b(?:id|name)\s*=/i,
     'Missing form control identifier in '+file+': '+tag[0]);
  }
 }
});
test('search/filter inputs use distinct stable identifiers',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const roles=readFileSync('frontend/role-configuration-ui.js','utf8');
 for(const id of ['search-issues','search-board-items'])assert.match(app,new RegExp('id="'+id+'"'));
 for(const id of ['search-system-roles','search-workspace-members',
  'filter-role-permission-modules','search-role-proposals'])assert.match(roles,new RegExp('id="'+id+'"'));
});
