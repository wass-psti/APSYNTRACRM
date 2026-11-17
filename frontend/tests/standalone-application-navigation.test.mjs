import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync('frontend/app.js','utf8');

test('standalone application boards are hidden from ordinary board navigation without deleting data',()=>{
 assert.ok(app.includes("new Set(['timetracker','frt','tradelink','fueltrack'])"));
 assert.match(app,/const cards=\(\)=>state\.showTrash\?state\.trashed:state\.showArchived\?state\.archived:\s*state\.boards\.filter\(board=>!isStandaloneApplicationBoard\(board\)\)/);
 assert.match(app,/const recent=state\.boards\.filter\(board=>!isStandaloneApplicationBoard\(board\)\);/);
 assert.match(app,/getBoards:async\(\)=>\{[\s\S]*?return \[\.\.\.state\.boards,\.\.\.archived\]\.filter\(board=>!isStandaloneApplicationBoard\(board\)\)/);
 assert.ok(app.includes("sidebarNav('#/time-tracker','TimeTracker'"));
 assert.ok(app.includes("sidebarNav('#/fund-tracker','Fund Tracker'"));
 assert.ok(app.includes("sidebarNav(TRADELINK_APPLICATION_ROUTE,'TradeLink'"));
 assert.ok(app.includes("sidebarNav(FUELTRACK_V3_APPLICATION_ROUTE,'FuelTrack+'"));
});

test('legacy application board URLs canonicalize to standalone routes',()=>{
 assert.match(app,/if\(timeTrackerBoard\)\{[\s\S]*?TIMETRACKER_APPLICATION_ROUTE/);
 assert.match(app,/if\(parts\[1\]===FRT_BOARD_ID\)\{[\s\S]*?FUND_TRACKER_APPLICATION_ROUTE/);
 assert.match(app,/if\(parts\[1\]===TRADELINK_BOARD_ID\)/);
 assert.match(app,/if\(parts\[1\]===FUELTRACK_V3_ID\)/);
});

test('standalone applications have no generic board-detail application tabs',()=>{
 assert.doesNotMatch(app,/moduleKey==='frt'\?\[\{key:'finance',href:'#\/boards'/);
 assert.doesNotMatch(app,/moduleKey==='timetracker'\?\[\{key:'attendance',href:'#\/boards'/);
 assert.doesNotMatch(app,/isFuelTrackV3ApplicationBoard\(b\)\?\[\{key:'fueltrack'/);
});
