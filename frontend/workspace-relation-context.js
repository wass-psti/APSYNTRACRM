/** Display-only signed workspace relationship, never an authorization grant. */
const RELATIONS=new Set(['owner','member','collaborator']);
export function workspaceRelationFromCatalog(catalog,{userId,workspaceId}={}){
 if(catalog?.status!=='SIGNED_MEMBER_DISCOVERY'||!userId||!workspaceId||
    !Array.isArray(catalog.rows))return null;
 const matches=catalog.rows.filter(row=>row.id===workspaceId&&
   row.active===true&&row.verifiedScope==='SIGNED_MEMBER_RPC'&&
   RELATIONS.has(row.relation));
 if(matches.length!==1)return null;
 return Object.freeze({userId,workspaceId,relation:matches[0].relation});
}
export function workspaceRelationLabel(snapshot,context){
 if(!context?.user_id||!context?.workspace_id||
   snapshot?.userId!==context.user_id||snapshot.workspaceId!==context.workspace_id||
   !RELATIONS.has(snapshot.relation))return 'Workspace relationship unverified';
 return 'Workspace '+snapshot.relation;
}
