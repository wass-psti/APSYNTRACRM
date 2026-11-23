import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceApplicationsForNavigation} from '../workspace-application-routing.js';
import {WORK_MANAGEMENT_WORKSPACE_ID} from '../workspace-identity.js';

const app=readFileSync('frontend/app.js','utf8');

test('standalone application boards are hidden from ordinary board navigation without deleting data',()=>{
 assert.ok(app.includes("new Set(['timetracker','frt','tradelink','fueltrack','fueltrans'])"));
 assert.match(app,/const cards=\(\)=>state\.showTrash\?state\.trashed:state\.showArchived\?state\.archived:\s*state\.boards\.filter\(board=>!isStandaloneApplicationBoard\(board\)\)/);
 assert.match(app,/const recent=state\.boards\.filter\(board=>!isStandaloneApplicationBoard\(board\)\);/);
 assert.match(app,/getBoards:async\(\)=>\{[\s\S]*?return \[\.\.\.state\.boards,\.\.\.archived\]\.filter\(board=>!isStandaloneApplicationBoard\(board\)\)/);
 assert.match(app,/workspaceApplicationsForNavigation\(state\.context\?\.workspace_id,state\.boards\)/);
 const navigation=workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID,[]);
 for(const [id,href] of [['timetracker','#/time-tracker'],['frt','#/fund-tracker'],
  ['tradelink','#/tradelink'],['fueltrack','#/fueltrack'],['fueltrans','#/fueltrans']])
  assert.equal(navigation.find(application=>application.id===id)?.href,href);
 assert.deepEqual(workspaceApplicationsForNavigation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',[]),[]);
});

test('legacy application board URLs canonicalize to standalone routes',()=>{
 assert.match(app,/if\(timeTrackerBoard\)\{[\s\S]*?TIMETRACKER_APPLICATION_ROUTE/);
 assert.match(app,/if\(parts\[1\]===FRT_BOARD_ID\)\{[\s\S]*?FUND_TRACKER_APPLICATION_ROUTE/);
 assert.match(app,/if\(parts\[1\]===TRADELINK_BOARD_ID\)/);
 assert.match(app,/if\(parts\[1\]===FUELTRACK_V3_ID\)/);
 assert.match(app,/if\(parts\[1\]===FUELTRANS_BOARD_ID\)[\s\S]*?fuelTransApplicationHref/);
});

test('FuelTrans renders its native host before generic board tabs and mounts on the canonical route',()=>{
 const start=app.indexOf('function boardPage(){');
 const end=app.indexOf('function renderBoardLoadingError',start);
 const boardPage=app.slice(start,end);
 const nativeHost=boardPage.indexOf("if(moduleByBoardName(b.name)?.key==='fueltrans')return '<div id=\"fueltrans-native-host\"></div>'");
 const genericTabs=boardPage.indexOf('const tabSpecs=');
 assert.ok(nativeHost>=0&&genericTabs>nativeHost);
 assert.match(app,/if\(state\.fuelTransStandalone&&!state\.board\)return renderFuelTransRouteUnavailable/);
 assert.match(app,/base:FUELTRANS_APPLICATION_ROUTE/);
 assert.match(app,/fuelTransApplicationHref\('ticket\/'\+encodeURIComponent\(row\.id\)\)/);
});

test('standalone applications have no generic board-detail application tabs',()=>{
 assert.doesNotMatch(app,/moduleKey==='frt'\?\[\{key:'finance',href:'#\/boards'/);
 assert.doesNotMatch(app,/moduleKey==='timetracker'\?\[\{key:'attendance',href:'#\/boards'/);
 assert.doesNotMatch(app,/isFuelTrackV3ApplicationBoard\(b\)\?\[\{key:'fueltrack'/);
 assert.match(app,/if\(moduleByBoardName\(b\.name\)\?\.key==='fueltrans'\)return '<div id="fueltrans-native-host"><\/div>'/);
});
