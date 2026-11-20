/** Monday-style collapsed group summaries.
 * Pure, authorized presentation over records already returned by signed board reads.
 * Never infer whole-group totals or field aggregates from an incomplete page.
 */
import {normalizeLayout} from './presentation.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
}[c]));
const numeric=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const COLOR={
 done:'#42B77A',completed:'#42B77A',blocked:'#F07C80',
 stuck:'#F07C80',hold:'#E9C343',in_progress:'#E3BC43',
 working:'#E3BC43',planned:'#8A95AD',new:'#8A95AD'
};
const statusColor=value=>{
 const key=String(value||'').trim().toLowerCase().replace(/[\s-]+/g,'_');
 return COLOR[key]||'#8B95AC';
};
function getValue(detail,item,key,lookup){
 if(key==='record'||key==='actions')return null;
 if(key==='status')return item.status??null;
 if(key==='owner')return item.assignee_id??null;
 if(key==='due')return item.due_date??null;
 if(key.startsWith('col:'))return lookup.get(item.id+':'+key.slice(4))??null;
 return null;
}
function columnType(detail,key){
 if(key==='status')return 'status';
 if(key==='owner')return 'people';
 if(key==='due')return 'date';
 if(!key.startsWith('col:'))return null;
 return (detail?.columns||[]).find(c=>c.id===key.slice(4))?.data_type||null;
}
function statusBar(values){
 const entries=[...new Map(values.map(v=>[String(v??'—'),0])).keys()]
  .map(value=>({value,count:values.filter(v=>String(v??'—')===value).length}))
  .filter(row=>row.count>0);
 if(!entries.length)return '<span class="board-rollup-empty" aria-label="No status values"></span>';
 const total=values.length;
 let left=0;
 const svg=entries.map(({value,count},index)=>{
  const last=index===entries.length-1;
  const width=last?100-left:Math.round(count/total*1000)/10;
  const result='<rect x="'+left+'" y="0" width="'+width+'" height="8" fill="'+statusColor(value)+'"></rect>';
  left+=width;
  return result;
 }).join('');
 const label=entries.map(({value,count})=>value+': '+count).join(', ');
 return '<span class="board-rollup-status" title="'+escape(label)+'">'+
  '<svg viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label="'+escape(label)+'">'+svg+'</svg></span>';
}
function avatarStack(values,detail){
 const ids=[...new Set(values.map(x=>String(x||'')).filter(Boolean))];
 if(!ids.length)return '';
 const shown=ids.slice(0,3).map(id=>{
  const person=(detail?.members||[]).find(m=>String(m.user_id||m.id)===id);
  const name=String(person?.display_name||person?.email||'Assigned user');
  const initials=name.split(/[\s@]+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  return '<span class="board-rollup-avatar" title="'+escape(name)+'" aria-label="'+escape(name)+'">'+
   escape(initials||'•')+'</span>';
 }).join('');
 return '<span class="board-rollup-people">'+shown+
  (ids.length>3?'<span class="board-rollup-more">+'+(ids.length-3)+'</span>':'')+'</span>';
}
export function boardGroupRollupCells({detail,items,columns,layout,complete=false}={}){
 const colLookup=new Map(columns.map(c=>[c.key,c]));
 const pref=normalizeLayout(layout||{},[],columns.map(c=>c.key));
 const keys=pref.columns.filter(k=>!pref.hidden.includes(k));
 const values=new Map((detail?.values||[]).map(v=>[v.item_id+':'+v.column_id,v.value]));
 const summary={};
 for(const key of keys){
  summary[key]='';
  if(key==='record'||key==='actions'||!complete)continue;
  const type=columnType(detail,key);
  if(!['status','rating','timeline','number','people'].includes(type))continue;
  const entries=items.map(i=>getValue(detail,i,key,values)).filter(v=>v!==null&&v!==undefined&&v!=='');
  if(type==='status'){summary[key]=statusBar(entries);continue;}
  if(type==='people'){summary[key]=avatarStack(entries,detail);continue;}
  if(type==='number'){
   const nums=entries.map(numeric).filter(v=>v!==null);
   summary[key]=nums.length?'<strong class="board-rollup-number">'+
    escape(nums.reduce((a,b)=>a+b,0).toLocaleString('en-US',{maximumFractionDigits:10}))+'</strong>':'';
   continue;
  }
  if(type==='rating'){
   const nums=entries.map(numeric).filter(v=>v!==null);
   const def=(detail?.columns||[]).find(x=>'col:'+x.id===key);
   const max=Number(def?.config?.max||def?.config?.max_rating||5);
   const bounded=Number.isSafeInteger(max)&&max>=3&&max<=10?max:5;
   summary[key]='<span class="board-rollup-rating">'+
    escape(nums.length?(nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(1):'0')+
    ' / '+bounded+'</span>';
   continue;
  }
  if(type==='timeline'){
   const ranges=entries.filter(v=>v&&typeof v==='object'&&v.start&&v.end);
   if(ranges.length){
    const starts=ranges.map(v=>v.start).sort(),ends=ranges.map(v=>v.end).sort();
    summary[key]='<span class="board-rollup-range">'+escape(starts[0])+' – '+escape(ends.at(-1))+'</span>';
   }
  }
 }
 return {keys,widths:pref.widths,summary,total:keys.reduce((n,k)=>n+pref.widths[k],0)};
}
export function renderBoardCollapsedRollup({detail,items,columns,layout,complete=false,groupId=''}={}){
 const {keys,widths,summary,total}=boardGroupRollupCells({detail,items,columns,layout,complete});
 return '<div class="board-collapsed-rollup-scroll" aria-label="Collapsed group rollups" data-rollup-group="'+escape(groupId)+'">'+
  '<table class="board-collapsed-rollup-table" data-group-id="'+escape(groupId)+'" width="'+total+'">'+
  '<colgroup>'+keys.map(k=>'<col data-column-key="'+escape(k)+'" width="'+widths[k]+'">').join('')+'</colgroup>'+
  '<tbody><tr>'+keys.map(k=>'<td data-rollup-column="'+escape(k)+'"'+
    (k==='record'?' class="board-frozen-column"':'')+'>'+
    (complete?summary[k]:(k==='record'?'':'<span class="board-rollup-loading" title="Load remaining items for a complete summary"></span>'))+
    '</td>').join('')+'</tr></tbody></table></div>';
}
