import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {TRADELINK_APPLICATION_ROUTE,TRADELINK_LEGACY_BASE,
 findTradeLinkApplicationBoard,parseTradeLinkApplicationRoute,
 tradeLinkApplicationHref} from '../tradelink-application-route.js';
import {renderTradeLinkApplication} from '../tradelink-application.js';

const workspace='00000000-0000-4000-8000-000000000001';
const board={id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',
 status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'};
const detail={board,items:[],groups:[],columns:[]};

test('dedicated TradeLink route binds only the existing authorized Board',()=>{
 assert.equal(TRADELINK_APPLICATION_ROUTE,'#/tradelink');
 assert.equal(TRADELINK_LEGACY_BASE,'#/boards/'+TRADELINK_BOARD_ID+'/tradelink');
 assert.equal(findTradeLinkApplicationBoard([board]),board);
 assert.equal(findTradeLinkApplicationBoard([{...board,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}]),null);
 assert.equal(findTradeLinkApplicationBoard([]),null);
 assert.equal(tradeLinkApplicationHref('/documents'),'#/tradelink/documents');
 assert.equal(parseTradeLinkApplicationRoute(['tradelink']).canonicalHash,'#/tradelink/drafts/quotation');
 assert.equal(parseTradeLinkApplicationRoute(['tradelink','overview']).canonicalHash,'#/tradelink/drafts/quotation');
 assert.equal(parseTradeLinkApplicationRoute(['tradelink','documents','record','record-1']).boardRouteParts[3],'documents');
 assert.equal(parseTradeLinkApplicationRoute(['tradelink','unsupported']),null);
 assert.equal(parseTradeLinkApplicationRoute(['boards']),null);
});

test('dedicated CRM presentation preserves signed document workflows and original TradeLink links remain compatible',()=>{
 const dedicated=renderTradeLinkApplication({detail,workspaceId:workspace,
  section:'documents',canManage:true,routeBase:TRADELINK_APPLICATION_ROUTE});
 assert.match(dedicated,/href="#\/tradelink\/documents"/);
 assert.match(dedicated,/href="#\/tradelink\/drafts\/quotation"/);
 assert.match(dedicated,/data-tl-tab="activity"/);
 assert.match(dedicated,/data-tl-tab="analytics"/);
 assert.doesNotMatch(dedicated,/#\/boards\/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88\/tradelink/);
 const legacy=renderTradeLinkApplication({detail,workspaceId:workspace,
  section:'documents',canManage:true});
 assert.match(legacy,/#\/boards\/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88\/tradelink\/documents/);
 const denied=renderTradeLinkApplication({detail,workspaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  section:'drafts',canManage:true,routeBase:TRADELINK_APPLICATION_ROUTE});
 assert.match(denied,/signed workspace access is unavailable/);
 assert.doesNotMatch(denied,/data-tradelink-draft-form/);
});

test('CRM sidebar and native route are mounted without a duplicate login, database or board',()=>{
 const host=readFileSync('frontend/app.js','utf8');
 const css=readFileSync('frontend/tradelink-application.css','utf8');
 assert.match(host,/sidebarNav\(TRADELINK_APPLICATION_ROUTE,'TradeLink'/);
 assert.match(host,/if\(parts\[0\]==='tradelink'\)/);
 assert.match(host,/findTradeLinkApplicationBoard\(state.boards\)/);
 assert.match(host,/await loadBoard\(board.id,'tradelink'/);
 assert.match(host,/routeBase:TRADELINK_APPLICATION_ROUTE/);
 assert.match(host,/state.tlStandalone&&state.tab==='tradelink'&&isTradeLinkBoard\(b\)/);
 assert.match(css,/\.tl-fm1-application/);
 assert.doesNotMatch(readFileSync('frontend/tradelink-application-route.js','utf8'),/service_role|localStorage|signInWithPassword/);
});
