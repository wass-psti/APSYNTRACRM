import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const index=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const config=readFileSync(new URL('../config.js',import.meta.url),'utf8');
const policy=index.match(/<meta\\s+http-equiv="Content-Security-Policy"\\s+content="([^"]+)"/i)?.[1];
const supabaseUrl=config.match(/SUPABASE_URL\\s*=\\s*'([^']+)'/)?.[1];

test('CSP permits private Supabase Storage images from the configured project only',()=>{
 assert.ok(policy,'Content Security Policy meta tag must exist');
 assert.ok(supabaseUrl,'Supabase project URL must be configured');
 const directives=Object.fromEntries(policy.split(';').map(part=>{
  const [name,...values]=part.trim().split(/\\s+/);
  return [name,values];
 }));
 const imageSources=directives['img-src']||[];
 const storageOrigin=new URL(supabaseUrl).origin;
 assert.ok(imageSources.includes(storageOrigin),
  'img-src must permit the configured Supabase origin for signed private avatars');
 assert.ok(!imageSources.includes('*'),'img-src must not use a wildcard');
 assert.ok(!imageSources.includes('https:'),'img-src must not allow every HTTPS origin');
});
