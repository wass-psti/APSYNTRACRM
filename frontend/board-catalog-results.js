/** Presentation-only summary for signed, already-authorized board results. */
export function boardCatalogResultLabel(count,{query='',status='Active'}={}){
 const quantity=Number.isSafeInteger(count)&&count>=0?count:0;
 const total=quantity.toLocaleString('en-US');
 const category=['Active','Archived','Trash'].includes(status)?status:'Active';
 const noun=quantity===1?'board':'boards';
 return String(query).trim()?`${total} matching ${category.toLowerCase()} ${noun}`:
  `${total} ${category.toLowerCase()} ${noun}`;
}
