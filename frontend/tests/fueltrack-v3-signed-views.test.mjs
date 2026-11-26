import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 modelFuelTrackSignedRequests,
 renderFuelTrackSignedRequestsRich
} from '../fueltrack-v3-signed-views.js';

const BOARD='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WORKSPACE='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROW_A='11111111-1111-4111-8111-111111111111';
const ROW_B='22222222-2222-4222-8222-222222222222';

function makeSnapshot(rows=[]){
 const counts={submitted:0,approved:0,refuelingDone:0,completed:0,rejected:0};
 for(const row of rows){
  if(row.state==='submitted')counts.submitted++;
  if(row.state==='approved')counts.approved++;
  if(row.state==='refueling_done')counts.refuelingDone++;
  if(row.state==='completed')counts.completed++;
  if(row.state==='rejected')counts.rejected++;
 }
 return {
  status:'VERIFIED_READ',boardId:BOARD,workspaceId:WORKSPACE,role:'Admin',rows,
  summary:{total:rows.length,...counts}
 };
}
const rows=[
 {
  id:ROW_A,state:'submitted',kind:'vehicle',revision:1,
  requestor_name:'Jamie Santos',created_at:'2026-11-25T08:30:00Z',
  details:{plate:'ABC 1234',owner:'Jamie Santos',origin:'Mandaue',destination:'Cebu City',
   purpose:'Equipment delivery',odometer:12500,distance:18}
 },
 {
  id:ROW_B,state:'completed',kind:'container',revision:2,
  requestor_name:'Morgan Reyes',created_at:'2026-11-20T04:15:00Z',
  details:{containerCount:2,responsiblePerson:'Morgan Reyes',purpose:'Workshop refill'}
 }
];

test('All Requests renders a redesigned signed ledger and every verified status count',()=>{
 const html=renderFuelTrackSignedRequestsRich(makeSnapshot(rows));
 assert.match(html,/ft3-requests-hero/);
 assert.match(html,/All Requests/);
 assert.match(html,/Verified signed data/);
 assert.match(html,/Total requests/);
 assert.match(html,/Pending approval/);
 assert.match(html,/Refueling done/);
 assert.match(html,/data-status="refueling_done"/);
 assert.match(html,/data-status="rejected"/);
 assert.match(html,/aria-pressed="true"/);
 assert.match(html,/2 matching · 2 shown/);
 assert.match(html,/Request Log/);
 assert.match(html,/aria-label="Search verified fuel requests"/);
});

test('status filtering, searching, sorting and pagination preserve the signed read model',()=>{
 const snapshot=makeSnapshot(rows);
 const completed=modelFuelTrackSignedRequests(snapshot,{status:'completed'});
 assert.equal(completed.count,1);
 assert.equal(completed.rows[0].id,ROW_B);
 const search=modelFuelTrackSignedRequests(snapshot,{search:'equipment delivery'});
 assert.equal(search.count,1);
 assert.equal(search.rows[0].id,ROW_A);
 const oldest=modelFuelTrackSignedRequests(snapshot,{sort:'oldest'});
 assert.equal(oldest.rows[0].id,ROW_B);
 const many=makeSnapshot(Array.from({length:40},(_,i)=>({
  ...rows[0],id:'33333333-3333-4333-8333-'+String(i+1).padStart(12,'0'),
  created_at:new Date(Date.UTC(2026,10,1,0,i)).toISOString()
 })));
 const page=modelFuelTrackSignedRequests(many,{limit:25});
 assert.equal(page.rows.length,25);
 assert.equal(page.hasMore,true);
 assert.equal(page.count,40);
});

test('expanded details show only available request attributes and retain the existing action contract',()=>{
 const html=renderFuelTrackSignedRequestsRich(makeSnapshot(rows),{expandedId:ROW_A});
 assert.match(html,/data-action="ft3-signed-request-expand"/);
 assert.match(html,/aria-expanded="true"/);
 assert.match(html,/Vehicle owner/);
 assert.match(html,/Mandaue/);
 assert.match(html,/Cebu City/);
 assert.match(html,/Equipment delivery/);
 assert.match(html,/Odometer/);
 assert.match(html,/Distance/);
 assert.doesNotMatch(html,/Revision/);
});

test('untrusted requestor, reference and purpose values are escaped before rendering',()=>{
 const unsafe=makeSnapshot([{
  ...rows[0],requestor_name:'<img src=x onerror=alert(1)>',
  details:{...rows[0].details,plate:'<svg onload=alert(1)>',purpose:'<script>alert(1)</script>'}
 }]);
 const html=renderFuelTrackSignedRequestsRich(unsafe,{expandedId:ROW_A});
 assert.match(html,/&lt;img/);
 assert.match(html,/&lt;svg/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<img src=x/);
 assert.doesNotMatch(html,/<script>alert/);
});

test('empty ledger and filtered-empty states are distinct',()=>{
 const empty=renderFuelTrackSignedRequestsRich(makeSnapshot([]));
 assert.match(empty,/No requests yet/);
 const filtered=renderFuelTrackSignedRequestsRich(makeSnapshot(rows),{search:'no-such-request'});
 assert.match(filtered,/No matching requests/);
});

test('request register remains read-only and supports mobile and dark themes',()=>{
 const html=renderFuelTrackSignedRequestsRich(makeSnapshot(rows));
 assert.doesNotMatch(html,/<form\b|type="submit"|data-action="approve"|data-action="reject"/i);
 const css=readFileSync(new URL('../fueltrack-v3-all-requests-redesign.css',import.meta.url),'utf8');
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/html\[data-aps-monday-theme="dark"\] #app \.ft3-requests-hero/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
