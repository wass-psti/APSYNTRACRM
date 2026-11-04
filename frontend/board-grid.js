/** Authorized typed board-grid presentation. No domain records are synthesized. */
import {moduleByBoardName} from './board-manifest.js';
import {boardTable} from './board-presentation.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function boardGridColumns(detail,{primaryTitle='Record',columnLabels={},allowCustom=false}={}){
 const module=moduleByBoardName(detail?.board?.name);
 const allowed=module?new Set(module.fields.map(f=>f.name)):null;
 const restricted=module?new Set(module.restricted.map(n=>n.trim().toLowerCase())):null;
 const columns=(Array.isArray(detail?.columns)?detail.columns:[])
  .filter(c=>c.visible!==false&&c.system_key==null&&
   (!allowed||allowed.has(c.name)||
    (allowCustom&&(((c.column_key||'').startsWith('custom:')||
      (c.column_key||'').startsWith('custom_'))&&
      !restricted.has(String(c.name||'').trim().toLowerCase())))));
 return [{key:'record',title:primaryTitle},{key:'status',title:'Status'},
  ...columns.map(c=>({key:'col:'+c.id,title:columnLabels[c.id]||c.name}))];
}
/** Prepare authorized, visible board fields once per board render.
 * Kept render-local: no cross-session cache or stale authorization state.
 */
export function prepareBoardGrid(detail,{primaryTitle='Record',columnLabels={},allowCustom=false}={}){
 const columns=boardGridColumns(detail,{primaryTitle,columnLabels,allowCustom});
 const allowedIds=new Set(columns.slice(2).map(c=>c.key.slice(4)));
 const visibleColumns=(Array.isArray(detail?.columns)?detail.columns:[])
  .filter(c=>allowedIds.has(c.id));
 const values=Array.isArray(detail?.values)?detail.values:[];
 const lookup=new Map(values.map(v=>[v.item_id+':'+v.column_id,v.value]));
 return {columns,visibleColumns,lookup};
}
export function boardGrid(detail,{groupId=null,layout=null,primaryTitle='Record',columnLabels={},allowCustom=false,selection=null,footer='',summaries=null,prepared=null}={}){
 const items=Array.isArray(detail?.items)?detail.items:[];
 const {columns,visibleColumns,lookup}=prepared||
  prepareBoardGrid(detail,{primaryTitle,columnLabels,allowCustom});
 const displayed=groupId?items.filter(i=>i.group_id===groupId):items;
 const rows=displayed.map(item=>{
  const cells={record:'<button type="button" class="board-item-open" data-action="board-item-detail" data-id="'+escape(item.id)+'" aria-label="Open '+escape(item.title||'Untitled')+' details">'+escape(item.title||'Untitled')+'</button>',
   status:'<span class="status">'+escape(item.status??'—')+'</span>'};
  for(const col of visibleColumns){
   const value=lookup.get(item.id+':'+col.id);
   const shown=value===null||value===undefined?'—':
    typeof value==='boolean'?(value?'Yes':'No'):
    typeof value==='number'?String(value):
    typeof value==='string'?value:
    typeof value==='object'&&value&&value.start&&value.end?value.start+' – '+value.end:'—';
   cells['col:'+col.id]=escape(shown);
  }
  return {itemId:item.archived_at?null:item.id,search:String(item.title||'').toLowerCase(),cells};
 });
 let html=boardTable({columns,rows,layout,groupId:groupId||'ungrouped',
  empty:'No items in this group yet',selection,footer,summaries});
 // Internal data-flow details belong in administrator diagnostics, not the board UI.
 return html;
}
