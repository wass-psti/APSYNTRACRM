/**
 * CP-TB-NATIVE-01B: deterministic, READ-ONLY source identity reconciliation.
 * No name-based matching, writes, inferred history, or synthetic records.
 *
 * The caller must supply a complete, independently verified monday.com export.
 * The CRM side must come from a complete signed Toolbox issue listing.
 */
export const TALKBOX_SOURCE_BOARD_ID='18370784140';
export const TALKBOX_SOURCE_SUBITEM_BOARD_ID='18371220520';
const nonemptyId=value=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value);
const normalizeId=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0?
 String(value):String(value??'').trim();
const mappedSourceId=row=>{
 const raw=row?.mondayItemId??row?.monday_item_id??row?.sourceItemId??row?.source_item_id??null;
 return raw===null?null:normalizeId(raw);
};
/**
 * Returns a plan only. BLOCKED means it is unsafe to attempt automatic migration.
 * A matching title is intentionally never considered a valid identity match.
 */
export function reconcileTalkBoxIssueIdentities({
 sourceIssues,crmIssues,sourceComplete=false,crmComplete=false,
 sourceBoardId=TALKBOX_SOURCE_BOARD_ID
}={}){
 if(sourceBoardId!==TALKBOX_SOURCE_BOARD_ID)throw new TypeError('Unexpected monday.com board');
 if(!Array.isArray(sourceIssues)||!Array.isArray(crmIssues))
  throw new TypeError('Both authoritative issue arrays are required');
 const violations=[],sourceById=new Map(),crmById=new Map(),crmBySource=new Map();
 for(const source of sourceIssues){
  const id=normalizeId(source?.id);
  if(!nonemptyId(id)||sourceById.has(id)){violations.push('Invalid or duplicate monday issue ID: '+id);continue;}
  if(source.boardId!==undefined&&normalizeId(source.boardId)!==TALKBOX_SOURCE_BOARD_ID)
   violations.push('Source issue belongs to another monday board: '+id);
  sourceById.set(id,source);
 }
 for(const crm of crmIssues){
  const id=normalizeId(crm?.id),sourceId=mappedSourceId(crm);
  if(!nonemptyId(id)||crmById.has(id)){violations.push('Invalid or duplicate CRM issue ID: '+id);continue;}
  crmById.set(id,crm);
  if(sourceId!==null){
   if(!nonemptyId(sourceId)||crmBySource.has(sourceId))
    violations.push('Invalid or duplicate CRM source reference: '+sourceId);
   else crmBySource.set(sourceId,crm);
  }
 }
 const matched=[],unmapped=[],orphanReferences=[];
 for(const [id,source] of sourceById){
  const crm=crmBySource.get(id);
  if(crm)matched.push({sourceId:id,crmId:normalizeId(crm.id)});
  else unmapped.push({sourceId:id,name:String(source.name??''),action:'REVIEW_ONLY'});
 }
 for(const [sourceId,crm] of crmBySource)if(!sourceById.has(sourceId))
  orphanReferences.push({sourceId,crmId:normalizeId(crm.id)});
 if(orphanReferences.length&&sourceComplete)
  violations.push('CRM records reference absent source issue IDs');
 const complete=sourceComplete===true&&crmComplete===true;
 if(!complete)violations.push('Full monday export and complete signed CRM pagination are required');
 return Object.freeze({
  status:violations.length?'BLOCKED':unmapped.length?'RECONCILIATION_REQUIRED':'MATCHED',
  sourceBoardId:TALKBOX_SOURCE_BOARD_ID,subitemBoardId:TALKBOX_SOURCE_SUBITEM_BOARD_ID,
  counts:{source:sourceById.size,crm:crmById.size,matched:matched.length,
   unmapped:unmapped.length,orphanReferences:orphanReferences.length},
  matched,unmapped,orphanReferences,violations,
  writesAuthorized:false
 });
}

/**
 * Subitems must be reconciled separately from parent issues.
 * The legacy CRM projection currently reports boardId 18370784141, which
 * must not be silently equated to monday source board 18371220520.
 */
export function reconcileTalkBoxSubitemIdentities({
 sourceSubitems,crmSubitems,sourceComplete=false,crmComplete=false
}={}){
 if(!Array.isArray(sourceSubitems)||!Array.isArray(crmSubitems))
  throw new TypeError('Both subitem arrays are required');
 const violations=[],crmRefs=new Map(),crmIds=new Set(),sourceIds=new Set(),matched=[];
 for(const source of sourceSubitems){
  const subId=normalizeId(source?.id);
  if(!nonemptyId(subId)||sourceIds.has(subId)){violations.push('Invalid or duplicate source subitem ID: '+subId);continue;}
  sourceIds.add(subId);
  if(normalizeId(source?.boardId)!==TALKBOX_SOURCE_SUBITEM_BOARD_ID)
   violations.push('Subitem source board identity mismatch: '+subId);
  if(!nonemptyId(normalizeId(source?.parentId)))
   violations.push('Subitem parent source ID is required: '+subId);
 }
 for(const crm of crmSubitems){
  const id=normalizeId(crm?.id),external=mappedSourceId(crm);
  if(!nonemptyId(id)||crmIds.has(id)){violations.push('Invalid or duplicate CRM subitem ID: '+id);continue;}
  crmIds.add(id);
  if(external!==null){
   if(!nonemptyId(external)||crmRefs.has(external))
    violations.push('Invalid or duplicate CRM subitem source reference: '+external);
   else crmRefs.set(external,crm);
  }
 }
 for(const sourceId of sourceIds)if(crmRefs.has(sourceId))
  matched.push({sourceId,crmId:normalizeId(crmRefs.get(sourceId).id)});
 if(!sourceComplete||!crmComplete)
  violations.push('A complete signed source and CRM subitem snapshot is required');
 return Object.freeze({
  status:violations.length?'BLOCKED':matched.length===sourceIds.size?'MATCHED':'RECONCILIATION_REQUIRED',
  sourceBoardId:TALKBOX_SOURCE_SUBITEM_BOARD_ID,
  counts:{source:sourceIds.size,crm:crmSubitems.length,matched:matched.length},
  matched,violations,writesAuthorized:false
 });
}
