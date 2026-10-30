import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSourceProjection,projectedRecordKey,classifyProjection} from '../dist/src/apsyntra-board-contract.js';
const a={workspaceId:'11111111-1111-4111-8111-111111111111',
 boardId:'22222222-2222-4222-8222-222222222222',moduleKey:'timetracker',
 sourceRecordId:'ATT-101',sourceRevision:1,sourceEventId:'clock-event-101',
 sourceUpdatedAt:'2026-10-30T09:00:00.000Z',
 visibleFields:{attendance_date:'2026-10-30',hours_total:0,sync_state:'Pending'}};
test('source envelope requires stable scoped identity and bounded typed fields',()=>{
 assert.equal(validateSourceProjection(a).moduleKey,'timetracker');
 assert.match(projectedRecordKey(a),/timetracker\|ATT-101/);
 assert.throws(()=>validateSourceProjection({...a,boardId:'invalid'}));
 assert.throws(()=>validateSourceProjection({...a,visibleFields:{'__proto__':'x','bad.dot':1}}));
});
test('sequence classifier distinguishes next, duplicate, stale, conflict and gap',()=>{
 const next={...a,sourceRevision:2,sourceEventId:'clock-event-102'};
 assert.equal(classifyProjection(null,a),'initial');
 assert.equal(classifyProjection(a,next),'next');
 assert.equal(classifyProjection(a,a),'duplicate');
 assert.equal(classifyProjection(next,a),'stale');
 assert.equal(classifyProjection(a,{...a,sourceEventId:'unrelated'}),'conflict');
 assert.equal(classifyProjection(a,{...a,sourceRevision:5}),'gap');
 assert.throws(()=>classifyProjection(a,{...next,sourceRecordId:'different'}));
});
