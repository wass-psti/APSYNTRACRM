/** Signed board-view selection is ephemeral and never grants write authority.
 * Only authenticated, already returned board items may enter the selection.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeCsv=value=>{
 const str=String(value??'').replace(/\r\n?/g,'\n');
 const neutralized=/^\s*[=+\-@\t\r]/.test(str)?"'"+str:str;
 return '"'+neutralized.replace(/"/g,'""')+'"';
};
export function matchBoardSearch(board,query){
 const needle=String(query??'').trim().toLocaleLowerCase();
 return !needle||[board?.name,board?.description].some(v=>
  String(v??'').toLocaleLowerCase().includes(needle));
}
export class BoardItemSelection{
 constructor(){this.identity='';this.ids=new Set();this.lastId=null;}
 bind(identity,available=[]){
  if(typeof identity!=='string'||!identity||identity!==this.identity){
   this.identity=identity;this.clear();
  }
  this.reconcile(available);
 }
 reconcile(available=[]){
  const allowed=new Set(available.filter(id=>typeof id==='string'&&UUID.test(id)));
  for(const id of this.ids)if(!allowed.has(id))this.ids.delete(id);
  if(this.lastId&&!allowed.has(this.lastId))this.lastId=null;
  this.available=allowed;
  return this.size;
 }
 clear(){this.ids.clear();this.lastId=null;}
 get size(){return this.ids.size;}
 has(id){return this.ids.has(id);}
 toggle(id,checked,{shift=false,ordered=[]}={}){
  if(!this.available?.has(id))return this.size;
  const start=shift&&this.lastId?ordered.indexOf(this.lastId):-1,end=ordered.indexOf(id);
  if(start>=0&&end>=0){
   for(const candidate of ordered.slice(Math.min(start,end),Math.max(start,end)+1))
    if(this.available.has(candidate))checked?this.ids.add(candidate):this.ids.delete(candidate);
  }else checked?this.ids.add(id):this.ids.delete(id);
  this.lastId=id;
  return this.size;
 }
 selectVisible(visible,{checked=true}={}){
  for(const id of visible)if(this.available?.has(id))checked?this.ids.add(id):this.ids.delete(id);
  return this.size;
 }
 selected(visible){return visible.filter(id=>this.ids.has(id));}
}
export function exportVisibleBoardItems(rows,selectedIds,{boardId}={}){
 if(!UUID.test(boardId||''))throw Error('A verified board identifier is required');
 const selected=new Set(selectedIds);
 const permitted=rows.filter(row=>UUID.test(row?.id||'')&&
  selected.has(row.id)&&row.board_id===boardId);
 if(permitted.length!==selected.size||permitted.length>2000)
  throw Error('Selected items are stale, inaccessible, or exceed the export limit');
 const fields=['Record ID','Title','Status','Group ID','Updated at'];
 return '\uFEFF'+[fields.map(safeCsv).join(','),
  ...permitted.map(row=>[row.id,row.title,row.status,row.group_id,row.updated_at]
   .map(safeCsv).join(','))].join('\r\n')+'\r\n';
}
