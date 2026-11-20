/** Signed Teams RPC contract. Never mutate a team table from the browser. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actions=new Set(['create','rename','duplicate','delete','add_member','remove_member',
 'move_member','add_other_team','make_owner','remove_owner','grant_admin','revoke_admin',
 'assign_content','remove_content','set_content_role','set_avatar','set_cover']);
const levels=new Set(['viewer','editor','manager']);
const kinds=new Set(['board','folder','app']);
const validUrl=value=>value===null||(typeof value==='string'&&value.length<=500&&
 /^https:\/\/(?:jtlusodorfnyzgyuewkz\.supabase\.co\/storage\/v1\/object\/public\/|wass-psti\.github\.io\/APSYNTRACRM\/)[^\s<>]*$/i.test(value));
const failure=Object.freeze({status:'UNAVAILABLE',teams:[],members:[],directory:[],
 content:[],canManageSystemAdmins:false});
export function validateTeamsSnapshot(raw,{workspaceId,actorId}={}){
 if(!uuid.test(workspaceId||'')||!uuid.test(actorId||'')||
  raw?.contract!=='apsyntra-teams-v1'||raw.workspaceId!==workspaceId||
  raw.actorId!==actorId||raw.authorized!==true||
  !Number.isSafeInteger(raw.revision)||raw.revision<0||
  typeof raw.canManageSystemAdmins!=='boolean'||
  !['teams','members','directory','content'].every(k=>Array.isArray(raw[k])))
  return failure;
 if(raw.teams.length>300||raw.members.length>10000||raw.directory.length>10000||
    raw.content.length>30000)return failure;
 const teamIds=new Set(),memberPairs=new Set(),peopleIds=new Set(),contentKeys=new Set();
 const teams=[];
 for(const t of raw.teams){
  if(!uuid.test(t?.id||'')||teamIds.has(t.id)||typeof t.name!=='string'||
   t.name.trim().length<1||t.name.length>100||
   typeof t.isSystem!=='boolean'||typeof t.canManage!=='boolean'||
   ![t.memberCount,t.ownerCount,t.contentCount,t.systemAdminCount].every(n=>
    Number.isSafeInteger(n)&&n>=0)||
   t.ownerCount>t.memberCount||t.systemAdminCount>t.memberCount||
   !validUrl(t.avatarUrl??null)||!validUrl(t.coverUrl??null))
   return failure;
  teamIds.add(t.id);teams.push(Object.freeze(t));
 }
 if(teams.filter(t=>t.isSystem).length>1||
    (raw.canManageSystemAdmins&&teams.filter(t=>t.isSystem).length!==1))return failure;
 const directory=[];
 for(const p of raw.directory){
  if(!uuid.test(p?.userId||'')||peopleIds.has(p.userId)||
   typeof p.name!=='string'||typeof p.email!=='string'||
   p.name.length>250||p.email.length>320)return failure;
  peopleIds.add(p.userId);directory.push(Object.freeze(p));
 }
 const members=[];
 for(const m of raw.members){
  if(!uuid.test(m?.teamId||'')||!teamIds.has(m.teamId)||
   !uuid.test(m.userId||'')||
   memberPairs.has(m.teamId+':'+m.userId)||
   typeof m.isOwner!=='boolean'||typeof m.name!=='string'||
   typeof m.email!=='string'||typeof m.title!=='string'||
   !['none','inherited','explicit'].includes(m.systemAdminSource)||
   typeof m.systemAdminExplicit!=='boolean'||
   (m.systemAdminSource==='explicit'&&!m.systemAdminExplicit))
   return failure;
  memberPairs.add(m.teamId+':'+m.userId);members.push(Object.freeze(m));
 }
 for(const t of teams){
  const assigned=members.filter(m=>m.teamId===t.id);
  if(assigned.length!==t.memberCount||
     assigned.filter(m=>m.isOwner).length!==t.ownerCount||
     (t.memberCount>0&&t.ownerCount<1))return failure;
 }
 const content=[];
 for(const c of raw.content){
  if(!uuid.test(c?.teamId||'')||!teamIds.has(c.teamId)||
   !kinds.has(c.contentType)||!uuid.test(c.contentId||'')||
   !levels.has(c.accessLevel)||typeof c.name!=='string'||
   contentKeys.has(c.teamId+':'+c.contentType+':'+c.contentId))return failure;
  contentKeys.add(c.teamId+':'+c.contentType+':'+c.contentId);
  content.push(Object.freeze(c));
 }
 for(const t of teams)if(content.filter(c=>c.teamId===t.id).length!==t.contentCount)
  return failure;
 return Object.freeze({status:'VERIFIED_TEAMS',workspaceId,actorId,
  revision:raw.revision,canManageSystemAdmins:raw.canManageSystemAdmins,
  teams:Object.freeze(teams),members:Object.freeze(members),
  directory:Object.freeze(directory),content:Object.freeze(content)});
}
export class TeamsClient {
 constructor(api){this.api=api;}
 async snapshot({workspaceId,actorId}={}){
  if(!uuid.test(workspaceId||'')||!uuid.test(actorId||''))
   throw Error('Signed workspace identity unavailable');
  let raw;
  try{
   raw=await this.api.rpc('apsyntra_teams_snapshot',{p_workspace_id:workspaceId});
  }catch(error){
   if(error?.status===404&&error?.code==='PGRST202')return failure;
   throw error;
  }
  const result=validateTeamsSnapshot(raw,{workspaceId,actorId});
  if(result.status!=='VERIFIED_TEAMS')
   throw Error('Teams snapshot did not pass signed scope and consistency checks');
  return result;
 }
 async change({workspaceId,actorId,action,teamId=null,userId=null,
   destinationTeamId=null,name=null,contentType=null,contentId=null,
   accessLevel=null,assetUrl=null,expectedRevision}={}){
  if(!uuid.test(workspaceId||'')||!uuid.test(actorId||'')||
    !actions.has(action)||!Number.isSafeInteger(expectedRevision)||
    expectedRevision<0||
    (teamId!==null&&!uuid.test(teamId))||
    (userId!==null&&!uuid.test(userId))||
    (destinationTeamId!==null&&!uuid.test(destinationTeamId))||
    (contentId!==null&&!uuid.test(contentId))||
    (name!==null&&(typeof name!=='string'||name.trim().length<1||name.length>100))||
    (contentType!==null&&!kinds.has(contentType))||
    (accessLevel!==null&&!levels.has(accessLevel))||
    (assetUrl!==null&&!validUrl(assetUrl)))
    throw Error('Invalid Teams mutation input');
  const result=await this.api.rpc('apsyntra_teams_change',{
   p_workspace_id:workspaceId,p_action:action,p_team_id:teamId,
   p_target_user_id:userId,p_destination_team_id:destinationTeamId,
   p_name:name,p_content_type:contentType,p_content_id:contentId,
   p_access_level:accessLevel,p_asset_url:assetUrl,
   p_expected_revision:expectedRevision
  });
  if(result?.contract!=='apsyntra-teams-change-v1'||
    result.state!=='committed'||result.workspaceId!==workspaceId||
    result.actorId!==actorId||result.action!==action||
    result.revision!==expectedRevision+1)
   throw Error('Teams mutation acknowledgement could not be verified');
  return result;
 }
}
