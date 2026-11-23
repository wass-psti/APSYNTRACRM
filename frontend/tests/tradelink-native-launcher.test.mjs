import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sidebarIcon} from '../sidebar-visuals.js';
import {workspaceApplicationsForNavigation} from '../workspace-application-routing.js';
import {WORK_MANAGEMENT_WORKSPACE_ID} from '../workspace-identity.js';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const TRADELINK_BOARD_ID='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';

test('TradeLink has a dedicated sidebar icon rather than the generic board fallback',()=>{
 const icon=sidebarIcon('tradelink');
 assert.match(icon,/class="sidebar-svg-icon"/);
 assert.match(icon,/<path d="m10 13 4-4"/);
 assert.notEqual(icon,sidebarIcon('boards'));
 const navigation=workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID,[]);
 assert.equal(navigation.find(application=>application.id==='tradelink')?.icon,'tradelink');
});

test('TradeLink launcher opens the canonical standalone application route',()=>{
 assert.match(app,/workspaceApplicationsForNavigation\(state\.context\?\.workspace_id,state\.boards\)/);
 assert.equal(workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID,[]).find(application=>application.id==='tradelink')?.href,'#/tradelink');
 assert.match(app,/if\(parts\[0\]==='tradelink'\)/);
 assert.match(app,/loadBoard\(TRADELINK_BOARD_ID,'tradelink',tradeLinkRoute\.draftType,tradeLinkRoute\.editId,tradeLinkContext\)/);
 assert.match(app,/state\.tlStandalone&&isTradeLinkBoard\(b\)/);
});

test('TradeLink launcher remains selected throughout its native module routes',()=>{
 assert.ok(app.includes("const selected=currentSidebarNavigation();"));
 assert.ok(app.includes("const active=!!activeHref&&path===activeHref;"));
 assert.ok(!app.includes("location.hash.startsWith(TRADELINK_APPLICATION_ROUTE+'/')"));
});

test('TradeLink is exposed once in the native sidebar, not duplicated in recent board links',()=>{
 assert.ok(app.includes("state.boards.filter(board=>!isStandaloneApplicationBoard(board))"));
 assert.match(app,/STANDALONE_APPLICATION_MODULE_KEYS=new Set\(\['timetracker','frt','tradelink','fueltrack','fueltrans'\]\)/);
 assert.ok(app.includes(".filter(board=>!isStandaloneApplicationBoard(board))"));
});
