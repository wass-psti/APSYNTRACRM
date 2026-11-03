/**
 * APSYNTRA board presentation state. Never grants access or changes record schemas.
 * Each harmless layout value is scoped to a verified actor/workspace/board identity.
 */
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREFIX='apsyntra.board-layout.v1';
export const BOARD_COLUMN_MIN=110;
export const BOARD_COLUMN_MAX=520;
export const BOARD_DEFAULT_WIDTH=185;
export const BOARD_REQUIRED_COLUMNS=Object.freeze(['record','status']);
export function preferenceKey(context,boardId){
 const user=context?.user_id,workspace=context?.workspace_id;
 if(!ID.test(user||'')||!ID.test(workspace||'')||!ID.test(boardId||''))return null;
 return [PREFIX,user,workspace,boardId].join(':');
}
export function columnWidth(width){
 const n=Number(width);
 return Number.isFinite(n)?Math.min(BOARD_COLUMN_MAX,Math.max(BOARD_COLUMN_MIN,Math.round(n))):BOARD_DEFAULT_WIDTH;
}
export function reorderVisible(keys,source,target){
 if(source===target||!keys.includes(source)||!keys.includes(target))return [...keys];
 const next=keys.filter(k=>k!==source);
 next.splice(next.indexOf(target),0,source);
 return next;
}
export function normalizeLayout(raw,tabs,columns){
 const availableTabs=[...new Set(tabs)];
 const availableColumns=[...new Set(columns)];
 const tabsStored=Array.isArray(raw?.tabs)?raw.tabs:[];
 const colsStored=Array.isArray(raw?.columns)?raw.columns:[];
 const ordered=(existing,stored)=>[
  ...stored.filter((x,i)=>typeof x==='string'&&existing.includes(x)&&stored.indexOf(x)===i),
  ...existing.filter(x=>!stored.includes(x))
 ];
 const hidden=Array.isArray(raw?.hidden)?
  [...new Set(raw.hidden.filter(k=>availableColumns.includes(k)&&
    !BOARD_REQUIRED_COLUMNS.includes(k)&&k!=='actions'))]:[];
 const widths=Object.create(null);
 for(const key of availableColumns)widths[key]=columnWidth(raw?.widths?.[key]);
 return {tabs:ordered(availableTabs,tabsStored),
  columns:[...availableColumns.filter(k=>BOARD_REQUIRED_COLUMNS.includes(k)),
   ...ordered(availableColumns.filter(k=>!BOARD_REQUIRED_COLUMNS.includes(k)),colsStored)],hidden,widths};
}
export function loadBoardLayout(context,boardId,tabs,columns,storage=globalThis.localStorage){
 const key=preferenceKey(context,boardId);
 if(!key||!storage)return normalizeLayout({},tabs,columns);
 try{
  const source=storage.getItem(key);
  if(!source||source.length>8000)return normalizeLayout({},tabs,columns);
  return normalizeLayout(JSON.parse(source),tabs,columns);
 }catch{return normalizeLayout({},tabs,columns);}
}
export function saveBoardLayout(context,boardId,layout,storage=globalThis.localStorage){
 const key=preferenceKey(context,boardId);
 if(!key||!storage)return false;
 try{
  // Layouts contain identifiers, not titles, rows, employee names or GPS.
  storage.setItem(key,JSON.stringify(layout));return true;
 }catch{return false;}
}
export function resetBoardLayout(context,boardId,storage=globalThis.localStorage){
 const key=preferenceKey(context,boardId);
 if(!key||!storage)return false;
 try{storage.removeItem(key);return true;}catch{return false;}
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function boardTable({columns=[],rows=[],empty='No persisted records',layout=null,groupId='ungrouped',selection=null}={}){
 const available=columns.map(c=>c.key);
 const pref=normalizeLayout(layout||{},[],available);
 const visible=pref.columns.filter(k=>!pref.hidden.includes(k));
 const lookup=new Map(columns.map(c=>[c.key,c]));
 const cells=visible.map(k=>lookup.get(k));
 const tableWidth=visible.reduce((total,k)=>total+pref.widths[k],0);
 return '<div class="panel board-group-panel"><div class="table-scroll board-group-scroll" '+
  'role="region" tabindex="0" aria-label="Horizontally scrollable board group">'+
  '<table class="board-table board-table-custom" data-group-id="'+esc(groupId)+'" width="'+tableWidth+'">'+
  '<colgroup>'+visible.map(k=>'<col data-column-key="'+esc(k)+'" width="'+pref.widths[k]+'">').join('')+'</colgroup>'+
  '<thead><tr>'+cells.map((c,i)=>'<th scope="col" data-column-key="'+esc(c.key)+'" draggable="'+(i>1)+'"'+
    (i===0?' class="board-frozen-column"':'')+'>'+
   '<span class="board-heading-label">'+(i===0&&selection?.enabled?'<input type="checkbox" class="board-select-all" data-board-select-all="'+esc(groupId)+'" aria-label="Select visible eligible items in this group" />':'')+esc(c.title)+'</span>'+
   (i>1?'<button type="button" class="board-column-handle" data-column-key="'+esc(c.key)+'" '+
    'aria-label="Drag to reorder '+esc(c.title)+' column" title="Drag to reorder">⠿</button>':'')+
   '<button type="button" class="board-column-resize" data-column-key="'+esc(c.key)+'" '+
    'aria-label="Resize '+esc(c.title)+' column" title="Drag to resize">⋮</button>'+
   '</th>').join('')+'</tr></thead>'+
  '<tbody>'+(rows.length?rows.map(row=>'<tr data-searchable="'+esc(row.search||'')+'"'+(selection?.enabled&&row.itemId?' data-bulk-row="'+esc(row.itemId)+'"':'')+'>'+
   visible.map((k,i)=>'<td'+(i===0?' class="board-frozen-column"':'')+'>'+
    (i===0&&selection?.enabled&&row.itemId?'<input type="checkbox" class="board-row-select" data-board-select-item="'+esc(row.itemId)+'" aria-label="Select this record"'+(selection.selected?.has(row.itemId)?' checked':'')+' />':'')+
    String(row.cells?.[k]??'—')+'</td>').join('')+'</tr>').join(''):
   '<tr><td colspan="'+visible.length+'" class="board-empty-row">'+esc(empty)+'</td></tr>')+
  '</tbody></table></div></div>';
}
export function boardColumnMenu(columns,layout){
 const pref=normalizeLayout(layout||{},[],columns.map(c=>c.key));
 return '<details class="board-column-menu"><summary>Columns</summary>'+
  '<div class="board-column-menu-content"><strong>Visible columns</strong>'+
  columns.map(c=>'<label for="board-column-'+esc(c.key)+'"><input id="board-column-'+esc(c.key)+'" type="checkbox" data-board-column-toggle="'+esc(c.key)+'" '+
   (!pref.hidden.includes(c.key)?'checked ':'')+
   (BOARD_REQUIRED_COLUMNS.includes(c.key)||c.key==='actions'?'disabled ':'')+'/>'+
   '<span>'+esc(c.title)+'</span></label>').join('')+
  '<p>Drag the table headers to reorder or use the arrow controls.</p>'+
  pref.columns.filter(k=>!BOARD_REQUIRED_COLUMNS.includes(k)).map(k=>
   '<div class="board-column-order"><span>'+esc(columns.find(c=>c.key===k)?.title||k)+'</span>'+
   '<button type="button" data-action="board-column-move" data-key="'+esc(k)+'" data-direction="-1" aria-label="Move '+esc(k)+' left">←</button>'+
   '<button type="button" data-action="board-column-move" data-key="'+esc(k)+'" data-direction="1" aria-label="Move '+esc(k)+' right">→</button></div>').join('')+
  '<button type="button" class="secondary" data-action="board-layout-reset">Reset layout</button>'+
  '</div></details>';
}
