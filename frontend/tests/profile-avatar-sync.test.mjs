import test from 'node:test';
import assert from 'node:assert/strict';
import {avatarImageMarkup,mountAvatarImages} from '../profile-avatar.js';

const USER='11111111-1111-4111-8111-111111111111';
const PATH=USER+'/22222222-2222-4222-8222-222222222222.webp';

function fakeAvatar({load='success',dataset={}}={}){
 const fallback={hidden:false};
 let src='';
 const img={
  hidden:false,isConnected:true,complete:false,naturalWidth:0,
  dataset,parentElement:{querySelector:selector=>selector==='[data-avatar-initials]'?fallback:null},
  referrerPolicy:'',onload:null,onerror:null,
  removeAttribute(name){if(name==='src')src='';},
  set src(value){
   src=value;
   queueMicrotask(()=>{
    this.complete=true;
    if(load==='success'){this.naturalWidth=32;this.onload?.();}
    else{this.naturalWidth=0;this.onerror?.();}
   });
  },
  get src(){return src;}
 };
 return {img,fallback};
}
function containerFor(...images){
 return {isConnected:true,querySelectorAll:()=>images};
}

test('avatar markup escapes fallback text and supports per-user references',()=>{
 const html=avatarImageMarkup('<b>LM</b>',{path:PATH,userId:USER});
 assert.match(html,/&lt;b&gt;LM&lt;\/b&gt;/);
 assert.match(html,/data-avatar-path="11111111-1111-4111-8111-111111111111\/22222222-2222-4222-8222-222222222222\.webp"/);
 assert.match(html,/data-avatar-user-id="11111111-1111-4111-8111-111111111111"/);
 assert.doesNotMatch(html,/<b>/);
});

test('avatar keeps initials visible until the signed image loads',async()=>{
 const {img,fallback}=fakeAvatar();
 const client={signedUrl:async(path,userId)=>{
  assert.equal(path,PATH);assert.equal(userId,USER);return 'https://storage.example/signed.webp';
 }};
 await mountAvatarImages(containerFor(img),client,PATH,USER);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(img.hidden,false);
 assert.equal(img.src,'https://storage.example/signed.webp');
 assert.equal(img.referrerPolicy,'no-referrer');
 assert.equal(fallback.hidden,true);
});

test('failed image loads retain initials instead of showing a broken image',async()=>{
 const {img,fallback}=fakeAvatar({load:'failure'});
 const client={signedUrl:async()=> 'https://storage.example/expired.webp'};
 await mountAvatarImages(containerFor(img),client,PATH,USER);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(img.hidden,true);
 assert.equal(img.src,'');
 assert.equal(fallback.hidden,false);
});

test('per-avatar user references override the current-user defaults',async()=>{
 const other='33333333-3333-4333-8333-333333333333';
 const otherPath=other+'/44444444-4444-4444-8444-444444444444.webp';
 const {img}=fakeAvatar({dataset:{avatarPath:otherPath,avatarUserId:other}});
 const calls=[];
 const client={signedUrl:async(path,userId)=>{calls.push({path,userId});return 'https://storage.example/member.webp';}};
 await mountAvatarImages(containerFor(img),client,PATH,USER);
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,[{path:otherPath,userId:other}]);
 assert.equal(img.hidden,false);
});

test('stale signed URL responses cannot overwrite a newer avatar hydration',async()=>{
 const {img}=fakeAvatar();
 let resolveOld;
 const calls=[];
 const client={signedUrl:(path)=> {
  calls.push(path);
  if(path===PATH)return new Promise(resolve=>{resolveOld=resolve;});
  return Promise.resolve('https://storage.example/new.webp');
 }};
 const host=containerFor(img);
 const old=mountAvatarImages(host,client,PATH,USER);
 const nextPath=USER+'/55555555-5555-4555-8555-555555555555.webp';
 await mountAvatarImages(host,client,nextPath,USER);
 resolveOld('https://storage.example/old.webp');
 await old;
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(img.src,'https://storage.example/new.webp');
 assert.equal(img.hidden,false);
});
