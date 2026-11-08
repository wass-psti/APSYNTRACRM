// Checkpoint 20: bind workspace scope and query shape before any Data API read.
// PostgREST RLS is authoritative; this independent guard prevents a caller from
// overriding workspace_id, offset, select or limit via caller-supplied `extra`.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sortable=Object.freeze({
 fueltrans_memberships:new Set(['user_id.asc','updated_at.desc']),
 fueltrans_sessions:new Set(['last_activity.desc']),
 fueltrans_audit_events:new Set(['occurred_at.desc']),
 fueltrans_notifications:new Set(['created_at.desc']),
 fueltrans_tickets:new Set(['updated_at.desc']),
 fueltrans_issue_reports:new Set(['created_at.desc']),
 fueltrans_ticket_events_v2:new Set(['id.desc']),
 fueltrans_user_state:new Set([])
});
const fieldsRE=/^[a-z_][a-z0-9_]*(,[a-z_][a-z0-9_]*)*$/;
export function buildScopedCollectionQuery(table,workspaceId,{selectFields='*',page=0,limit=25,extra={}}={}){
 if(!Object.hasOwn(sortable,table))throw Error('Disallowed collection table.');
 if(typeof workspaceId!=='string'||!uuid.test(workspaceId))throw Error('Invalid workspace.');
 if(!Number.isSafeInteger(page)||page<0||page>100000||!Number.isSafeInteger(limit)||limit<1||limit>100||page*limit>1000000)throw Error('Invalid pagination.');
 if(typeof selectFields!=='string'||selectFields!=='*'&&!fieldsRE.test(selectFields)||selectFields.length>600)throw Error('Invalid select fields.');
 if(!extra||Object.getPrototypeOf(extra)!==Object.prototype)throw Error('Invalid collection filters.');
 const safe={};
 for(const [key,value] of Object.entries(extra)){
  if(typeof value!=='string')throw Error('Invalid collection filter value.');
  if(key==='order'){
   if(!sortable[table].has(value))throw Error('Disallowed sort order.');
  } else if(table==='fueltrans_memberships'&&key==='role'){
   if(!['eq.global_l1_support','eq.local_l2_support'].includes(value))throw Error('Disallowed membership role filter.');
  } else if(table==='fueltrans_memberships'&&key==='enabled'){
   if(value!=='eq.true')throw Error('Disallowed membership enabled filter.');
  } else if(table==='fueltrans_memberships'&&key==='status'){
   if(value!=='eq.active')throw Error('Disallowed membership status filter.');
  } else throw Error('Collection filters cannot override the server scope.');
  safe[key]=value;
 }
 const projection=selectFields==='*'?'*':(selectFields.split(',').includes('workspace_id')?selectFields:`workspace_id,${selectFields}`);
 // Query scope is set last and cannot be replaced by `extra` or special values.
 return new URLSearchParams({...safe,select:projection,offset:String(page*limit),limit:String(limit),workspace_id:`eq.${workspaceId}`}).toString();
}
export function verifyScopedCollectionRows(rows,workspaceId){
 if(!Array.isArray(rows)||!rows.every(x=>x&&x.workspace_id===workspaceId))throw Error('Collection response escaped requested workspace scope.');
 return rows;
}
