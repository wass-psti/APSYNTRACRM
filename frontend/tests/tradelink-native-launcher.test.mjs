import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sidebarIcon} from '../sidebar-visuals.js';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const TRADELINK_BOARD_ID='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';

test('TradeLink has a dedicated sidebar icon rather than the generic board fallback',()=>{
 const icon=sidebarIcon('tradelink');
 assert.match(icon,/class="sidebar-svg-icon"/);
 assert.match(icon,/<path d="m10 13 4-4"/);
 assert.notEqual(icon,sidebarIcon('boards'));
 assert.match(app,/'TradeLink','tradelink'/);
});

test('TradeLink launcher opens the existing native module route on the existing board',()=>{
 const href=`#/boards/'+TRADELINK_BOARD_ID+'/tradelink/drafts/quotation`;
 assert.ok(app.includes(href));
 assert.match(app,/parts\[2\]==='tradelink'&&state\.boards\.some/);
 assert.match(app,/requested==='tradelink'\?normalizeTradeLinkSection/);
});

test('TradeLink launcher remains selected throughout its native module routes',()=>{
 assert.match(app,/state\.boardId===TRADELINK_BOARD_ID\?\s*\(path==='#\/boards\/\'+state\.boardId\|\|location\.hash\.startsWith\('#\/boards\/\'+state\.boardId\+'\/tradelink\/'\)\)/);
});
