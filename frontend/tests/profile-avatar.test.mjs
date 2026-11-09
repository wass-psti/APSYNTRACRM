import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectAvatarFile,AVATAR_MAX_SOURCE_BYTES,AVATAR_OUTPUT_SIZE,avatarPreviewMarkup}
 from '../profile-avatar.js';

function file(header,type,more=0){
 return new Blob([new Uint8Array(header),new Uint8Array(more)],{type});
}

test('photo validator accepts matching JPEG, PNG and WebP signatures',async()=>{
 const jpg=file([0xff,0xd8,0xff,0x01],'image/jpeg');
 const png=file([137,80,78,71,13,10,26,10,0,0,0,0],'image/png');
 const webp=file([82,73,70,70,0,0,0,0,87,69,66,80],'image/webp');
 assert.equal(await inspectAvatarFile(jpg),'image/jpeg');
 assert.equal(await inspectAvatarFile(png),'image/png');
 assert.equal(await inspectAvatarFile(webp),'image/webp');
});

test('photo validator rejects spoofed file types and unsupported formats',async()=>{
 await assert.rejects(()=>inspectAvatarFile(file([0xff,0xd8,0xff],'image/png')),/match/);
 await assert.rejects(()=>inspectAvatarFile(file([60,115,118,103,62],'image/svg+xml')),/JPEG, PNG or WebP/);
 await assert.rejects(()=>inspectAvatarFile(file([0,0,0,0],'image/jpeg')),/match/);
});

test('photo validator enforces bounded source size',async()=>{
 assert.equal(AVATAR_MAX_SOURCE_BYTES,5*1024*1024);
 assert.equal(AVATAR_OUTPUT_SIZE,256);
 await assert.rejects(()=>inspectAvatarFile(file([],'image/png')),/smaller than 5 MB/);
 await assert.rejects(()=>inspectAvatarFile(file([137,80,78,71,13,10,26,10],'image/png',AVATAR_MAX_SOURCE_BYTES)),/smaller than 5 MB/);
});

test('profile editor has accessible save and crop controls with safe text',()=>{
 const html=avatarPreviewMarkup('<script>alert(1)</script>');
 assert.match(html,/id="settings-avatar-file"/);
 assert.match(html,/id="settings-avatar-zoom"/);
 assert.match(html,/id="settings-avatar-pos-x"/);
 assert.match(html,/id="settings-avatar-pos-y"/);
 assert.match(html,/role="status"/);
 assert.match(html,/Save profile picture/);
 assert.match(html,/Remove photo/);
 assert.match(html,/Only you and active members of a shared workspace can view/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>/);
 const source=readFileSync('frontend/profile-avatar.js','utf8');
 assert.doesNotMatch(source,/storage\/v1\/object|rest\/v1\/rpc|fetch\(/);
});
