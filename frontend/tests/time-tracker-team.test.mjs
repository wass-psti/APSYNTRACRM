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
import {renderTimeTrackerTeam,timeTrackerTeamCsv,timeTrackerTeamSummary} from '../time-tracker-team.js';
test('directory UI renders counts only for matching signed bootstrap',()=>{
 const access={userId:teamActor,workspaceId:teamWs,bootstrapTeamEligible:true};
 const data=projectTimeTrackerTeamDirectory(teamFixture,{workspaceId:teamWs,actorId:teamActor});
 assert.equal(timeTrackerTeamSummary(data).admins,1);
 assert.match(renderTimeTrackerTeam({directory:data,access}),/Team Directory/);
 assert.doesNotMatch(renderTimeTrackerTeam({directory:data,access:{...access,bootstrapTeamEligible:false}}),/MEMBER LIST/);
 assert.match(timeTrackerTeamCsv(data),/System Admin/);
});
import {TimeTrackerNativeClient} from '../time-tracker-native.js';
test('fresh bootstrap RPC is necessary even when module role is administrative',async()=>{
 const setup=allowed=>new TimeTrackerNativeClient({
  auth:{userId:teamActor,getVerifiedUser:async()=>({id:teamActor})},
  api:{
   context:async()=>({user_id:teamActor,workspace_id:teamWs,
    profile:{status:'active',platform_role:'admin_general_manager'}}),
   board:async()=>({board:{id:'46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
    workspace_id:teamWs,name:'TimeTracker Attendance'}}),
   allowed:async()=>true,
   rpc:async name=>{
    if(name==='has_module_access')return true;
    if(name==='list_module_directory')return [
     {id:teamActor,status:'active',module_role:'System Admin',display_name:'Example'}];
    if(name==='apsyntra_role_is_bootstrap')return allowed;
    if(name==='timetracker_team_directory_snapshot')return teamFixture;
    throw Error('Unsupported RPC');
   }
  }
 });
 const board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 await assert.rejects(()=>setup(false).teamDirectory(board),/Bootstrap Team Directory/);
 assert.equal((await setup(true).teamDirectory(board)).members.length,1);
});
