/** Import mapping gate: ordinary-column consent and configured choice setup are
 * separate authorized operations. Never convert an unresolved choice into a
 * generic column or silently skip its source values.
 */
export function importMappingReadiness(mappings,allowColumns=false){
 const list=Array.isArray(mappings)?mappings:[];
 const pendingChoices=list.flatMap((mapping,index)=>
  mapping?.action==='configure'?
   [{index,source:String(mapping.source||''),type:mapping.choiceType==='dropdown'?
     'dropdown':'status'}]:[]);
 const newColumns=list.filter(mapping=>mapping?.action==='create');
 const pendingSkips=list.flatMap((mapping,index)=>mapping?.action==='skip'&&mapping.requiresDecision===true?\n  [{index,source:String(mapping.source||''),type:String(mapping.type||'text')}]:[]);\n const pendingSkips=list.flatMap((mapping,index)=>mapping?.action==='skip'&&mapping.requiresDecision===true?\n  [{index,source:String(mapping.source||''),type:String(mapping.type||'text')}]:[]);\n const skipped=list.filter(mapping=>mapping?.action==='skip').map(x=>String(x.source||''));
 return {
  pendingChoices,
  proposedCount:newColumns.length,
  awaitingColumnApproval:newColumns.length>0&&!allowColumns,
  skipped,
  ready:pendingChoices.length===0&&(newColumns.length===0||allowColumns)
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
