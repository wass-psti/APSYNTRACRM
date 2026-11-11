/** Import readiness: distinguish board-manager schema capability from unresolved
 * Status/Dropdown configuration. The final import review confirms exact changes.
 */
export function importMappingReadiness(mappings,canCreateColumns=false){
 const list=Array.isArray(mappings)?mappings:[];
 const pendingChoices=list.flatMap((mapping,index)=>
  mapping?.action==='configure'?
   [{index,source:String(mapping.source||''),type:mapping.choiceType==='dropdown'?
     'dropdown':'status'}]:[]);
 const newColumns=list.filter(mapping=>mapping?.action==='create');
 const skipped=list.filter(mapping=>mapping?.action==='skip').map(x=>String(x.source||''));
 return {
  pendingChoices,
  proposedCount:newColumns.length,
  requiresColumnPermission:newColumns.length>0&&!canCreateColumns,
  skipped,
  ready:pendingChoices.length===0&&(newColumns.length===0||canCreateColumns)
 };
}
export function skipPendingImportChoice(mappings,index){
 if(!Array.isArray(mappings)||mappings[index]?.action!=='configure')
  throw new Error('No pending choice column was selected.');
 return mappings.map((m,i)=>i===index?{...m,action:'skip'}:m);
}
export function matchConfiguredImportChoice(mappings,index,columnId){
 if(!Array.isArray(mappings)||mappings[index]?.action!=='configure'||
  typeof columnId!=='string'||!columnId)
  throw new Error('A verified configured column is required.');
 return mappings.map((m,i)=>i===index?{...m,action:'existing',columnId,
  type:m.choiceType}:m);
}
