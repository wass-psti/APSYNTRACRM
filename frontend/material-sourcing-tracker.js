/** Signed Material Sourcing public-board projection. No private sourcing RPC,
 * financial figures, test data, or guessed supplier values enter this view. */
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP,
 isApprovedPublicMaterialSourcingColumn} from './material-sourcing-schema-plan.js';
import {boardItemsComplete} from './board-grid.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=['Source Type','Material description','Brand','RFQ Ref No','Date required','Leadtime in Weeks'];
const localDay=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const dateValue=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))?v:'';
const safeValue=v=>typeof v==='string'?v:typeof v==='number'&&Number.isFinite(v)?String(v):'';
export const MATERIAL_TRACKER_DEFAULT_FILTERS=Object.freeze({search:'',source:'all',overdue:false});
export function isMaterialTrackerBoard(detail){
 return detail?.board?.id===MATERIAL_SOURCING_BOARD_ID&&detail.board.name==='Material Request Hub'&&
  detail.board.status==='active'&&detail.groups?.some(g=>
   g.id===MATERIAL_SOURCING_GROUP.id&&g.title===MATERIAL_SOURCING_GROUP.title);
}
export function materialTrackerRows(detail,{today=new Date()}={}){
 if(!isMaterialTrackerBoard(detail))return [];
 const cols=new Map((detail.columns||[]).filter(c=>
  c.name==='Quantity'&&c.data_type==='number'&&c.visible!==false&&c.system_key==null||
  fields.includes(c.name)&&isApprovedPublicMaterialSourcingColumn(detail.board,c))
  .map(c=>[c.name,c.id]));
 const allowed=new Set(cols.values());
 const values=new Map((detail.values||[]).filter(v=>allowed.has(v.column_id)).map(v=>
  [v.item_id+':'+v.column_id,v.value]));
 const get=(row,name)=>safeValue(values.get(row.id+':'+cols.get(name)));
 const current=localDay(today);
 return (detail.items||[]).filter(item=>
  item.group_id===MATERIAL_SOURCING_GROUP.id&&!item.archived_at&&
  typeof item.id==='string'&&typeof item.title==='string').map(item=>{
  const source=get(item,'Source Type'),due=dateValue(get(item,'Date required'));
  return Object.freeze({id:item.id,partNumber:item.title,source:['Local','Import'].includes(source)?source:'',
   description:get(item,'Material description'),brand:get(item,'Brand'),
   quantity:get(item,'Quantity'),rfq:get(item,'RFQ Ref No'),due,
   lead:get(item,'Leadtime in Weeks'),overdue:!!due&&due<current});
 });
}
export function filterMaterialTrackerRows(rows,filters={}){
 const query=String(filters.search||'').toLocaleLowerCase().trim().slice(0,120);
 const source=['Local','Import'].includes(filters.source)?filters.source:'all';
 return rows.filter(row=>(source==='all'||row.source===source)&&
  (!filters.overdue||row.overdue)&&(!query||
  [row.partNumber,row.description,row.brand,row.rfq].some(v=>v.toLocaleLowerCase().includes(query))));
}
export function renderMaterialSourcingTracker(detail,filters=MATERIAL_TRACKER_DEFAULT_FILTERS,now=new Date()){
 if(!isMaterialTrackerBoard(detail))
  return '<section class="panel" role="alert">Material Tracker cannot verify the original Main group. No records displayed.</section>';
 const all=materialTrackerRows(detail,{today:now});
 const rows=filterMaterialTrackerRows(all,filters);
 const count=type=>all.filter(row=>row.source===type).length;
 const overdue=all.filter(row=>row.overdue).length;
 const displayed=row=>{
  const source=row.source?'<span class="mrh-source '+row.source.toLowerCase()+'">'+esc(row.source)+'</span>':'—';
  return '<tr><td><button type="button" class="mrh-part-link" data-action="board-item-detail" data-id="'+esc(row.id)+'">'+esc(row.partNumber)+'</button></td>'+
   [row.description,row.brand,row.quantity].map(v=>'<td>'+esc(v||'—')+'</td>').join('')+
   '<td>'+source+'</td><td>'+esc(row.rfq||'—')+'</td><td>'+esc(row.due||'—')+
   (row.overdue?' <span class="mrh-overdue-label">Overdue</span>':'')+'</td><td>'+esc(row.lead||'—')+'</td></tr>';
 };
 return '<section class="mrh-tracker" aria-label="Material Sourcing application">'+
  '<header class="mrh-tracker-head"><div><span class="label-top">Material Request Hub / Application view</span>'+
  '<h2>Material Tracker</h2><p>Authorized procurement records. Prices, requesters and vendors remain in protected item details.</p></div>'+
  '<button type="button" class="secondary" data-action="refresh-board">↻ Refresh</button></header>'+
  '<div class="mrh-tracker-stats" aria-label="Loaded materials summary">'+
  [['Total materials',all.length],['Local',count('Local')],['Import',count('Import')],['Overdue',overdue]]
   .map(([name,value])=>'<div><span>'+name+'</span><strong>'+value+'</strong></div>').join('')+'</div>'+
  (!boardItemsComplete(detail)?'<p class="muted" role="status">Partial board page: displayed counts exclude records not yet loaded.</p>':'')+
  '<div class="mrh-tracker-controls"><label><span class="sr-only">Search materials</span>'+
  '<input type="search" id="mrh-tracker-search" placeholder="Search materials, part numbers, brands or RFQs…" maxlength="120" value="'+esc(filters.search||'')+'"></label>'+
  '<label><span class="sr-only">Source Type</span><select id="mrh-tracker-source">'+
   [['all','All sources'],['Local','Local'],['Import','Import']].map(([value,label])=>
   '<option value="'+value+'"'+(filters.source===value?' selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
  '<label class="mrh-tracker-overdue"><input type="checkbox" id="mrh-tracker-overdue"'+(filters.overdue?' checked':'')+'> Overdue ('+overdue+')</label>'+
  '<span class="muted" role="status" aria-live="polite">'+rows.length+' of '+all.length+' loaded</span></div>'+
  '<div class="mrh-tracker-table-scroll" role="region" aria-label="Horizontally scrollable materials table" tabindex="0">'+
  '<table class="mrh-tracker-table"><thead><tr>'+
  ['Part number','Material description','Brand','Quantity','Source Type','RFQ Ref No','Date required','Lead (weeks)']
   .map(c=>'<th scope="col">'+c+'</th>').join('')+'</tr></thead><tbody>'+
  (rows.length?rows.map(displayed).join(''):'<tr><td colspan="8" class="mrh-tracker-empty">No matching materials in the authorized board. No sample records are generated.</td></tr>')+
  '</tbody></table></div>'+
  '<p class="muted mrh-tracker-note">Group: Main group (unchanged). Financial and supplier fields require signed, item-scoped authorization.</p></section>';
}
