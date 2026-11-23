import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecordedStationsQuery,projectRecordedStations,STATION_HISTORY_PAGE_SIZE} from '../fueltrans/station-history03.js';

const workspaceId='11111111-1111-4111-8111-111111111111';
const member={workspace_id:workspaceId,enabled:true,status:'active',role:'admin'};
const clientMember={...member,role:'unioil'};
const fixture=[
 {workspace_id:workspaceId,id:'a',client_code:'UNIOIL',station_id:'1013C',station_name:'UNIOIL AIRPORT ROAD',updated_at:'2026-11-23T01:00:00Z',ticket_number:'UNI-2026-087',status:'Open'},
 {workspace_id:workspaceId,id:'b',client_code:'UNIOIL',station_id:'1013c',station_name:'Older station name',updated_at:'2026-11-22T01:00:00Z',ticket_number:'UNI-2026-084',status:'Resolved'},
 {workspace_id:workspaceId,id:'c',client_code:'ARAMCO',station_id:'1071B',station_name:'ARAMCO MARCELO GREEN',updated_at:'2026-11-22T02:00:00Z',ticket_number:'ARA-2026-027',status:'Open'}
];
test('query has exact workspace bound, bounded page and data-minimized JSON projections',()=>{
 const q=new URLSearchParams(buildRecordedStationsQuery({workspaceId,member,stationId:'1013C',page:1}));
 assert.equal(q.get('workspace_id'),'eq.'+workspaceId);
 assert.equal(q.get('offset'),String(STATION_HISTORY_PAGE_SIZE));
 assert.equal(q.get('limit'),String(STATION_HISTORY_PAGE_SIZE+1));
 assert.equal(q.get('payload->>stationId'),'ilike.*1013C*');
 assert.match(q.get('select'),/station_id:payload->>stationId/);
 assert.match(q.get('select'),/station_name:payload->>stationName/);
 assert.doesNotMatch(q.get('select'),/(^|,)payload(,|$)/);
 assert.equal(q.get('archived'),'eq.false');
 assert.equal(q.has('count'),false);
});
test('searchless query only returns tickets with station IDs and respects client role',()=>{
 const q=new URLSearchParams(buildRecordedStationsQuery({workspaceId,member:clientMember,client:'all'}));
 assert.equal(q.get('client_code'),'eq.UNIOIL');
 assert.equal(q.get('payload->>stationId'),'not.is.null');
 assert.throws(()=>buildRecordedStationsQuery({workspaceId,member:clientMember,client:'ARAMCO'}),/outside/);
});
test('reject invalid scope, malformed search, and unbounded pages',()=>{
 assert.throws(()=>buildRecordedStationsQuery({workspaceId:'22222222-2222-4222-8222-222222222222',member}),/workspace/);
 for(const stationId of ['ab%', 'x,y', 'x.y', '*', '<script>'])assert.throws(()=>buildRecordedStationsQuery({workspaceId,member,stationId}),/search/);
 assert.throws(()=>buildRecordedStationsQuery({workspaceId,member,page:-1}),/page/);
 assert.throws(()=>buildRecordedStationsQuery({workspaceId,member,page:10001}),/page/);
});
test('station projections deduplicate by client and station ID without fabricating totals or credentials',()=>{
 const results=projectRecordedStations(fixture,{workspaceId,member});
 assert.equal(results.length,2);
 assert.equal(results[0].stationName,'UNIOIL AIRPORT ROAD');
 assert.equal(results[0].pageTickets,2);
 assert.equal(results[0].latestTicketId,'a');
 assert.equal(results[1].client,'ARAMCO');
 assert.deepEqual(Object.keys(results[0]).sort(),['client','stationId','stationName','latestTicketId','latestTicketNumber','lastTicketUpdated','latestTicketStatus','pageTickets'].sort());
});
test('projector blocks cross-workspace and cross-client rows',()=>{
 assert.throws(()=>projectRecordedStations([{...fixture[0],workspace_id:'other'}],{workspaceId,member}),/workspace/);
 assert.throws(()=>projectRecordedStations(fixture,{workspaceId,member:clientMember}),/client/);
 assert.throws(()=>projectRecordedStations(Array(STATION_HISTORY_PAGE_SIZE+1).fill(fixture[0]),{workspaceId,member}),/page/);
});
test('missing station ID or name cannot be invented',()=>{
 assert.deepEqual(projectRecordedStations([{...fixture[0],station_name:null},{...fixture[1],station_id:null}],{workspaceId,member}),[]);
});
