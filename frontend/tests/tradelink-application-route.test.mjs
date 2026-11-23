import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_APPLICATION_ROUTE,tradeLinkApplicationHref,parseTradeLinkApplicationRoute} from '../tradelink-application-route.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('TradeLink has a canonical standalone route and preserves module/deep-link navigation',()=>{
 assert.equal(TRADELINK_APPLICATION_ROUTE,'#/tradelink');
 assert.equal(tradeLinkApplicationHref('drafts/quotation'),'#/tradelink/drafts/quotation');
 assert.deepEqual(parseTradeLinkApplicationRoute(['tradelink']),{
  section:'drafts',draftType:null,editId:null,recordId:null,canonicalHash:'#/tradelink/drafts/quotation'
 });
 assert.equal(parseTradeLinkApplicationRoute(['tradelink','esi']).canonicalHash,'#/tradelink/drafts/esi');
 assert.equal(parseTradeLinkApplicationRoute(['tradelink','drafts','po']).draftType,'po');
 assert.equal(parseTradeLinkApplicationRoute(['tradelink','drafts','edit',id]).editId,id);
 assert.equal(parseTradeLinkApplicationRoute(['tradelink','documents','record',id]).recordId,id);
 assert.equal(parseTradeLinkApplicationRoute(['tradelink','activity']).section,'activity');
 assert.equal(parseTradeLinkApplicationRoute(['tradelink','analytics']).section,'analytics');
 assert.equal(parseTradeLinkApplicationRoute(['boards',TRADELINK_BOARD_ID]),null);
});

test('TradeLink route rejects malformed record IDs and normalizes unknown sections',()=>{
 const invalid=parseTradeLinkApplicationRoute(['tradelink','documents','record','not-a-uuid']);
 assert.equal(invalid.recordId,null);
 assert.equal(invalid.canonicalHash,'#/tradelink/documents');
 assert.equal(parseTradeLinkApplicationRoute(['tradelink','unknown']).canonicalHash,'#/tradelink/drafts/quotation');
});

test('TradeLink opens the native renderer inside the existing host and uses the existing board only as its data source',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/if\(parts\[0\]==='tradelink'\)/);
 assert.match(app,/db\.nativeApplicationBoardContext\('tradelink'\)/);
 assert.match(app,/await loadBoard\(TRADELINK_BOARD_ID,'tradelink',tradeLinkRoute\.draftType,tradeLinkRoute\.editId,tradeLinkContext\)/);
 assert.match(app,/if\(state\.tlStandalone&&isTradeLinkBoard\(b\)\)return renderTradeLinkApplication/);
 assert.match(app,/if\(parts\[1\]===TRADELINK_BOARD_ID\)/);
 assert.match(app,/if\(parts\[0\]!=='tradelink'\)\{\s*state\.tradeLinkModuleRole=''\s*;\s*if\(state\.tradeLinkAnalyticsBusy\)/);
 assert.match(app,/tradeLinkApplicationHref\('drafts\/quotation'\)/);
 assert.match(app,/return \[\.\.\.state\.boards,\.\.\.archived\]\.filter\(board=>/);
 assert.match(app,/STANDALONE_APPLICATION_MODULE_KEYS=new Set\(\['timetracker','frt','tradelink','fueltrack','fueltrans'\]\)/);
 assert.match(app,/isStandaloneApplicationBoard\(board\)/);
 assert.doesNotMatch(app,/directModule|signedDraftRoute/);
 assert.match(app,/STANDALONE_APPLICATION_MODULE_KEYS=new Set\(\['timetracker','frt','tradelink','fueltrack','fueltrans'\]\)/);
 assert.match(app,/state\.boards\.filter\(board=>!isStandaloneApplicationBoard\(board\)\)/);
 assert.doesNotMatch(app,/href:'#\/boards\/'\+b\.id\+'\/tradelink\/drafts\/quotation'/);
});

test('TradeLink renderer and document actions use canonical standalone URLs',()=>{
 const renderer=readFileSync('frontend/tradelink-application.js','utf8');
 const draft=readFileSync('frontend/tradelink-draft-workspace.js','utf8');
 assert.ok(renderer.includes("tradeLinkApplicationHref('drafts/'+m.key)"));
 assert.match(renderer,/const base=TRADELINK_APPLICATION_ROUTE/);
 assert.ok(draft.includes("tradeLinkApplicationHref('drafts/edit/'+documentId)"));
 assert.match(draft,/tradeLinkApplicationHref\('documents'\)/);
 assert.match(draft,/tradeLinkApplicationHref\('drafts\/quotation'\)/);
});
