/** Dynamic presentation of persisted board rows and typed cell values.
 * Never generate dummy rows. For dedicated module boards, render only blueprint-approved columns.
 */
import {moduleByBoardName} from './board-manifest.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function boardGrid(detail,{groupId=null}={}){
 const items=Array.isArray(detail?.items)?detail.items:[];
 const allColumns=Array.isArray(detail?.columns)?detail.columns:[];
 const allValues=Array.isArray(detail?.values)?detail.values:[];
 const module=moduleByBoardName(detail?.board?.name);
 const allowed=module?new Set(module.fields.map(f=>f.name)):null;
 const cols=allColumns.filter(c=>c.visible!==false && c.system_key==null &&(!allowed||allowed.has(c.name)));
 const displayed=groupId?items.filter(i=>i.group_id===groupId):items;
 const lookup=new Map(allValues.map(v=>[v.item_id+':'+v.column_id,v.value]));
 let html='<div class="panel"><div class="table-scroll"><table class="board-table"><thead><tr><th>Record</th><th>Status</th>';
 for(const col of cols)html+='<th>'+escape(col.name)+'</th>';
 html+='</tr></thead><tbody>';
 for(const item of displayed){
  html+='<tr data-searchable="'+escape((item.title||'').toLowerCase())+'"><td>'+escape(item.title)+'</td><td>'+
   '<span class="status">'+escape(item.status??'—')+'</span></td>';
  for(const col of cols){
   const value=lookup.get(item.id+':'+col.id);
   const shown=value===null||value===undefined?'—':
     typeof value==='boolean'?(value?'Yes':'No'):
     typeof value==='number'?String(value):
     typeof value==='string'?value:
     typeof value==='object'&&value&&value.start&&value.end?value.start+' – '+value.end:'—';
   html+='<td>'+escape(shown)+'</td>';
  }
  html+='</tr>';
 }
 html+=displayed.length?'':'<tr><td class="csp-u063" colspan="'+(cols.length+2)+'" >No persisted records in this board group</td></tr>';
 html+='</tbody></table></div></div>';
 if(module)html+='<p class="muted csp-u025" >Operational records will appear here only when the corresponding APSYNTRA domain module writes and reconciles them through the authorized backend. Restricted fields are not displayed.</p>';
 return html;
}
