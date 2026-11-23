import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {readPaseoManagement} from '../apps/Paseo/native-admin.js';
import {sidebarActiveRoute} from '../sidebar-active-route.js';
import {PASEO_APPLICATION} from '../apps/Paseo/manifest.js';
import {workspaceApplicationsForNavigation} from '../workspace-application-routing.js';
import {WORK_MANAGEMENT_WORKSPACE_ID} from '../workspace-identity.js';

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
 assert.match(app,/workspaceApplicationsForNavigation\(state\.context\?\.workspace_id,state\.boards\)/);
 assert.equal(workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID,[]).find(application=>application.id==='paseo-de-lomboy')?.href,PASEO_APPLICATION.route);
 assert.equal(PASEO_APPLICATION.route,'#/paseo');
 assert.match(app,/if\(!state\.context\)return;/);
 assert.match(app,/readPaseoManagement\(token,\{cursor\}\)/);
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
   if(url.includes('/v1/admin/reservations/page?'))return Response.json({reservations:[{id:'r-1',full_name:'Test customer',booking_status:'confirmed',payment_status:'verified'}],nextCursor:null});
   throw Error('Unexpected path');
 }});
 assert.equal(response.status,'VERIFIED');
 assert.equal(response.courtCount,2);
 assert.equal(response.enabledCourtCount,1);
 assert.deepEqual(response.reservations,[{id:'r-1',name:'Test customer',bookingStatus:'confirmed',paymentStatus:'verified'}]);
 assert.equal(paths.length,3);
});

test('administration modules use the existing signed shell rather than public demo routes',()=>{
 const router=read('frontend/apps/Paseo/source/src/app/router.tsx');
 const shell=read('frontend/apps/Paseo/source/src/components/admin/AdminShell.tsx');
 assert.match(router,/admin\/live-reservations/);
 for(const component of ['AdminCustomersPage','AdminPaymentsPage','AdminOverviewPage']){
   assert.ok(router.includes(component),component);
 }
 assert.match(shell,/StagingAdminGate/);
 assert.match(shell,/backendAdminEnabled/);
});

test('native readback ignores superseded refresh and signout responses',()=>{
 const app=read('frontend/app.js');
 assert.match(app,/const runId=\+\+paseoReadRunId/);
 assert.match(app,/runId===paseoReadRunId/);
 assert.match(app,/if\(!current\(\)\)return;/);
 assert.match(app,/if\(parts\[0\]!==\'paseo\'\)paseoReadRunId\+\+/);
 assert.match(app,/paseoReadRunId\+\+;state\.paseoManagement=null/);
});

test('native Paseo list supports bounded cursor pagination without unrestricted read',async()=>{
 const paths=[];
 const result=await readPaseoManagement('TOKEN',{cursor:{beforeCreatedAt:'2026-11-21T00:00:00Z',beforeId:'11111111-1111-4111-8111-111111111111'},request:async(url)=>{
  paths.push(url);
  if(url.endsWith('/v1/admin/session'))return Response.json({authenticated:true});
  if(url.endsWith('/v1/admin/courts'))return Response.json({courts:[{enabled:false}]});
  if(url.includes('/v1/admin/reservations/page?'))return Response.json({reservations:[],nextCursor:null});
  return new Response(null,{status:404});
 }});
 assert.equal(result.status,'VERIFIED');
 assert.ok(paths.some(path=>path.includes('limit=25')&&path.includes('beforeId=11111111')));
});
