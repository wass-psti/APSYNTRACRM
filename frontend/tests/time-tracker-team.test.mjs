import test from 'node:test';
import assert from 'node:assert/strict';
import {TT_TEAM_ROLES} from '../time-tracker-team.js';
test('TimeTracker team role list is restricted',()=>assert.equal(TT_TEAM_ROLES.length,7));
import {projectTimeTrackerTeamDirectory} from '../time-tracker-team.js';
test('Missing signed Team snapshot is denied',()=>assert.throws(()=>projectTimeTrackerTeamDirectory(null,{}),/bootstrap Team directory contract/));
import {renderTimeTrackerNative} from '../time-tracker-ui.js';
test('Team navigation not present for nonbootstrap actor',()=>{const html=renderTimeTrackerNative({result:{status:'VERIFIED_READ',access:{moduleRole:'Employee'},records:[]},view:'team',teamEligible:false});assert.doesNotMatch(html,/data-target="team"|Team Directory/);});
const teamActor='10000000-0000-4000-8000-000000000011';
const teamWs='00000000-0000-4000-8000-000000000001';
const teamFixture={bootstrapVerified:true,mode:'staged_only',workspaceId:teamWs,
 users:[{id:teamActor,displayName:'Example',status:'active'}],
 assignments:[{userId:teamActor,moduleId:'time-tracker',role:'System Admin',enabled:true}]};
test('bootstrap directory derives real authorized membership',()=>{
 const data=projectTimeTrackerTeamDirectory(teamFixture,{workspaceId:teamWs,actorId:teamActor});
 assert.equal(data.members.length,1);
 assert.equal(data.members[0].role,'System Admin');
});
test('claims cannot override central bootstrap and workspace denials',()=>{
 const input={workspaceId:teamWs,actorId:teamActor};
 assert.throws(()=>projectTimeTrackerTeamDirectory({...teamFixture,bootstrapVerified:false},input),/contract/);
 assert.throws(()=>projectTimeTrackerTeamDirectory({...teamFixture,workspaceId:teamActor},input),/contract/);
});
