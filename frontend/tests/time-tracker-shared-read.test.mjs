import test from 'node:test';
import assert from 'node:assert/strict';
import {projectTimeTrackerSharedRead,projectOwnAttendance} from '../time-tracker-native.js';
import {timeTrackerLogRowsForSnapshot,renderTimeTrackerLog} from '../time-tracker-log.js';
import {renderTimeTrackerOjtSharedRead} from '../time-tracker-ui.js';
import {renderTimeTrackerOvertime} from '../time-tracker-overtime.js';

const self='21000000-0000-4000-8000-000000000001';
const peer='21000000-0000-4000-8000-000000000002';
const intern='21000000-0000-4000-8000-000000000004';
const access={userId:self,workspaceId:'10000000-0000-4000-8000-000000000001',
 boardId:'46bf4ee7-368a-4c35-842c-8593ea1f6ac3',moduleRole:'Employee'};
const now=new Date('2026-11-27T08:00:00Z');
const record=(id,user)=>({id,ownerId:'cloud:'+user,clockIn:{
 timestamp:'2026-11-27T00:00:00Z',location:'Office-Base Duty',department:'Engineering'},clockOut:null});
const response={contract:'tt-shared-read-1',actorId:self,workspaceId:access.workspaceId,
 boardId:access.boardId,internId:null,directory:[
 {id:self,status:'active',display_name:'Self Person'},{id:peer,status:'active',display_name:'Peer Person'}],
 attendance:{version:1,records:[record('self',self),record('peer',peer)]},
 internAttendance:[{id:'intern-record',internId:intern,name:'Intern Person',
 clockIn:'2026-11-27T00:00:00Z',clockOut:null,location:'Office-Base Duty'}],
 overtime:[{id:'peer-ot',ownerId:'cloud:'+peer,name:'Peer Person',date:'2026-11-27',
 status:'Submitted',durationMinutes:120,otPolicy:'duration-v1',canReviewOt:true,
 canReviewDuration:true,canWithdraw:true}]};

test('signed peer projection includes regular and intern records without altering personal Clock',()=>{
 const sharedRead=projectTimeTrackerSharedRead(response,access);
 const rows=timeTrackerLogRowsForSnapshot({status:'VERIFIED_READ',access,sharedRead});
 assert.deepEqual(rows.map(r=>r.id),['self','peer','ojt:intern-record']);
 assert.deepEqual(projectOwnAttendance(response.attendance,self).map(r=>r.id),['self']);
 assert.equal(sharedRead.log.scope,'AUTHORIZED_WORKSPACE_TEAM');
 const html=renderTimeTrackerLog({records:rows,scope:sharedRead.log.scope,now});
 assert.match(html,/Peer Person/);
 assert.match(html,/Intern Person/);
 assert.doesNotMatch(html,/data-action="tt-log-admin-(edit|correct-time|delete)"/);
});
test('peer OT capability flags cannot grant decisions or removal',()=>{
 const sharedRead=projectTimeTrackerSharedRead(response,access);
 assert.equal(sharedRead.overtime[0].canReviewOt,false);
 assert.equal(sharedRead.overtime[0].canReviewDuration,false);
 assert.equal(sharedRead.overtime[0].canWithdraw,false);
 const html=renderTimeTrackerOvertime({requests:sharedRead.overtime,access,now});
 assert.match(html,/Peer Person/);
 assert.doesNotMatch(html,/data-action="tt-ot-(approve|reject|withdraw)"/);
});
test('reject mismatched signed actor, board, workspace and selected intern',()=>{
 for(const key of ['actorId','workspaceId','boardId','internId','contract'])
  assert.throws(()=>projectTimeTrackerSharedRead({...response,[key]:'mismatch'},access),/identity or schema mismatch/);
 assert.throws(()=>projectTimeTrackerSharedRead(response,access,intern),/identity or schema mismatch/);
});
test('selected OJT shared views show peers and only read controls',()=>{
 const sharedRead=projectTimeTrackerSharedRead({...response,internId:intern},access,intern);
 const html=renderTimeTrackerOjtSharedRead(sharedRead);
 assert.match(html,/Attendance Log/);
 assert.match(html,/Overtime/);
 assert.match(html,/Peer Person/);
 assert.match(html,/Intern Person/);
 assert.match(html,/Pending/);
 assert.doesNotMatch(html,/data-action="tt-(log-admin|ot-approve|ot-reject|ot-withdraw)/);
});
