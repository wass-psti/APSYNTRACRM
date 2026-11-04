import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync('frontend/app.js','utf8');
const shell=app.slice(app.indexOf('let shellIdentity=null;'),
 app.indexOf('function boardCard('));

test('navigation reuses the signed shell only for the same user and workspace',()=>{
 assert.match(shell,/state\.context\?\.user_id,state\.context\?\.workspace_id/);
 assert.match(shell,/existing&&shellIdentity===identity/);
 assert.match(shell,/root\.querySelector\(':scope > \.shell'\)/);
 assert.match(shell,/root\.innerHTML=`<div class="shell">/);
});

test('sidebar updates current navigation without replacing unchanged structure',()=>{
 assert.match(shell,/shellSidebarSignature!==sidebarSignature/);
 assert.match(shell,/link\.classList\.toggle\('active',active\)/);
 assert.match(shell,/link\.setAttribute\('aria-current','page'\)/);
 assert.match(shell,/link\.removeAttribute\('aria-current'\)/);
 assert.match(shell,/existing\.querySelector\('\.main-content'\)\.innerHTML=body/);
});

test('route-only entrance is short, compositor-friendly and reduced-motion-aware',()=>{
 assert.match(shell,/shellRoute!==route/);
 assert.match(shell,/prefers-reduced-motion: reduce/);
 assert.match(shell,/duration:175/);
 assert.match(shell,/translate3d\(0,5px,0\)/);
 assert.doesNotMatch(shell,/setInterval|requestAnimationFrame|WebGL|new Worker/);
});

test('existing session-sensitive route and map cleanup remain intact',()=>{
 assert.match(shell,/disposeTimeTrackerMaps\(\)/);
 assert.match(app,/function renderLogin\(/);
 assert.match(app,/auth\.onExpired=/);
 assert.match(app,/window\.addEventListener\('hashchange'/);
});
