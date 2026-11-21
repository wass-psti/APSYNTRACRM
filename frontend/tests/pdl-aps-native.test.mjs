import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {readPaseoManagement} from '../apps/Paseo/native-admin.js';
import {sidebarActiveRoute} from '../sidebar-active-route.js';
import {PASEO_APPLICATION} from '../apps/Paseo/manifest.js';

const read=path=>readFileSync(path,'utf8');

test('public Paseo entry is a separate document with no CRM script or session coupling',()=>{
 const html=read('paseo/index.html');
 assert.match(html,/\/APSYNTRACRM\/paseo\/assets\//);
 assert.doesNotMatch(html,/frontend\/app\.js|frontend\/session\.js|sb_secret_|service_role/i);
 assert.equal(readFileSync('paseo/index.html','utf8').includes('assets/gcash-'),false);
 assert.ok(existsSync('paseo/pages-redirect.js'));
 assert.ok(existsSync('paseo/pages-restore.js'));
 const host=read('index.html');
 assert.match(host,/frontend\/app\.js/);
 assert.doesNotMatch(host,/paseo\/assets\//);
});

test('CRM signed workspace registers Paseo without granting anonymous CRM routes',()=>{
 const app=read('frontend/app.js');
 assert.match(app,/sidebarNav\('#\/paseo','Paseo de Lomboy'/);
 assert.equal(PASEO_APPLICATION.route,'#/paseo');
 assert.match(app,/if\(!state\.context\)return;/);
 assert.match(app,/readPaseoManagement\(token\)/);
 assert.equal(sidebarActiveRoute('#/paseo'),'paseo');
 assert.equal(sidebarActiveRoute('#/overview'),'overview');
});

test('anonymous CRM user cannot read Paseo administration through native client',async()=>{
 let requests=0;
 assert.deepEqual(await readPaseoManagement('',{request:async()=>{requests++;throw Error('should not call');}}),{status:'DENIED'});
 assert.equal(requests,0);
});

test('existing backend denial is respected without retrieving private records',async()=>{
 const paths=[];
 const response=await readPaseoManagement('TEST_REVOKED',{request:async(url,options)=>{
   paths.push(url);
   assert.equal(options.method,'GET');
   assert.equal(options.credentials,'omit');
   return new Response('{}',{status:401});
 }});
 assert.deepEqual(response,{status:'DENIED'});
 assert.equal(paths.length,1);
 assert.match(paths[0],/\/v1\/admin\/session$/);
});

test('signed and assigned administrator receives current read-only booking projection',async()=>{
 const paths=[];
 const response=await readPaseoManagement('TEST_SIGNED',{request:async(url,options)=>{
   paths.push(url);
   assert.equal(options.method,'GET');
   assert.equal(options.headers.authorization,'Bearer TEST_SIGNED');
   if(url.endsWith('/v1/admin/session'))return Response.json({authenticated:true});
   if(url.endsWith('/v1/admin/courts'))return Response.json({courts:[{enabled:true},{enabled:false}]});
   if(url.includes('/v1/admin/reservations?'))return Response.json({reservations:[{id:'r-1',full_name:'Test customer',booking_status:'confirmed',payment_status:'verified'}]});
   throw Error('Unexpected path');
 }});
 assert.equal(response.status,'VERIFIED');
 assert.equal(response.courtCount,2);
 assert.equal(response.enabledCourtCount,1);
 assert.deepEqual(response.reservations,[{id:'r-1',name:'Test customer',bookingStatus:'confirmed',paymentStatus:'verified'}]);
 assert.equal(paths.length,3);
});

test('public admin demo routes are not used in the shipped Paseo portal',()=>{
 const router=read('frontend/apps/Paseo/source/src/app/router.tsx');
 assert.match(router,/admin\/live-reservations/);
 assert.match(router,/Navigate to="\/admin\/sign-in" replace/);
 assert.doesNotMatch(router,/AdminCustomersPage|AdminPaymentsPage|AdminOverviewPage/);
});
