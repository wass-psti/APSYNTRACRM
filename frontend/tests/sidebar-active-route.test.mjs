import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sidebarActiveRoute} from '../sidebar-active-route.js';
import {workspaceApplicationsForNavigation} from '../workspace-application-routing.js';
import {WORK_MANAGEMENT_WORKSPACE_ID} from '../workspace-identity.js';

const ids={
 tradelinkBoardId:'tl-board',fundTrackerBoardId:'frt-board',
 fueltrackBoardId:'fueltrack-board',timeTrackerBoardId:'tt-board',
 recentBoardIds:['ordinary-board']
};
const selected=hash=>sidebarActiveRoute(hash,ids);

test('TradeLink owns the single primary selection across canonical document tabs and deep links',()=>{
 for(const route of [
  '#/tradelink','#/tradelink/drafts/quotation','#/tradelink/drafts/esi',
  '#/tradelink/drafts/edit/123','#/tradelink/documents',
  '#/tradelink/documents/record/123','#/tradelink/activity',
  '#/tradelink/analytics','#/tradelink/documents?filter=all',
  '#/boards/tl-board/tradelink/drafts/quotation'
 ])assert.equal(selected(route),'tradelink',route);
 assert.notEqual(selected('#/tradelink-other'),'tradelink');
});

test('history and application transitions switch selection without retaining stale peers',()=>{
 const journey=[
  ['#/overview','overview'],['#/tradelink/drafts/quotation','tradelink'],
  ['#/tradelink/documents','tradelink'],['#/tradelink/activity','tradelink'],
  ['#/fm1','fm1'],['#/tradelink/analytics','tradelink'],
  ['#/time-tracker','time-tracker'],['#/fund-tracker','fund-tracker'],
  ['#/fueltrack/requests','fueltrack'],['#/boards','boards'],
  ['#/boards/ordinary-board/items','recent:ordinary-board'],
  ['#/settings','settings'],['#/user-role-management','user-role-management'],
  ['#/tradelink/drafts/quotation','tradelink']
 ];
 for(const [route,expected] of journey)assert.equal(selected(route),expected,route);
});

test('legacy Board routes select only their matching standalone application',()=>{
 assert.equal(selected('#/boards/frt-board/finance'),'fund-tracker');
 assert.equal(selected('#/boards/fueltrack-board/fueltrack'),'fueltrack');
 assert.equal(selected('#/boards/tt-board/attendance'),'time-tracker');
 assert.equal(selected('#/boards/ordinary-board/items'),'recent:ordinary-board');
 assert.equal(selected('#/boards/non-recent/items'),'');
 assert.equal(selected('#/invitations/accept'),'');
 assert.equal(selected('#/tradelink-unknown'),'');
});

test('sidebar uses one route-selected key for primary and recent links, with matching ARIA',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 const sidebar=app.slice(app.indexOf('function sidebarNav('),app.indexOf('function shell('));
 const shell=app.slice(app.indexOf('function shell('),app.indexOf('function animateTabContent('));
 assert.match(sidebar,/const selectedNav=currentSidebarNavigation\(\)/);
 assert.match(sidebar,/const active=key=>selectedNav===key/);
 assert.match(sidebar,/const active=selectedNav==='recent:'\+b\.id/);
 assert.match(app,/const active=!!activeHref&&path===activeHref/);
 assert.doesNotMatch(sidebar,/location\.hash\.startsWith\(TRADELINK_APPLICATION_ROUTE\+'\/'\)/);
 assert.match(sidebar,/active\(application\.navigationKey\)/);
 const tradeLink=workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID,[]).find(application=>application.id==='tradelink');
 assert.equal(tradeLink?.navigationKey,'tradelink');
 assert.equal(tradeLink?.icon,'tradelink');
 assert.match(sidebar,/const selected=active\?' aria-current="page"':''/);
 assert.match(shell,/if\(active\)link\.setAttribute\('aria-current','page'\);\s*else link\.removeAttribute\('aria-current'\)/);
 assert.doesNotMatch(sidebar,/sidebarNav\([^\n]*,state\.tlStandalone===true\)/);
 const routeHandler=app.slice(app.indexOf('async function onRoute()'),app.indexOf('async function submitRecoveryRequest('));
 assert.match(routeHandler,/state\.ttStandalone=false;state\.frtStandalone=false;state\.tlStandalone=false;state\.fuelTrackStandalone=false/);
});
