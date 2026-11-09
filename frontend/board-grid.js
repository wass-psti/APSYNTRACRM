/** Authorized typed board-grid presentation. No domain records are synthesized. */
import {moduleByBoardName} from './board-manifest.js';
import {isTradeLinkBoard,tradeLinkGridColumns,tradeLinkDisplayValue,TRADELINK_FILES_KEY} from './tradelink-board-items.js';
import {boardTable} from './board-presentation.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function boardItemsComplete(detail){
 const paging=detail?.pagination||detail?.page||{};
 if(detail?.has_more===true||paging.has_more===true||
    detail?.next_cursor||paging.next_cursor||paging.nextCursor)return false;
 const total=detail?.total_count??paging.total_count??paging.total;
 return total==null||Number(total)<=Number(detail?.items?.length||0);
}
export function boardGridColumns(detail,{primaryTitle='Record',columnLabels={},allowCustom=false}={}){
 const tradeLink=tradeLinkGridColumns(detail);
 if(tradeLink)return tradeLink;
 const module=moduleByBoardName(detail?.board?.name);
 const allowed=module?new Set(module.fields.map(f=>f.name)):null;
 const restricted=module?new Set(module.restricted.map(n=>n.trim().toLowerCase())):null;
 const columns=(Array.isArray(detail?.columns)?detail.columns:[])
  .filter(c=>c.visible!==false&&c.system_key==null&&
   (!allowed||allowed.has(c.name)||
    (allowCustom&&(((c.column_key||'').startsWith('custom:')||
      (c.column_key||'').startsWith('custom_'))&&
      !restricted.has(String(c.name||'').trim().toLowerCase())))));
 // The existing FuelTrack+ v3 board is a protected domain projection, not an
 // ordinary mutable board. Prepare the Monday-style Item / Status / Date view
 // by reusing its authoritative Event Date column. Source lineage, fuel metrics,
 // reconciliation and pump references remain stored and protected; no migration
 // or lossy field deletion is required before the domain app is integrated.
 // Fail closed to the ordinary domain grid if the expected date contract drifts.
 const fueltrack=detail?.board?.id==='7af78b3f-67bf-4600-9aa1-9006d19d486e'&&
  module?.key==='fueltrack'&&
  String(detail.board.description||'').startsWith('[APSYNTRA:MODULE:fueltrack:v1]');
 const eventDate=columns.find(c=>c.name==='Event Date'&&c.data_type==='date');
 if(fueltrack&&eventDate){
  return [{key:'record',title:'Item'},{key:'status',title:'Status'},
   {key:'col:'+eventDate.id,title:'Date'}];
 }
 return [{key:'record',title:primaryTitle},{key:'status',title:'Status'},
  ...columns.map(c=>({key:'col:'+c.id,title:columnLabels[c.id]||c.name}))];
}
/** Prepare authorized, visible board fields once per board render.
 * Kept render-local: no cross-session cache or stale authorization state.
 */
export function prepareBoardGrid(detail,{primaryTitle='Record',columnLabels={},allowCustom=false}={}){
 const columns=boardGridColumns(detail,{primaryTitle,columnLabels,allowCustom});
 const allowedIds=new Set(columns.filter(c=>c.key.startsWith('col:')).map(c=>c.key.slice(4)));
 const visibleColumns=(Array.isArray(detail?.columns)?detail.columns:[])
  .filter(c=>allowedIds.has(c.id));
 const values=Array.isArray(detail?.values)?detail.values:[];
 const lookup=new Map(values.map(v=>[v.item_id+':'+v.column_id,v.value]));
 return {columns,visibleColumns,lookup};
}
export function boardGrid(detail,{groupId=null,layout=null,primaryTitle='Record',columnLabels={},allowCustom=false,selection=null,footer='',summaries=null,prepared=null,groupItems=null}={}){
 const items=Array.isArray(detail?.items)?detail.items:[];
 const {columns,visibleColumns,lookup}=prepared||
  prepareBoardGrid(detail,{primaryTitle,columnLabels,allowCustom});
 const displayed=Array.isArray(groupItems)?groupItems:(groupId?items.filter(i=>i.group_id===groupId):items);
 const tradeLink=isTradeLinkBoard(detail?.board);
 const rows=displayed.map(item=>{
  const cells={record:'<button type="button" class="board-item-open" data-action="board-item-detail" data-id="'+escape(item.id)+'" aria-label="Open '+escape(item.title||'Untitled')+' details">'+escape(item.title||'Untitled')+'</button>',
   status:'<span class="status">'+escape(item.status??'—')+'</span>'};
  if(tradeLink)cells[TRADELINK_FILES_KEY]='—';
  for(const col of visibleColumns){
   const value=lookup.get(item.id+':'+col.id);
   const shown=tradeLink?tradeLinkDisplayValue(col,value):value===null||value===undefined?'—':
    typeof value==='boolean'?(value?'Yes':'No'):
    typeof value==='number'?String(value):
    typeof value==='string'?value:
    typeof value==='object'&&value&&value.start&&value.end?value.start+' – '+value.end:'—';
   cells['col:'+col.id]=escape(shown);
  }
  return {itemId:item.archived_at?null:item.id,search:String(item.title||'').toLowerCase(),cells};
 });
 let html=boardTable({columns,rows,layout,groupId:groupId||'ungrouped',
  empty:'No items in this group yet',selection,footer,summaries,
  virtualize:boardItemsComplete(detail)});
 // Internal data-flow details belong in administrator diagnostics, not the board UI.
 return html;
}
