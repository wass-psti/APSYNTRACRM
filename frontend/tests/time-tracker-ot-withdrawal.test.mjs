import test from 'node:test';
import assert from 'node:assert/strict';
import {projectTimeTrackerOtRows,renderTimeTrackerOvertime} from '../time-tracker-overtime.js';

const now=new Date('2026-11-24T08:00:00Z');
const row={id:'request',date:'2026-11-24',status:'Submitted',name:'Worker',start:'18:00',end:'20:00',durationMinutes:120,task:'Client support',canWithdraw:true};
test('pending signed creator capability controls removal and fails closed',()=>{
 const render=(request,active=true)=>renderTimeTrackerOvertime({requests:[request],access:{otContractActive:active},now});
 assert.equal(projectTimeTrackerOtRows([row])[0].canWithdraw,true);
 assert.match(render(row),/data-action="tt-ot-withdraw"/);
 assert.doesNotMatch(render({...row,canWithdraw:false}),/data-action="tt-ot-withdraw"/);
 assert.doesNotMatch(render({...row,status:'Approved'}),/data-action="tt-ot-withdraw"/);
 assert.doesNotMatch(render(row,false),/data-action="tt-ot-withdraw"/);
});
