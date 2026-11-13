/** Update an already-rendered result set without replacing its containing UI.
 * Search values are precomputed, escaped data attributes from the same render.
 * No persistence, network requests, observers, or background work.
 */
export function applySearchVisibility(root,{
 selector,query='',searchAttribute='searchText',groupSelector=null,emptySelector=null
}={}){
 if(!root||typeof selector!=='string'||!selector)return {total:0,visible:0};
 const needle=String(query??'').trim().toLocaleLowerCase();
 const rows=[...root.querySelectorAll(selector)];
 const groupCounts=new Map();
 let visible=0;
 for(const row of rows){
  const text=String(row.dataset?.[searchAttribute]??'');
  const matches=!needle||text.includes(needle);
  row.hidden=!matches;
  if(matches)visible++;
  if(groupSelector){
   const group=row.closest(groupSelector);
   if(group)groupCounts.set(group,(groupCounts.get(group)||0)+(matches?1:0));
  }
 }
 if(groupSelector){
  for(const group of root.querySelectorAll(groupSelector))
   group.hidden=(groupCounts.get(group)||0)===0;
 }
 if(emptySelector){
  const empty=root.querySelector(emptySelector);
  if(empty)empty.hidden=visible!==0;
 }
 return {total:rows.length,visible};
}
