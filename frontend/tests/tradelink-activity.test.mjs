import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_ACTIVITY_LIMIT,renderTradeLinkActivity} from '../tradelink-activity.js';
import {
 normalizeTradeLinkSection,renderTradeLinkApplication,TRADELINK_SOURCE_MODULES,
 TRADELINK_SOURCE_WORKFLOW_STATES,TRADELINK_SOURCE_QUOTE_STATUSES
} from '../tradelink-application.js';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
const ws='11111111-1111-4111-8111-111111111111';
const detail={board:{id:TRADELINK_BOARD_ID,workspace_id:ws,
 name:'TradeLink',status:'active',
 description:'[APSYNTRA:MODULE:tradelink:v1] Source-aligned commerce'},
 items:[],columns:[],groups:[],values:[]};
test('source-defined six commercial modules and eight workflow states remain separate from board statuses',()=>{
 assert.deepEqual(TRADELINK_SOURCE_MODULES.map(x=>x.key),
  ['esi','packing','delivery','payment','quotation','po']);
 assert.equal(TRADELINK_SOURCE_WORKFLOW_STATES.length,8);
 assert.deepEqual(TRADELINK_SOURCE_QUOTE_STATUSES,
  ['Working on it','Sent','Client Review','Accepted','Declined','On Hold','Closed']);
 assert.equal(TRADELINK_ACTIVITY_LIMIT,100);
});
test('TradeLink activity route and navigation are scoped to the existing managed board',()=>{
 assert.equal(normalizeTradeLinkSection('activity'),'activity');
 assert.equal(normalizeTradeLinkSection('recovery'),'overview');
 const html=renderTradeLinkApplication({detail,workspaceId:ws,section:'activity',
  activity:{events:[],busy:false,error:''}});
 assert.match(html,/href="#\/boards\/264ca40d-6e4a-4e4f-97e6-3bd77c97cd88\/tradelink\/activity"/);
 assert.match(html,/Signed board audit/);
 assert.doesNotMatch(html,/data-action="tradelink-activity-refresh" disabled/);
 const denied=renderTradeLinkApplication({detail,workspaceId:
  '22222222-2222-4222-8222-222222222222',section:'activity',
  activity:{events:[{id:1,message:'confidential'}]}});
 assert.match(denied,/signed workspace access is unavailable/i);
 assert.doesNotMatch(denied,/confidential/);
});
test('signed board activity is deduped, HTML escaped and does not pretend to be TradeLink collaboration history',()=>{
 const html=renderTradeLinkActivity({events:[
  {id:7,event_type:'column.created',message:'<img src=x onerror=alert(1)>',
    actor_name:'<script>alert(1)</script>',created_at:'2026-11-04T01:00:00Z'},
  {id:7,event_type:'duplicate',message:'should disappear'},
  {id:4,event_type:'board.view',message:'Visible board event',actor_name:'Operator'}
 ]});
 assert.match(html,/column\.created/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<img\s|<script>|should disappear/);
 assert.match(html,/Latest 2 authorized board events/);
 assert.match(html,/not the source application/);
});
test('activity error and loading states neither invent rows nor leak prior data',()=>{
 const loading=renderTradeLinkActivity({busy:true,events:[]});
 assert.match(loading,/Loading authorized board activity/);
 assert.match(loading,/tradelink-activity-refresh" disabled/);
 const failure=renderTradeLinkActivity({error:'<private>',events:[
  {id:1,message:'restricted evidence',event_type:'activity'}]});
 assert.match(failure,/&lt;private&gt;/);
 assert.doesNotMatch(failure,/restricted evidence/);
});
test('existing signed server RPC and session-bound route checks are required before displaying audit',()=>{
 const app=readFileSync('frontend/app.js','utf8');
 assert.match(app,/async function loadTradeLinkActivity\(seq=routeSerial\)/);
 assert.match(app,/db\.allowed\(TRADELINK_BOARD_ID,'view'\)/);
 assert.match(app,/db\.boardEvents\(TRADELINK_BOARD_ID,100\)/);
 assert.match(app,/state\.context\?\.user_id===userId/);
 assert.match(app,/state\.context\?\.workspace_id===workspaceId/);
 assert.match(app,/seq===routeSerial&&auth\.isSignedIn/);
 assert.match(app,/case 'tradelink-activity-refresh'/);
 assert.match(app,/state\.tradeLinkActivity=null;state\.tradeLinkActivityError='';state\.tradeLinkActivityBusy=false;state\.context=null;/);
});
