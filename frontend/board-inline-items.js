/** CP-BOARD-ROW01: shared board footer and typed inline cell controls.
 * Manual writes are limited to ordinary signed boards; domain-owned boards
 * must be populated via their own authoritative application workflow.
 */
import {ApiError} from './session.js';
import {isProtectedBoard} from './board-card-lifecycle.js';
import {moduleByBoardName} from './board-manifest.js';
import {validUuid} from './data.js';
import {cmp02Validate,cmp02VisibleValue,cmp02RatingMax,
 cmp02PercentageDecimals} from './board-typed-cmp02.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,
 c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TYPES=new Set(['text','long_text','number','date','status','dropdown',
 'people','checkbox','email','url','timeline','phone','rating','percentage']);
const builtInKeys=new Set(['status','assignee','due_date','notes']);
export function canManuallyEditBoard(board,canEdit=false){
 return !!canEdit&&validUuid(board?.id)&&validUuid(board?.workspace_id)&&
  board.status==='active'&&!isProtectedBoard(board)&&
  !moduleByBoardName(board.name);
}
export function genericBoardColumns(detail,{primaryTitle='Record',columnLabels={},minimal=false,hiddenVirtual=[]}={}){
 const cols=Array.isArray(detail?.columns)?detail.columns:[];
 const hidden=new Set(Array.isArray(hiddenVirtual)?hiddenVirtual:[]);
 const base=minimal?[{key:'record',title:primaryTitle}]:
  [{key:'record',title:primaryTitle},{key:'status',title:'Status'},
   {key:'owner',title:'Owner'},{key:'due',title:'Due date'}]
    .filter(c=>c.key==='record'||!hidden.has(c.key));
 const custom=cols.filter(c=>validUuid(c.id)&&c.visible!==false&&
  !c.system_key&&TYPES.has(c.data_type)).sort((a,b)=>a.position-b.position);
 return [...base,...custom.map(c=>({key:'col:'+c.id,title:columnLabels[c.id]||c.name})),
  ...(minimal||hidden.has('actions')?[]:[{key:'actions',title:'Actions'}])];
}
export function cellColumn(detail,key){
 const cols=Array.isArray(detail?.columns)?detail.columns:[];
 if(key==='record')return {id:null,name:'Record',data_type:'text',system_key:'title',required:true,config:{}};
 if(key.startsWith('col:')){
  const c=cols.find(col=>col.id===key.slice(4)&&col.system_key==null&&
   col.visible!==false&&TYPES.has(col.data_type));
  return c||null;
 }
 const system={status:'status',owner:'assignee',due:'due_date'}[key];
 if(!system)return null;
 const real=cols.find(c=>c.system_key===system&&
  c.visible!==false&&TYPES.has(c.data_type))||null;
 if(real)return real;
 // Standard ordinary boards can lack a physical status column. Their signed,
 // revision-guarded status edits use CP-BOARD-BULK02, never the title CAS path.
 if(key==='status')return {id:null,name:'Status',data_type:'status',virtual:true,
  system_key:'status',required:true,config:{labels:[
   {id:'not_started',label:'Not started'},
   {id:'in_progress',label:'In progress'},
   {id:'blocked',label:'Blocked'},
   {id:'done',label:'Done'}]}};
 return null;
}
export function expectedCellValue(detail,item,key){
 if(key==='record')return item.title;
 if(key==='status')return item.status??null;
 if(key==='owner')return item.assignee_id??null;
 if(key==='due')return item.due_date??null;
 if(key.startsWith('col:')){
  const found=(detail?.values||[]).find(v=>v.item_id===item.id&&v.column_id===key.slice(4));
  return found?.value??null;
 }
 return null;
}
/** The saved value is the stable option ID; render the current configured label. */
export function configuredStatus(value,config={}){
 const id=String(value??'');
 const labels=Array.isArray(config?.labels)?config.labels:[];
 const option=labels.find(o=>o&&typeof o==='object'&&String(o.id)===id);
 const name=option&&[option.label,option.title,option.name]
  .find(x=>typeof x==='string'&&x.trim().length>0);
 const color=typeof option?.color==='string'&&/^#[0-9a-f]{6}$/i.test(option.color)?
  option.color:null;
 return {label:name||id||'—',color};
}
/** CSP-safe rendering of the known configured board palette; never interpolate CSS. */
export function statusColorClass(color){
 const safe=typeof color==='string'?color.toLowerCase():'';
 return ({
  '#7f8a9a':'board-status-color-muted',
  '#4f7df3':'board-status-color-blue',
  '#e64f70':'board-status-color-rose',
  '#22c55e':'board-status-color-green',
  '#23b784':'board-status-color-tealgreen',
  '#f59e0b':'board-status-color-amber',
  '#d9a227':'board-status-color-gold',
  '#ef4444':'board-status-color-red',
  '#8b5cf6':'board-status-color-purple',
  '#6d5bd0':'board-status-color-indigo',
  '#2a9bb8':'board-status-color-cyan',
  '#d54a9c':'board-status-color-pink'
 })[safe]||'board-status-color-neutral';
}
export function visibleValue(value,type,config={}){
 if(value==null||value==='')return '—';
 if(type==='status')return configuredStatus(value,config).label;
 if(type==='checkbox')return value===true?'Yes':'No';
 if(['phone','rating','percentage'].includes(type))
  return cmp02VisibleValue(value,type,config);
 if(type==='timeline'&&typeof value==='object')
  return [value.start,value.end].filter(Boolean).join(' → ')||'—';
 if(typeof value==='object')return '—';
 return String(value);
}
export function editableCellButton({key,item,detail,writable,editing=false,cellContent}){
 const col=cellColumn(detail,key);
 if(!writable||!col||editing)return cellContent;
 return '<button type="button" class="board-inline-cell-trigger'+
  (col.data_type==='status'?' board-full-status-trigger':'')+'" data-action="inline-cell-start" '+
  'data-item-id="'+esc(item.id)+'" data-column-key="'+esc(key)+'" '+
  'aria-label="Edit '+esc(col.name||key)+' for '+esc(item.title)+'">'+cellContent+
  '<span class="board-inline-pencil" aria-hidden="true"> ✎</span></button>';
}
function optionsOf(col,members=[]){
 if(col.data_type==='people')return members
  .filter(m=>validUuid(m.user_id)).map(m=>({id:m.user_id,label:m.display_name||m.email||'Member'}));
 if(col.data_type==='status')return Array.isArray(col.config?.labels)?
  col.config.labels.filter(o=>o?.active!==false).map(o=>({
   id:String(o.id),label:String(o.label||o.title||o.name||o.id)})):[];
 if(col.data_type==='dropdown')return Array.isArray(col.config?.options)?
  col.config.options.filter(o=>typeof o==='string').map(o=>({id:o,label:o})):[];
 return [];
}
function validCalendarDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [year,month,day]=value.split('-').map(Number);
 if(year<1||month<1||month>12||day<1)return false;
 const leap=year%4===0&&(year%100!==0||year%400===0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 return day<=days[month-1];
}
export function inputForColumn(col,value,members=[]){
 if(!col||!TYPES.has(col.data_type))throw new ApiError('Unsupported inline column type.',400);
 const type=col.data_type,required=col.required?' required':'';
 if(['status','dropdown','people'].includes(type)){
  const options=optionsOf(col,members);
  return '<select name="value" aria-label="'+esc(col.name)+'"'+required+'>'+
    '<option value="">—</option>'+options.map(o=>'<option value="'+esc(o.id)+'"'+
    (o.id===String(value??'')?' selected':'')+'>'+esc(o.label)+'</option>').join('')+'</select>';
 }
 if(type==='rating'){
  const max=cmp02RatingMax(col.config);
  return '<select name="value" aria-label="'+esc(col.name)+'"'+required+'>'+
   '<option value="">—</option>'+
   Array.from({length:max},(_,i)=>'<option value="'+(i+1)+'"'+
    (Number(value)===i+1?' selected':'')+'>'+(i+1)+' / '+max+'</option>').join('')+
   '</select>';
 }
 if(type==='checkbox')return '<label class="board-inline-boolean"><input type="checkbox" name="value"'+
   (value===true?' checked':'')+' /> Yes</label>';
 if(type==='timeline')return '<div class="board-inline-range">'+
  '<label>Start <input type="date" name="start" value="'+esc(value?.start||'')+'"'+required+' /></label>'+
  '<label>End <input type="date" name="end" value="'+esc(value?.end||'')+'"'+required+' /></label></div>';
 if(type==='long_text')return '<textarea name="value" maxlength="5000" rows="2" aria-label="'+esc(col.name)+'"'+
  required+'>'+esc(value??'')+'</textarea>';
 const inputType={number:'number',date:'date',email:'email',url:'url',
  phone:'tel',percentage:'number'}[type]||'text';
 const max={text:1000,email:320,url:2000,phone:16}[type];
 const step=type==='number'?' step="any"':
  type==='percentage'?' min="0" max="100" step="'+
   (10**(-cmp02PercentageDecimals(col.config)))+'"':'';
 return '<input type="'+inputType+'" name="value"'+(max?' maxlength="'+max+'"':'')+
   step+' aria-label="'+esc(col.name)+'" '+
   'value="'+esc(value??'')+'"'+required+' />';
}
export function parseCellForm(col,formData){
 if(!col)throw new ApiError('Column no longer exists.',409);
 const type=col.data_type;
 if(type==='checkbox')return formData.get('value')==='on';
 if(type==='timeline'){
  const start=String(formData.get('start')||''),end=String(formData.get('end')||'');
  if(!start&&!end&&!col.required)return null;
  if(!validCalendarDate(start)||!validCalendarDate(end)||
    end<start)throw new ApiError('Choose a valid timeline with end after start.',400);
  return {start,end};
 }
 const raw=String(formData.get('value')??'').trim();
 if(!raw){
  if(col.required||col.system_key==='title')throw new ApiError('A required field cannot be empty.',400);
  return null;
 }
 if(['phone','rating','percentage'].includes(type)){
  try{return cmp02Validate(type,raw,col.config);}
  catch(error){throw new ApiError(error.message,400);}
 }
 if(type==='number'){
  const n=Number(raw);
  if(!Number.isFinite(n))throw new ApiError('Enter a finite number.',400);
  return n;
 }
 if(type==='date'){
  if(!validCalendarDate(raw))
   throw new ApiError('Enter a valid date.',400);
 }
 if(type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))
  throw new ApiError('Enter a valid email address.',400);
 if(type==='url'&&!/^https?:\/\/[^\s]+$/i.test(raw))
  throw new ApiError('Enter a valid HTTP(S) URL.',400);
 const max=col.system_key==='title'?240:type==='long_text'?5000:type==='email'?320:
  type==='url'?2000:1000;
 if(raw.length>max)throw new ApiError('Value exceeds the permitted length.',400);
 if(['status','dropdown','people'].includes(type)){
  if(!optionsOf(col,[]).some(o=>o.id===raw)&&type!=='people')
   throw new ApiError('Select a supported option.',400);
  if(type==='people'&&!validUuid(raw))throw new ApiError('Choose a board member.',400);
 }
 return raw;
}
export function renderInlineCellEditor({item,key,detail,members=[]}){
 const col=cellColumn(detail,key);
 if(!col)return '';
 return '<form class="board-inline-cell-form" data-inline-cell-form="'+esc(item.id)+'" '+
  'data-column-key="'+esc(key)+'" aria-label="Edit '+esc(col.name||key)+'">'+
  inputForColumn(col,expectedCellValue(detail,item,key),members)+
  '<div class="board-inline-controls"><button type="submit" class="primary">Save</button>'+
  '<button type="button" class="secondary" data-action="inline-cell-cancel">Cancel</button></div></form>';
}
export function renderGroupAddRow({groupId,enabled=false,busy=false,domain=false}={}){
 if(!enabled)return ''; // Do not surface implementation details on protected boards.
 return '<form class="board-inline-add-form" data-inline-add-row="'+esc(groupId)+'">'+
  '<label class="sr-only" for="board-add-'+esc(groupId)+'">New item name</label>'+
  '<span aria-hidden="true" class="board-inline-add-icon">＋</span>'+
  '<input id="board-add-'+esc(groupId)+'" name="title" maxlength="240" required '+
   'placeholder="+ Add item" aria-label="Add item to this group" autocomplete="off"'+(busy?' disabled':'')+' />'+
  '<button class="board-inline-add-submit" type="submit"'+(busy?' disabled':'')+'>Add item</button></form>';
}
export function groupColumnSummaries({items=[],columns=[],detail}={}){
 const cells={record:items.length+' item'+(items.length===1?'':'s')};
 const active=items.filter(x=>!x.archived_at);
 const statuses=new Map();
 for(const item of active)if(item.status)statuses.set(item.status,(statuses.get(item.status)||0)+1);
 const statusParts=[...statuses].sort((a,b)=>b[1]-a[1]);
 cells.status=statusParts.length?statusParts.slice(0,2).map(([s,n])=>n+' '+s).join(' · '):'—';
 cells.owner=new Set(active.map(x=>x.assignee_id).filter(Boolean)).size+' assigned';
 const dates=active.map(x=>x.due_date).filter(Boolean).sort();
 cells.due=dates.length?'Next '+dates[0]:'—';
 const lookup=new Map((detail?.values||[]).map(v=>[v.item_id+':'+v.column_id,v.value]));
 for(const c of columns.filter(c=>c.key?.startsWith('col:'))){
  const id=c.key.slice(4),col=(detail?.columns||[]).find(x=>x.id===id);
  if(!col)continue;
  const vals=active.map(x=>lookup.get(x.id+':'+id)).filter(v=>v!=null);
  if(col.data_type==='number'){
   const nums=vals.filter(x=>typeof x==='number'&&Number.isFinite(x));
   cells[c.key]=nums.length?'Σ '+Number(nums.reduce((a,b)=>a+b,0).toFixed(2)):'—';
  }else if(col.data_type==='checkbox')cells[c.key]=vals.filter(v=>v===true).length+' checked';
  else cells[c.key]=vals.length+' filled';
 }
 return cells;
}
