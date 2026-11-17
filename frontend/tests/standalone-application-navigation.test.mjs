import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync('frontend/app.js','utf8');

test('already-standalone TimeTracker, Fund Tracker, and TradeLink boards are hidden only from ordinary board navigation',()=>{
 assert.match(app,/STANDALONE_APPLICATION_MODULE_KEYS=new Set\(\['timetracker','frt','tradelink'\]\)/);
 assert.match(app,/const cards=\(\)=>state\.showTrash\?state\.trashed:state\.showArchived\?state\.archived:\s*state\.boards\.filter\(board=>!isStandaloneApplicationBoard\(board\)\)/);
 assert.match(app,/const recent=state\.boards\.filter\(board=>!isStandaloneApplicationBoard\(board\)\)\.slice\(0,6\)/);
 assert.match(app,/getBoards:async\(\)=>\{[\s\S]*?return \[\.\.\.state\.boards,\.\.\.archived\]\.filter\(board=>!isStandaloneApplicationBoard\(board\)\)/);
 assert.match(app,/sidebarNav\('#\/time-tracker','TimeTracker'/);
 assert.match(app,/sidebarNav\('#\/fund-tracker','Fund Tracker'/);
 assert.match(app,/sidebarNav\(TRADELINK_APPLICATION_ROUTE,'TradeLink'/);
});

test('legacy TimeTracker and Fund Tracker board URLs open their native application routes',()=>{
 assert.match(app,/if\(timeTrackerBoard\)\{[\s\S]*?TIMETRACKER_APPLICATION_ROUTE/);
 assert.match(app,/if\(parts\[1\]===FRT_BOARD_ID\)\{[\s\S]*?fundTrackerRecordHref\(parts\[4\],parts\[5\]\):FUND_TRACKER_APPLICATION_ROUTE/);
 assert.match(app,/if\(parts\[1\]===TRADELINK_BOARD_ID\)/);
});

test('standalone applications have no generic board-detail app tabs',()=>{
 assert.doesNotMatch(app,/moduleKey==='frt'\?\[\{key:'finance',href:'#\/boards'/);
 assert.doesNotMatch(app,/moduleKey==='timetracker'\?\[\{key:'attendance',href:'#\/boards'/);
});
