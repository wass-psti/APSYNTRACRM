/** Signed Material Sourcing public-board projection. No private sourcing RPC,
 * financial figures, test data, or guessed supplier values enter this view. */
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP,
 isApprovedPublicMaterialSourcingColumn} from './material-sourcing-schema-plan.js';
import {boardItemsComplete} from './board-grid.js';
import {renderMaterialSourcingAddMaterial} from './material-sourcing-add-material.js';

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
   created:typeof item.created_at==='string'&&!Number.isNaN(Date.parse(item.created_at))?
    item.created_at.slice(0,10):'',
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
/** CSV export uses only the approved public rows; spreadsheet formulas are inert. */
export function materialTrackerPublicCsv(rows){
 const headers=['Part number','Created','Source Type','RFQ Ref No','Material description','Brand','Quantity','Date required','Lead (weeks)'];
 const safeCell=value=>{
  const raw=String(value??'');
  const safe=/^[\s\u0000-\u001f]*[=+@-]/.test(raw)?"'"+raw:raw;
  return '"'+safe.replace(/"/g,'""')+'"';
 };
 return [headers,...rows.map(row=>[row.partNumber,row.created,row.source,row.rfq,
  row.description,row.brand,row.quantity,row.due,row.lead])]
  .map(row=>row.map(safeCell).join(',')).join('\r\n')+'\r\n';
}
const visibleDate=value=>{
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return '';
 return new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
};
const nfmt=value=>new Intl.NumberFormat('en-US').format(value);
function countCard(label,value,{icon='',tone='',note=''}={}){
 return '<article class="mrh-kpi-card '+tone+'"><div class="mrh-kpi-top">'+
  '<span class="mrh-kpi-icon" aria-hidden="true">'+icon+'</span><span>'+esc(label)+'</span></div>'+
  '<strong>'+esc(value)+'</strong>'+(note?'<small>'+esc(note)+'</small>':'')+'</article>';
}
function sourceBreakdown(local,imported,unknown){
 const total=local+imported+unknown;
 const localPercent=total?Math.round(local/total*100):0;
 const importPercent=total?Math.round(imported/total*100):0;
 const unknownPercent=total?100-localPercent-importPercent:0;
 return '<article class="mrh-kpi-card mrh-breakdown"><div class="mrh-breakdown-ring" role="img" '+
  'aria-label="Local: '+local+', Import: '+imported+', Unspecified: '+unknown+'">'+
  '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">'+
   '<circle cx="50" cy="50" r="36" pathLength="100" class="mrh-ring-base"/>'+
   '<circle cx="50" cy="50" r="36" pathLength="100" class="mrh-ring-local" stroke-dasharray="'+localPercent+' '+(100-localPercent)+'" transform="rotate(-90 50 50)"/>'+
   '<circle cx="50" cy="50" r="36" pathLength="100" class="mrh-ring-import" stroke-dasharray="'+importPercent+' '+(100-importPercent)+'" stroke-dashoffset="'+(-localPercent)+'" transform="rotate(-90 50 50)"/>'+
  '</svg><span class="mrh-breakdown-total">'+nfmt(total)+'</span></div><div class="mrh-breakdown-labels">'+
  '<strong>Materials by source</strong>'+
  [['local','Local',local,localPercent],['import','Import',imported,importPercent],['unknown','Unspecified',unknown,unknownPercent]]
  .map(([tone,name,count,percent])=>'<div><span class="mrh-legend-dot '+tone+'"></span><span>'+name+'</span><b>'+nfmt(count)+'</b><small>'+percent+'%</small></div>').join('')+
  '</div></article>';
}
export function renderMaterialSourcingTracker(detail,filters=MATERIAL_TRACKER_DEFAULT_FILTERS,now=new Date(),options={}){
 if(!isMaterialTrackerBoard(detail))
  return '<section class="panel" role="alert">Material Tracker cannot verify the original Main group. No records displayed.</section>';
 const all=materialTrackerRows(detail,{today:now});
 const rows=filterMaterialTrackerRows(all,filters);
 const count=type=>all.filter(row=>row.source===type).length;
 const locals=count('Local'),imports=count('Import'),unknown=all.length-locals-imports;
 const overdue=all.filter(row=>row.overdue).length;
 const canCreate=options.canCreate===true;
 if(options.view==='add'){
  return '<section class="mrh-tracker mrh-add-app" aria-label="Material Sourcing application">'+
   '<header class="mrh-tracker-head"><div class="mrh-tracker-identity">'+
    '<span class="mrh-tracker-logo" aria-hidden="true">◈</span><div>'+
    '<span class="label-top">Material Request Hub / Procurement workspace</span>'+
    '<h2>Material Sourcing</h2><p>Procurement tracking &amp; material management</p></div></div></header>'+
   '<div class="mrh-add-canvas"><nav class="mrh-tracker-viewtabs" aria-label="Material Tracker views">'+
    '<button type="button" data-action="mrh-show-items">All items</button>'+
    (canCreate?'<span class="mrh-active-view" aria-current="page">Add Material</span>':'')+
    '</nav>'+renderMaterialSourcingAddMaterial(detail,{canCreate})+'</div></section>';
 }
 const displayed=row=>{
  const item=(detail.items||[]).find(i=>i.id===row.id);
  const source=row.source?'<span class="mrh-source '+row.source.toLowerCase()+'"><span aria-hidden="true">●</span> '+esc(row.source)+'</span>':'<span class="mrh-cell-missing">—</span>';
  const created=visibleDate(item?.created_at);
  return '<tr><td class="mrh-row-id"><button type="button" class="mrh-part-link" data-action="board-item-detail" data-id="'+esc(row.id)+'">'+esc(row.partNumber)+'</button></td>'+
   '<td class="mrh-date-cell">'+esc(created||'—')+'</td>'+
   '<td>'+source+'</td><td>'+esc(row.rfq||'—')+'</td>'+
   '<td>'+esc(row.description||'—')+'</td><td>'+esc(row.brand||'—')+'</td>'+
   '<td class="mrh-numeric">'+esc(row.quantity||'—')+'</td>'+
   '<td class="mrh-date-cell">'+esc(row.due||'—')+
   (row.overdue?' <span class="mrh-overdue-label">Overdue</span>':'')+'</td>'+
   '<td class="mrh-numeric">'+esc(row.lead||'—')+'</td></tr>';
 };
 return '<section class="mrh-tracker" aria-label="Material Sourcing application">'+
  '<header class="mrh-tracker-head"><div class="mrh-tracker-identity">'+
   '<span class="mrh-tracker-logo" aria-hidden="true">◈</span><div>'+
   '<span class="label-top">Material Request Hub / Procurement workspace</span>'+
   '<h2>Material Sourcing</h2><p>Procurement tracking &amp; material management</p></div></div>'+
   '<div class="mrh-head-tools"><span class="mrh-head-live"><span aria-hidden="true">●</span> Signed board data</span>'+
   '<button type="button" class="secondary" data-action="refresh-board" aria-label="Refresh Material Sourcing">↻ Refresh</button></div></header>'+
  '<div class="mrh-tracker-body">'+
   '<div class="mrh-section-heading"><span>Key metrics</span><small>Based on loaded authorized records</small></div>'+
   '<div class="mrh-tracker-stats" aria-label="Loaded materials summary">'+
    countCard('Total materials',nfmt(all.length),{icon:'▣',tone:'mrh-kpi-total',note:'Tracked part numbers'})+
    countCard('Local',nfmt(locals),{icon:'↗',tone:'mrh-kpi-local',note:'Locally sourced'})+
    countCard('Import',nfmt(imports),{icon:'◎',tone:'mrh-kpi-import',note:'Imported materials'})+
    countCard('Overdue',nfmt(overdue),{icon:'◷',tone:'mrh-kpi-overdue',note:'Past required date'})+
    countCard('Total buying', 'Restricted',{icon:'₱',tone:'mrh-kpi-protected',note:'Protected financial data'})+
    sourceBreakdown(locals,imports,unknown)+
   '</div>'+
   (!boardItemsComplete(detail)?'<p class="mrh-data-warning" role="status">Partial board page: displayed counts exclude records not yet loaded.</p>':'')+
   '<div class="mrh-tracker-ratebar"><span class="mrh-rate-icon" aria-hidden="true">⇄</span>'+
    '<span>Exchange rates &amp; landed costs</span><span class="mrh-rate-note">Available in authorized protected item details when configured</span></div>'+
   '<nav class="mrh-tracker-viewtabs" aria-label="Material Tracker views">'+
    '<span class="mrh-active-view" aria-current="page">All items</span>'+
    (canCreate?'<button type="button" data-action="mrh-add-view">＋ Add Material</button>':'')+
   '</nav>'+
   '<div class="mrh-table-panel">'+
    '<div class="mrh-tracker-controls"><label class="mrh-search-field">'+
     '<span aria-hidden="true" class="mrh-search-icon">⌕</span><span class="sr-only">Search materials</span>'+
     '<input type="search" id="mrh-tracker-search" placeholder="Search materials, part numbers, brands or RFQs…" maxlength="120" value="'+esc(filters.search||'')+'"></label>'+
    '<label class="mrh-source-filter"><span class="sr-only">Source Type</span><select id="mrh-tracker-source">'+
     [['all','All sources'],['Local','Local'],['Import','Import']].map(([value,label])=>
      '<option value="'+value+'"'+(filters.source===value?' selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
    '<label class="mrh-tracker-overdue"><input type="checkbox" id="mrh-tracker-overdue"'+(filters.overdue?' checked':'')+'>'+
     ' Overdue <span class="mrh-overdue-count">'+overdue+'</span></label>'+
    '<button type="button" class="mrh-export-csv" data-action="mrh-export-csv" title="Export only visible public material fields">⇩ Export CSV</button>'+
    '<span class="mrh-loaded-count" role="status" aria-live="polite">'+rows.length+' of '+all.length+' loaded</span></div>'+
    '<div class="mrh-tracker-table-scroll" role="region" aria-label="Horizontally scrollable materials table" tabindex="0">'+
     '<table class="mrh-tracker-table"><thead><tr>'+
       ['Part number','Created','Source Type','RFQ Ref No','Material description','Brand','Quantity','Date required','Lead (weeks)']
        .map(c=>'<th scope="col">'+c+'</th>').join('')+'</tr></thead>'+
      '<tbody><tr class="mrh-group-row"><th scope="rowgroup" colspan="9"><span class="mrh-group-glyph" aria-hidden="true">◇</span>'+
       '<span>Main group</span><span class="mrh-group-count">'+nfmt(all.length)+'</span></th></tr>'+
       (rows.length?rows.map(displayed).join(''):'<tr><td colspan="9" class="mrh-tracker-empty">No matching materials in the authorized board. No sample records are generated.</td></tr>')+
     '</tbody></table></div></div>'+
   '<p class="mrh-tracker-note">Group: Main group (unchanged). Financial and supplier fields require signed, item-scoped authorization.</p>'+
  '</div></section>';
}
