/**
 * Native CRM list: existing board identity and signed per-item commercial reads.
 * No storage, separate login, demo data, pricing fallback or write transport.
 * The Add Material form and Details/Tasks/Activity drawer remain CRM-owned.
 */
import {reconcileBoard,COMMERCIAL_FIELDS} from './reconcile.js';
import {materialTrackerRows,filterMaterialTrackerRows} from '../../material-sourcing-tracker.js';
import {readProtectedSourcingItem} from '../../material-sourcing-application.js';
import {renderMaterialSourcingAddMaterial} from '../../material-sourcing-add-material.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('en-PH').format(n);
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?
 new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'—';
const money=value=>typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat('en-PH',{minimumFractionDigits:2,maximumFractionDigits:8}).format(value):'—';
export const nativeColumns=Object.freeze([
 ['name','Part number','identity'],['created','Created','identity'],
 ['legacySelling','Selling price (VAT-ex, stored)','commercial'],['requestor','Requestor ID','commercial'],
 ['source','Source type','public'],['rfq','RFQ ref no','public'],['description','Description','public'],['brand','Brand','public'],
 ['vendor','Vendor','commercial'],['account','Account','commercial'],['supplierPo','Supplier PO','commercial'],
 ['quantity','Qty','public'],['buyingPrice','Buying price','commercial'],['currency','Currency','commercial'],
 ['php','PHP equiv','derived'],['usd','Ex. USD','commercial'],['eur','Ex. EUR','commercial'],
 ['shipping','Shipping','commercial'],['shipCurrency','Ship. cur','commercial'],['shipPhp','Ship. PHP/unit','derived'],
 ['landed','Landed cost','derived'],['totalLanded','Total landed','derived'],
 ['leadWeeks','Lead (wks)','public'],['requiredDate','Date required','public']
]);
const moneyKeys=new Set(['legacySelling','buyingPrice','shipping','usd','eur']);
function card(label,value,icon,note='',sourceFilter=null){
 const tag=sourceFilter?'button':'article';
 const attrs=sourceFilter?' type="button" data-action="mrh-native-source" data-source="'+escape(sourceFilter.source)+'" aria-pressed="'+sourceFilter.active+'"':'';
 return '<'+tag+' class="ms-native-metric"'+attrs+'><i aria-hidden="true">'+icon+'</i><div><small>'+escape(label)+'</small><strong>'+escape(value)+'</strong>'+(note?'<small>'+escape(note)+'</small>':'')+'</div></'+tag+'>';
}
function sourceDistribution(local,imported,unknown){
 const total=local+imported+unknown;
 const first=total?100*local/total:0;
 const second=total?100*imported/total:0;
 const arc=(tone,length,offset)=>'<circle class="ms-native-ring-'+tone+'" cx="50" cy="50" r="36" pathLength="100" stroke-dasharray="'+length+' '+(100-length)+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 50 50)"/>';
 return '<article class="ms-native-metric ms-native-distribution"><svg viewBox="0 0 100 100" role="img" aria-label="Materials by source, by record count: Local '+local+', Import '+imported+', Unspecified '+unknown+'"><circle class="ms-native-ring-base" cx="50" cy="50" r="36"/>'+
  (total?arc('local',first,0)+arc('import',second,first):'')+'</svg><div><small>Materials by source</small>'+
  [['local','Local',local],['import','Import',imported],['unknown','Unspecified',unknown]].map(([tone,label,count])=>'<div class="ms-native-legend"><span class="ms-native-dot-'+tone+'" aria-hidden="true">●</span> '+label+': <b>'+fmt(count)+'</b></div>').join('')+
  '<small>Record count, not cost</small></div></article>';
}
function publicCell(record,key){
 const value=record.publicValues[key];
 if(value?.state!=='present')return {display:'—',sort:'',title:value?.state==='unsupported'?'Historical value requires reconciliation':value?.state==='unavailable'?'Field unavailable':'Not recorded'};
 return {display:value.value,sort:value.value,title:'Stored board value'};
}
function rowMarkup(record,overdue){
 return '<tr data-ms-item="'+escape(record.id)+'">'+nativeColumns.map(([key,,kind])=>{
  if(key==='name')return '<td data-ms-col="name" data-ms-sort="'+escape(record.name)+'"><button type="button" class="mrh-part-link" data-action="board-item-detail" data-id="'+escape(record.id)+'">'+escape(record.name)+'</button><button type="button" class="ms-native-read" data-action="mrh-native-commercial" data-id="'+escape(record.id)+'" aria-label="Load commercial values for '+escape(record.name)+'">Load costs</button><span class="ms-native-row-status" data-ms-row-status role="status"></span></td>';
  if(key==='created')return '<td data-ms-col="created" data-ms-sort="'+escape(record.createdAt||'')+'">'+escape(date(record.createdAt))+'</td>';
  if(kind==='commercial')return '<td data-ms-col="'+key+'" data-ms-commercial="'+key+'" title="Use Load costs for this material">—</td>';
  if(kind==='derived')return '<td data-ms-col="'+key+'" title="Authoritative calculation not yet connected">—</td>';
  const value=publicCell(record,key);
  const body=key==='source'&&['Local','Import'].includes(value.display)?'<span class="mrh-source '+value.display.toLowerCase()+'">'+escape(value.display)+'</span>':escape(value.display);
  return '<td data-ms-col="'+key+'" data-ms-sort="'+escape(value.sort)+'" title="'+escape(value.title)+'">'+body+(key==='requiredDate'&&overdue?' <span class="mrh-overdue-label">Overdue</span>':'')+'</td>';
 }).join('')+'</tr>';
}
// Match the established CRM lazy native-style delivery pattern. The entry
// document retains its single deterministic stylesheet; only this route adds
// the scoped reference styles, once per document.
export function ensureNativeMaterialSourcingStyles(doc){
 const href=new URL('./native-screen.css?v=cp-ms-crm-03a-20261127',import.meta.url).href;
 const existing=Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).find(link=>link.href===href);
 if(existing)return existing;
 const link=doc.createElement('link');link.rel='stylesheet';link.href=href;doc.head.append(link);return link;
}
export function renderNativeMaterialSourcing(detail,filters={},now=new Date(),options={}){
 // The caller supplies the current signed workspace, never a URL or stored actor.
 let projection;
 try{projection=reconcileBoard(detail,{workspaceId:options.workspaceId});}
 catch{return '<section class="panel" role="alert">Material Sourcing board data is unavailable. Refresh the current workspace.</section>';}
 const adding=options.view==='add';
 const all=materialTrackerRows(detail,{today:now}),shown=filterMaterialTrackerRows(all,filters);
 const byId=new Map(projection.records.map(record=>[record.id,record]));
 const records=shown.map(row=>({record:byId.get(row.id),overdue:row.overdue})).filter(x=>x.record);
 const local=all.filter(row=>row.source==='Local').length,imported=all.filter(row=>row.source==='Import').length,unknown=all.length-local-imported;
 const heading=projection.itemsComplete?'Total items':'Loaded items';
 const filterOptions=[['all','All sources'],['Local','Local'],['Import','Import'],['Unknown','Unspecified']];
 const metricFilter=source=>adding?null:{source,active:filters.source===source};
 const headings=nativeColumns.map(([key,label,kind])=>'<th scope="col" data-ms-col="'+key+'">'+
 (kind==='identity'||kind==='public'?'<button type="button" data-action="mrh-native-sort" data-column="'+key+'" aria-label="Sort by '+escape(label)+'">'+escape(label)+' <span aria-hidden="true">↕</span></button>':escape(label))+'</th>').join('');
 return '<section class="mrh-tracker ms-native-sourcing" aria-label="Material Sourcing application">'+
 '<header class="ms-native-header"><div class="ms-native-brand"><span class="ms-native-logo" aria-hidden="true">◈</span><div><h2>Material Sourcing</h2><p>Procurement tracking &amp; material management</p></div></div>'+
 '<div class="ms-native-header-actions"><span class="ms-native-tag">CRM · Signed board data</span>'+
 (adding?'':'<button type="button" class="secondary" data-action="refresh-board" aria-label="Refresh Material Sourcing">↻ Refresh</button>')+'</div></header>'+
 '<div class="ms-native-body"><details class="ms-native-metrics-panel" open><summary>Key metrics</summary><div class="ms-native-metrics">'+
 card(heading,fmt(all.length),'◇')+card('Total buying','—','₱','Calculation pending')+card('Local',fmt(local),'⌖','',metricFilter('Local'))+card('Import',fmt(imported),'◎','',metricFilter('Import'))+
 card('USD rate','—','$','No current snapshot')+card('EUR rate','—','€','No current snapshot')+
 sourceDistribution(local,imported,unknown)+'</div></details>'+
 '<div class="ms-native-rates"><span>⇄ Exchange rates</span><span class="ms-native-tag">USD —</span><span class="ms-native-tag">EUR —</span><small>Stored per-item rates are available through signed reads. No current FX snapshot.</small></div>'+
 (!projection.itemsComplete?'<p class="mrh-data-warning" role="status">Partial board page: counts, filters and exports apply to loaded records only.</p>':'')+
 (projection.deferred.length?'<p class="mrh-data-warning" role="status">Other-group or archived records are outside the current sourcing projection; their identities remain unchanged.</p>':'')+
 (projection.missingPublicFields.length?'<p class="mrh-data-warning" role="status">Some sourcing fields are not available in this board projection.</p>':'')+
 '<nav class="ms-native-tabs mrh-tracker-viewtabs" aria-label="Material Tracker views">'+
 (adding?'<button type="button" data-action="mrh-show-items">All items</button><span class="mrh-active-view" aria-current="page">Add Material</span>':'<span class="mrh-active-view" aria-current="page">All items</span><button type="button" data-action="mrh-add-view">＋ Add Material</button>')+
 '<button type="button" disabled title="Requires the extended MRH transaction contract">Bulk Import</button></nav>'+
 (adding?'<div class="mrh-add-app ms-native-add"><div class="mrh-add-canvas">'+renderMaterialSourcingAddMaterial(detail,{canCreate:options.canCreate===true})+'</div></div>':
 '<div class="ms-native-surface"><div class="mrh-tracker-controls">'+
 '<label class="mrh-search-field"><span class="sr-only">Search materials</span><input type="search" id="mrh-tracker-search" placeholder="Search materials, part numbers, brands or RFQs…" maxlength="120" value="'+escape(filters.search||'')+'"></label>'+
 '<label class="mrh-source-filter"><span class="sr-only">Source Type</span><select id="mrh-tracker-source">'+filterOptions.map(([value,label])=>'<option value="'+value+'"'+((filters.source||'all')===value?' selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
 '<label class="mrh-tracker-overdue"><input type="checkbox" id="mrh-tracker-overdue"'+(filters.overdue?' checked':'')+'> Overdue</label>'+
 '<button type="button" class="mrh-export-csv" data-action="mrh-export-csv" title="Export only loaded public fields">⇩ Export CSV</button><span class="mrh-loaded-count" role="status">'+records.length+' of '+all.length+' loaded</span></div>'+
 '<div class="ms-native-table-scroll mrh-tracker-table-scroll" role="region" aria-label="Horizontally scrollable materials table" tabindex="0"><table class="ms-native-table mrh-tracker-table"><thead><tr>'+headings+'</tr></thead><tbody>'+
 '<tr class="mrh-group-row"><th scope="rowgroup" colspan="'+nativeColumns.length+'">◇ '+escape(projection.records[0]?.group||'Main group')+' <span class="mrh-group-count">'+fmt(all.length)+'</span></th></tr>'+
 (records.length?records.map(({record,overdue})=>rowMarkup(record,overdue)).join(''):'<tr><td colspan="'+nativeColumns.length+'">No matching materials in the authorized board.</td></tr>')+'</tbody></table></div></div>')+
 '<p class="ms-native-note">Main group is preserved. Load costs reads only the selected item through the existing signed contract. Stored selling prices are historical values; calculated totals, full reports and bulk import require the extended backend. Commercial values are not included in public CSV.</p></div></section>';
}
/** DOM-only sorting of loaded public fields; no write, storage, or commercial sorting. */
export function sortNativeMaterials(button){
 const table=button.closest('table.ms-native-table'),key=button.dataset.column;
 if(!table||!nativeColumns.some(([k,,kind])=>k===key&&(kind==='public'||kind==='identity')))return false;
 const head=button.closest('th'),asc=head.getAttribute('aria-sort')!=='ascending';
 for(const th of table.querySelectorAll('th[aria-sort]'))th.removeAttribute('aria-sort');
 head.setAttribute('aria-sort',asc?'ascending':'descending');
 const rows=[...table.querySelectorAll('tbody tr[data-ms-item]')],collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
 const val=row=>row.querySelector('[data-ms-col="'+key+'"]')?.dataset.msSort||'';
 rows.sort((a,b)=>{
  const x=val(a),y=val(b);
  if(!x||!y)return x? -1:y?1:0;
  const cmp=['quantity','leadWeeks'].includes(key)?Number(x)-Number(y):collator.compare(x,y);
  return asc?cmp:-cmp;
 });
 const tbody=table.tBodies[0];for(const row of rows)tbody.append(row);
 return true;
}
/** Explicit signed single-item request. Never cache or persist commercial values. */
export async function loadNativeCommercialRow(button,{api,auth,workspaceId,boardId,isCurrent}){
 const row=button.closest('tr[data-ms-item]'),itemId=button.dataset.id;
 if(!row||row.dataset.msItem!==itemId||button.disabled||!isCurrent())return false;
 const status=row.querySelector('[data-ms-row-status]');
 const current=()=>row.isConnected&&button.isConnected&&isCurrent();
 const clear=()=>{for(const cell of row.querySelectorAll('[data-ms-commercial]')){cell.textContent='—';cell.title='Use Load costs for this material';}};
 clear();button.disabled=true;status.textContent='Loading…';
 try{
  const cells=await readProtectedSourcingItem({api,auth,workspaceId,boardId,itemId});
  if(!current())return false;
  for(const cell of row.querySelectorAll('[data-ms-commercial]')){
   const key=cell.dataset.msCommercial,value=cells[COMMERCIAL_FIELDS[key]]?.value;
   cell.textContent=value===undefined?'—':moneyKeys.has(key)?money(value):String(value);
   cell.title=value===undefined?'Not recorded':'Stored signed value; not a calculated total';
  }
  status.textContent=Object.keys(cells).length?'Stored values loaded':'Signed read verified; no stored commercial values.';
  button.textContent='Reload costs';return true;
 }catch{
  if(current()){clear();status.textContent='Commercial values unavailable. Retry.';}
  return false;
 }finally{if(current())button.disabled=false;}
}
