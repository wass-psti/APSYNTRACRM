import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDdaHostSync} from '../dda-native-host.js';
import {DDA_APPLICATION,DDA_RELEASE_ENABLED} from '../dda-release.js';
import {workspaceApplicationsForNavigation,workspaceApplicationRouteAccess} from '../workspace-application-routing.js';
import {WORK_MANAGEMENT_WORKSPACE_ID} from '../workspace-identity.js';
import {sidebarActiveRoute} from '../sidebar-active-route.js';

function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function fixture(){
 const auth={isSignedIn:true,userId:'user'};
 const api={rpc(){}};
 const container={isConnected:true,textContent:''};
 const context={container,auth,api,workspaceId:'workspace',userId:'user',storage:{}};
 const calls=[];
 const module={mountActivityRuntime(host,options){calls.push({host,options});return {ready:Promise.resolve(),dispose(){calls.push('disposed');}};}};
 return {auth,container,context,calls,module};
}
test('DDA route metadata stays Work Management-owned and release switch controls sidebar',()=>{
 assert.equal(workspaceApplicationRouteAccess(DDA_APPLICATION.route,WORK_MANAGEMENT_WORKSPACE_ID).allowed,true);
 assert.equal(workspaceApplicationRouteAccess(DDA_APPLICATION.route,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa').allowed,false);
 assert.equal(workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID,[]).some(x=>x.id===DDA_APPLICATION.id),DDA_RELEASE_ENABLED);
 assert.equal(sidebarActiveRoute(DDA_APPLICATION.route),DDA_APPLICATION.id);
});
test('DDA lazy host mounts once per scope and preserves mounted editor across shell renders',async()=>{
 const f=fixture();let imports=0;
 const sync=createDdaHostSync({load:async()=>{imports++;return f.module;}});
 assert.equal(await sync(f.context),true);
 assert.equal(await sync(f.context),true);
 assert.equal(imports,1);
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].options.auth,f.auth);
 await sync();
 assert.equal(f.calls[1],'disposed');
});
test('DDA leaving the route before dynamic import resolves never mounts stale content',async()=>{
 const f=fixture(),wait=deferred();
 const sync=createDdaHostSync({load:()=>wait.promise});
 const first=sync(f.context);
 await sync();wait.resolve(f.module);
 assert.equal(await first,false);
 assert.equal(f.calls.length,0);
});
test('DDA account or workspace changes dispose old runtime and ignore late requests',async()=>{
 const f=fixture();
 const sync=createDdaHostSync({load:async()=>f.module});
 await sync(f.context);
 f.auth.userId='other';
 await sync({...f.context,userId:'other',workspaceId:'second'});
 assert.equal(f.calls[1],'disposed');
 assert.equal(f.calls[2].options.userId,'other');
 assert.equal(f.calls[2].options.workspaceId,'second');
 f.auth.isSignedIn=false;
 await sync({...f.context,userId:'other',workspaceId:'second'});
 assert.equal(f.calls[3],'disposed');
});
test('DDA failed module load can be retried without remounting stale module',async()=>{
 const f=fixture();let attempts=0;
 const sync=createDdaHostSync({load:async()=>{if(++attempts===1)throw Error('offline');return f.module;}});
 assert.equal(await sync(f.context),false);
 assert.match(f.container.textContent,/could not load/);
 assert.equal(await sync(f.context),true);
 assert.equal(f.calls.length,1);
});
test('DDA CRM shell wires native host after existing workspace route guard and disposes on identity changes',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/const preserveDda=body===DDA_HOST_MARKUP/);
 assert.match(app,/preserveContent:preserveDda/);
 const shellDom=readFileSync('frontend/application-shell-dom.js','utf8');
 assert.match(shellDom,/if \(!preserveContent\) existing\.querySelector\('\.main-content'\)\.innerHTML = body/);
 const route=app.slice(app.indexOf('async function onRoute(){'));
 assert.ok(route.indexOf('const applicationRoute=workspaceApplicationRouteAccess')<route.indexOf('if(parts[0]===DDA_ROUTE_SECTION)'));
 assert.match(app,/if\(workspaceIdentityChanged\)\{\s*syncDda\(\)/);
 const login=app.slice(app.indexOf('function renderLogin('),app.indexOf('function sidebarNav('));
 assert.ok(login.indexOf('syncDda();')>=0&&login.indexOf('syncDda();')<login.indexOf('root.innerHTML=renderAuthMarkup'));
 assert.match(app,/if\(!DDA_RELEASE_ENABLED\)shell/);
});
