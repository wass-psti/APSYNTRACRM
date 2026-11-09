import test from 'node:test';
import assert from 'node:assert/strict';
import {fuelTrackActivityModel,renderFuelTrackActivity,fuelTrackActivityCsv,FUELTRACK_ACTIVITY_MAX} from '../fueltrack-v3-activity.js';
const board='7af78b3f-67bf-4600-9aa1-9006d19d486e';
const workspace='11111111-1111-4111-8111-111111111111';
const now=new Date('2026-11-11T12:00:00Z');
const a={event_id:'evt-1',event_type:'request_approved',occurred_at:'2026-11-11T10:00:00Z',
 actor_name:'Alex',title:'Approved request',message:'Vehicle GBA 8424',request_id:'r-1'};
const b={event_id:'evt-2',event_type:'refueling_completed',occurred_at:'2026-11-09T00:00:00Z',
 actor_name:'Chris',title:'Completed refueling',message:'Another vehicle',request_id:'r-2'};
const base={status:'VERIFIED_READ',boardId:board,workspaceId:workspace,events:[a,b]};
const args=(snapshot,filters={})=>({snapshot,boardId:board,workspaceId:workspace,filters,now});
test('unknown and denied event streams do not produce fabricated metrics or exports',()=>{
 for(const snapshot of [null,{...base,status:'UNVERIFIED'},{...base,boardId:'foreign'},
  {...base,workspaceId:'foreign'},{...base,events:[a,a]},
  {...base,events:[{...a,occurred_at:'not-date'}]},
  {...base,events:Array.from({length:FUELTRACK_ACTIVITY_MAX+1},(_,i)=>({...a,event_id:'e'+i}))}]){
  assert.equal(fuelTrackActivityModel(args(snapshot)),null);
  assert.equal(fuelTrackActivityCsv(fuelTrackActivityModel(args(snapshot))),null);
 }
 const html=renderFuelTrackActivity(args(null));
 assert.match(html,/signed FuelTrack module Admin session is required/i);
 assert.match(html,/ft3-activity-export" disabled/);
 assert.doesNotMatch(html,/30 events tracked|100%|All clear!/);
});
test('authorized event counts, local day summaries and grouping come from loaded rows',()=>{
 const model=fuelTrackActivityModel(args(base));
 assert.equal(model.counts.all,2);
 assert.equal(model.counts.approved,1);
 assert.equal(model.counts.completed,1);
 assert.equal(model.daily.approved,1);
 assert.equal(model.daily.completed,0);
 assert.equal(model.groups.today.length,1);
 assert.equal(model.groups.week.length,1);
 const html=renderFuelTrackActivity(args(base));
 assert.match(html,/THIS WEEK/);
 assert.match(html,/TODAY/);
 assert.match(html,/data-action="ft3-activity-export"/);
 assert.doesNotMatch(html,/data-action="ft3-activity-export" disabled/);
});
test('search and typed filters retain original audit event IDs and source order',()=>{
 const model=fuelTrackActivityModel(args(base,{query:'gba',type:'approved',expandedId:'evt-1'}));
 assert.equal(model.visible.length,1);
 assert.equal(model.visible[0].id,'evt-1');
 assert.equal(model.expandedId,'evt-1');
 const html=renderFuelTrackActivity(args(base,{query:'gba',type:'approved',expandedId:'evt-1'}));
 assert.match(html,/Request ID/);
 assert.match(html,/evt-1/);
 assert.doesNotMatch(html,/Completed refueling/);
});
test('untrusted event text is HTML-escaped; CSV prevents spreadsheet formula injection',()=>{
 const row={...a,title:'<img src=x onerror=alert(1)>',actor_name:'=HYPERLINK("bad")',
  message:'<script>bad</script>'};
 const snapshot={...base,events:[row]};
 const html=renderFuelTrackActivity(args(snapshot,{expandedId:'evt-1'}));
 assert.match(html,/&lt;img/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<img|<script>/);
 const csv=fuelTrackActivityCsv(fuelTrackActivityModel(args(snapshot)));
 assert.match(csv,/"'=HYPERLINK\(""bad""\)"/);
 assert.match(csv,/Event ID,?"/);
});
