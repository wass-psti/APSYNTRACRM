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

test('board-tab transition uses a single short fade without whole-page bounce',()=>{
 assert.match(shell,/previousBoard\?\.\[0\]==='board'/);
 assert.match(shell,/previousBoard\[1\]===String\(state\.boardId\)/);
 assert.match(shell,/previousBoard\[2\]!==state\.tab/);
 assert.match(shell,/animateTabContent\('\.main-content'\)/);
 assert.match(shell,/prefers-reduced-motion: reduce/);
 assert.match(shell,/duration:170/);
 assert.match(shell,/opacity:\.88/);
 assert.doesNotMatch(shell,/translate3d|scale\(|requestAnimationFrame|WebGL|new Worker/);
});

test('nested TimeTracker and role tabs do not animate repeated selection',()=>{
 assert.match(app,/if\(next===state\.ttView\)return/);
 assert.match(app,/animateTabContent\('\.tt-secondary-content, \.tt-clock-stage'\)/);
 assert.match(app,/tab!==state\.roleTab/);
 assert.match(app,/animateTabContent\('\.aps-role-configuration'\)/);
});

test('existing session-sensitive route and map cleanup remain intact',()=>{
 assert.match(shell,/disposeTimeTrackerMaps\(\)/);
 assert.match(app,/function renderLogin\(/);
 assert.match(app,/auth\.onExpired=/);
 assert.match(app,/window\.addEventListener\('hashchange'/);
});
