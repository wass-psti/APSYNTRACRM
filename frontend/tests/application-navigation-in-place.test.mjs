import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 resolveApplicationLoadingState,
 isCurrentApplicationRouteRead
} from '../application-loading.js';
import {updateExistingApplicationShell} from '../application-shell-dom.js';
import {sidebarActiveRoute} from '../sidebar-active-route.js';
import {
 WORK_MANAGEMENT_BOARD_APPLICATIONS
} from '../workspace-application-ownership.js';
import {
 workspaceApplicationsForNavigation
} from '../workspace-application-routing.js';
import {WORK_MANAGEMENT_WORKSPACE_ID} from '../workspace-identity.js';

const app = readFileSync('frontend/app.js','utf8');

test('same-scope pending reads retain the rendered shell and scope changes keep the loader',()=>{
 const base = {
  pending:true,
  hasRenderedShell:true,
  isSignedIn:true,
  userId:'user-1',
  workspaceId:'workspace-1',
  renderedScope:'user-1|workspace-1'
 };
 assert.equal(resolveApplicationLoadingState(base),'retain-shell');
 assert.equal(resolveApplicationLoadingState({...base,pending:false}),'ready');
 assert.equal(resolveApplicationLoadingState({...base,hasRenderedShell:false}),'show-loader');
 assert.equal(resolveApplicationLoadingState({...base,workspaceId:'workspace-2'}),'show-loader');
 assert.equal(resolveApplicationLoadingState({...base,workspaceTransitionPending:true}),'show-loader');
 assert.equal(resolveApplicationLoadingState({...base,isSignedIn:false}),'show-loader');
 assert.equal(resolveApplicationLoadingState({...base,userId:null}),'show-loader');
 assert.equal(resolveApplicationLoadingState({...base,workspaceId:null}),'show-loader');
});

test('a route-read response is accepted only for the active hash and signed scope',()=>{
 const active = {
  label:'Fund Tracker',
  hash:'#/fund-tracker',
  userId:'user-1',
  workspaceId:'workspace-1'
 };
 const stale = {
  label:'TimeTracker',
  hash:'#/time-tracker',
  userId:'user-1',
  workspaceId:'workspace-1'
 };
 const current = {
  currentHash:'#/fund-tracker',
  isSignedIn:true,
  userId:'user-1',
  workspaceId:'workspace-1'
 };
 assert.equal(isCurrentApplicationRouteRead(active,active,current),true);
 assert.equal(isCurrentApplicationRouteRead(stale,active,current),false);
 assert.equal(isCurrentApplicationRouteRead(active,active,{...current,currentHash:'#/time-tracker'}),false);
 assert.equal(isCurrentApplicationRouteRead(active,active,{...current,userId:'user-2'}),false);
 assert.equal(isCurrentApplicationRouteRead(active,active,{...current,workspaceId:'workspace-2'}),false);
 assert.equal(isCurrentApplicationRouteRead(active,active,{...current,isSignedIn:false}),false);
 assert.equal(isCurrentApplicationRouteRead(null,active,current),false);
});

test('every registered Work Management application route selects its own sidebar entry',()=>{
 const boards = WORK_MANAGEMENT_BOARD_APPLICATIONS.map(application=>({
  id:application.boardId,
  name:application.name
 }));
 const boardIds = Object.fromEntries(
  WORK_MANAGEMENT_BOARD_APPLICATIONS.map(application=>[application.moduleKey,application.boardId])
 );
 const navigation = workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID,boards);
 const routeIds = {
  tradelinkBoardId:boardIds.tradelink,
  fundTrackerBoardId:boardIds.frt,
  fueltrackBoardId:boardIds.fueltrack,
  timeTrackerBoardId:boardIds.timetracker,
  recentBoardIds:boards.map(board=>board.id)
 };
 assert.ok(navigation.length>=15);
 for (const application of navigation) {
  assert.equal(
   sidebarActiveRoute(application.href,routeIds),
   application.navigationKey,
   application.id + ' must select its own sidebar item'
  );
 }
 assert.equal(
  sidebarActiveRoute('#/fueltrans/tickets',routeIds),
  'fueltrans',
  'FuelTrans must remain selected for nested support portal routes'
 );
});

test('app shell delegates same-scope DOM reconciliation to the tested helper',()=>{
 const start = app.indexOf('function shell(body){');
 const end = app.indexOf('function animateTabContent(',start);
 const shell = app.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(app,/import \{updateExistingApplicationShell\} from '\.\/application-shell-dom\.js';/);
 assert.match(shell,/const reusable=existing&&shellIdentity===identity/);
 assert.match(shell,/updateExistingApplicationShell\(\{/);
 assert.match(shell,/renderedSidebarSignature:shellSidebarSignature/);
 assert.match(shell,/sidebarSignature,/);
 assert.match(shell,/renderSidebar:sidebar/);
 assert.match(shell,/selectedNavigation:currentSidebarNavigation\(\)/);
 assert.match(shell,/preserveContent:preserveDda/);
 assert.match(shell,/shellIdentity=identity/);
 assert.match(shell,/shellSidebarSignature=sidebarSignature/);
});

test('the render path retains the complete DOM during same-scope pending reads',()=>{
 const start = app.indexOf('function render(){');
 const end = app.indexOf('function findBoardCard(',start);
 const render = app.slice(start,end);
 assert.match(render,/resolveApplicationLoadingState\(/);
 assert.match(render,/if\(loadingState==='retain-shell'\)return;/);
});

test('route completion uses the tested stale-response guard and hash navigation stays in place',()=>{
 const finishStart = app.indexOf('function finishApplicationRouteRead(token){');
 const finishEnd = app.indexOf('function sharedApplicationLoading()',finishStart);
 const finish = app.slice(finishStart,finishEnd);
 assert.match(finish,/isCurrentApplicationRouteRead\(token,applicationRouteRead/);
 assert.match(finish,/applicationRouteRead=null/);
 const routeStart = app.indexOf('async function onRoute(){');
 const routeEnd = app.indexOf('async function submitRecoveryRequest(',routeStart);
 const route = app.slice(routeStart,routeEnd);
 assert.ok(routeStart>=0&&routeEnd>routeStart);
 assert.doesNotMatch(route,/location\.reload\s*\(/);
 assert.match(app,/window\.addEventListener\('hashchange',[\s\S]*?onRoute\(\)\.catch\(notice\)/);
});

test('the shell DOM helper updates content without replacing the shell, sidebar, or header',()=>{
 assert.equal(typeof updateExistingApplicationShell,'function');
 const source = readFileSync('frontend/application-shell-dom.js','utf8');
 assert.match(source,/existing\.querySelector\('\.main-content'\)\.innerHTML\s*=\s*body/);
 assert.match(source,/existing\.querySelector\('\.breadcrumb strong'\)\.textContent\s*=\s*breadcrumb/);
 assert.match(source,/aria-current/);
});
