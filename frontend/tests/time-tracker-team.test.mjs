import test from 'node:test';
import assert from 'node:assert/strict';
import {TT_TEAM_ROLES,TT_TEAM_DEPARTMENTS,filterTimeTrackerTeam,projectTimeTrackerTeamDepartments} from '../time-tracker-team.js';
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
 let assigned='Engineering';
 const setup=allowed=>new TimeTrackerNativeClient({
  auth:{userId:teamActor,getVerifiedUser:async()=>({id:teamActor})},
  api:{
   context:async()=>({user_id:teamActor,workspace_id:teamWs,
    profile:{status:'active',platform_role:'admin_general_manager'}}),
   nativeApplicationBoardContext:async moduleId=>({
    contract:'native-app-board-v1',moduleId,userId:teamActor,workspaceId:teamWs,
    role:'System Admin',board:{id:'46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
     workspace_id:teamWs,name:'TimeTracker Attendance',status:'active',
     description:'[APSYNTRA:MODULE:timetracker:v1]',archived_at:null,trashed_at:null}
   }),
   board:async()=>({board:{id:'46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
    workspace_id:teamWs,name:'TimeTracker Attendance'}}),
   allowed:async()=>true,
   rpc:async (name,args)=>{
    if(name==='has_module_access')return true;
    if(name==='list_module_directory')return [
     {id:teamActor,status:'active',module_role:'System Admin',display_name:'Example'}];
    if(name==='apsyntra_role_is_bootstrap')return allowed;
    if(name==='timetracker_team_directory_snapshot')return teamFixture;
    if(name==='timetracker_employee_department_directory_snapshot')return {
     contract:'tt-department-directory-1',actorId:teamActor,workspaceId:teamWs,
     boardId:'46bf4ee7-368a-4c35-842c-8593ea1f6ac3',
     assignments:[{userId:teamActor,department:assigned}]
    };
    if(name==='timetracker_employee_department_set'){
     assert.equal(args.p_target_user_id,teamActor);
     assigned=args.p_department;
     return {contract:'tt-department-set-1',actorId:teamActor,
      workspaceId:teamWs,targetUserId:teamActor,department:assigned,changed:true};
    }
    throw Error('Unsupported RPC');
   }
  }
 });
 const board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 await assert.rejects(()=>setup(false).teamDirectory(board),/Bootstrap Team Directory/);
 assert.equal((await setup(true).teamDirectory(board)).members.length,1);
 const saved=await setup(true).assignTeamDepartment(board,teamActor,'Finance and Accounting');
 assert.equal(saved.members[0].department,'Finance and Accounting');
 await assert.rejects(()=>setup(false).assignTeamDepartment(board,teamActor,'Engineering'),/Bootstrap Team Directory/);
 await assert.rejects(()=>setup(true).assignTeamDepartment(board,teamActor,'X'),/Valid employee and department/);
});


test('retained Team result list preserves authorized role members across search broadening',()=>{
 const access={userId:teamActor,workspaceId:teamWs,bootstrapTeamEligible:true};
 const data=projectTimeTrackerTeamDirectory({...teamFixture,users:[
  ...teamFixture.users,{id:'10000000-0000-4000-8000-000000000012',
   displayName:'Other Worker',email:'worker@example.test',status:'active'}
 ]},{workspaceId:teamWs,actorId:teamActor});
 const narrow=filterTimeTrackerTeam(data,{search:'other worker'});
 assert.equal(narrow.members.length,1);
 assert.equal(narrow.roleMembers.length,2);
 const html=renderTimeTrackerTeam({directory:data,access,filters:{search:'other worker'}});
 assert.match(html,/Other Worker/);
 assert.match(html,/data-search-text="other worker worker@example\.test unassigned unassigned"/);
 assert.match(html,/data-tt-team-empty hidden/);
});

test('signed department projection renders editable assignments but fails closed on invalid scopes',()=>{
 const board='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
 const roster=projectTimeTrackerTeamDirectory(teamFixture,{workspaceId:teamWs,actorId:teamActor});
 const snapshot={contract:'tt-department-directory-1',actorId:teamActor,
  workspaceId:teamWs,boardId:board,assignments:[{userId:teamActor,department:'Engineering'}]};
 const assigned=projectTimeTrackerTeamDepartments(roster,snapshot,{boardId:board});
 assert.ok(TT_TEAM_DEPARTMENTS.includes('Engineering'));
 assert.equal(assigned.members[0].department,'Engineering');
 const access={userId:teamActor,workspaceId:teamWs,bootstrapTeamEligible:true};
 const html=renderTimeTrackerTeam({directory:assigned,access});
 assert.match(html,/Department: Engineering/);
 assert.match(html,/data-action="tt-team-department-edit"/);
 assert.match(timeTrackerTeamCsv(assigned),/Engineering/);
 const pending=projectTimeTrackerTeamDepartments(roster,null,{boardId:board});
 assert.doesNotMatch(renderTimeTrackerTeam({directory:pending,access}),/data-action="tt-team-department-edit"/);
 assert.match(renderTimeTrackerTeam({directory:pending,access}),/Department assignments unavailable/);
 assert.throws(()=>projectTimeTrackerTeamDepartments(roster,{...snapshot,workspaceId:teamActor},{boardId:board}),/contract/);
 assert.throws(()=>projectTimeTrackerTeamDepartments(roster,{...snapshot,assignments:[
  {userId:teamActor,department:'X'}]},{boardId:board}),/assignment invalid/);
 assert.throws(()=>projectTimeTrackerTeamDepartments(roster,{...snapshot,assignments:[
  {userId:teamActor,department:'Engineering'},{userId:teamActor,department:'Engineering'}]},{boardId:board}),/contract|assignment invalid/);
});
