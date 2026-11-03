/** CP-BOARD-CONFIG01 — server-authoritative board structure and view preparation.
 * The production feature remains disabled pending independent SQL activation review.
 */
import {ApiError} from './session.js';
import {validUuid} from './data.js';

export const BOARD_STRUCTURE_ADMIN_ENABLED=false;
export const BOARD_STRUCTURE_TYPES=Object.freeze([
 'text','long_text','number','status','dropdown','date','people',
 'checkbox','url','email','timeline'
]);
const TYPES=new Set(BOARD_STRUCTURE_TYPES);
const TAB_KEYS=new Set(['items','issues','finance','attendance']);
const esc=value=>String(value??'').replace(/[&<>"']/g,
 c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fail=message=>{throw new ApiError(message,400);};
const nameOf=value=>typeof value==='string'?value.trim():'';
const validName=(value,max=80)=>{
 const name=nameOf(value);
 if(name.length<1||name.length>max)fail('Name must contain 1–'+max+' characters.');
 return name;
};
const boardId=value=>{if(!validUuid(value))fail('Invalid board identifier.');return value;};
const hasManage=async(api,id)=>{
 if(typeof api?.rpc!=='function'||typeof api?.allowed!=='function')
  throw new ApiError('Signed board API unavailable.',403);
 if(await api.allowed(id,'manage')!==true)
  throw new ApiError('Board structure management is not permitted.',403);
};
const isCustomKey=key=>typeof key==='string'&&
 (key.startsWith('custom:')||key.startsWith('custom_'));

export function describeBoardColumns(detail){
 const columns=Array.isArray(detail?.columns)?detail.columns:[];
 return [
  {id:null,key:'record',name:'Record',kind:'primary',deletable:false,
   type:'text',immutable:true},
  ...columns.filter(col=>validUuid(col.id)).map(col=>{
   const custom=col.system_key==null&&isCustomKey(col.column_key);
   return {id:col.id,key:'col:'+col.id,name:String(col.name||'Column'),
    kind:custom?'custom':'domain',deletable:custom,
    immutable:!custom,type:String(col.data_type||'text'),
    visible:col.visible!==false,config:col.config||{}};
  })
 ];
}
export function normalizeBoardUi(raw,boardIdValue){
 if(!raw||typeof raw!=='object'||raw.board_id!==boardId(boardIdValue)||
  !Number.isSafeInteger(Number(raw.revision))||Number(raw.revision)<0)
  throw new ApiError('Invalid board display settings response.');
 const label=validName(raw.primary_label);
 const tabs=raw.tabs;
 if(!Array.isArray(tabs)||tabs.length>4||!tabs.every(t=>t&&typeof t==='object'&&
   TAB_KEYS.has(t.key)&&typeof t.label==='string'&&t.label.trim().length>0&&
   t.label.trim().length<=60&&typeof t.visible==='boolean')||
   new Set(tabs.map(t=>t.key)).size!==tabs.length)
  throw new ApiError('Invalid board view settings response.');
 if(!raw.column_labels||typeof raw.column_labels!=='object'||Array.isArray(raw.column_labels)||
   Object.keys(raw.column_labels).length>30||
   Object.entries(raw.column_labels).some(([id,label])=>!validUuid(id)||
    typeof label!=='string'||!label.trim()||label.trim().length>80))
  throw new ApiError('Invalid column display settings response.');
 return {status:'VERIFIED_READ',boardId:boardIdValue,revision:Number(raw.revision),
  primaryLabel:label,tabs:tabs.map(t=>({key:t.key,label:t.label.trim(),visible:t.visible})),
  columnLabels:Object.fromEntries(Object.entries(raw.column_labels).map(([k,v])=>[k,v.trim()]))};
}
export function applyBoardViewSettings(available,settings){
 if(settings?.status!=='VERIFIED_READ')return [...available];
 const original=new Map(available.map(t=>[t.key,t]));
 const result=[],seen=new Set();
 for(const entry of settings.tabs){
  const tab=original.get(entry.key);
  if(!tab||seen.has(entry.key))continue;
  seen.add(entry.key);
  if(entry.key==='items'||entry.visible){
   const counts=tab.key==='items'||tab.key==='issues'?
    tab.label.match(/<span[^>]*>\([^<]*<\/span>/)?.[0]||'':'';
   result.push({...tab,label:esc(entry.label)+counts});
  }
 }
 // Newly introduced application tabs retain existing defaults.
 for(const tab of available)if(!seen.has(tab.key))result.push(tab);
 if(!result.some(t=>t.key==='items'))result.unshift(original.get('items'));
 return result.filter(Boolean);
}
export function displayColumnLabel(settings,column){
 if(column?.key==='record')return settings?.status==='VERIFIED_READ'?
  settings.primaryLabel:'Record';
 const label=settings?.status==='VERIFIED_READ'&&validUuid(column?.id)?
  settings.columnLabels?.[column.id]:null;
 return typeof label==='string'&&label.trim()?label:column?.name||'Column';
}
export class BoardStructureClient{
 constructor(api){this.api=api;}
 async read(id,{enabled=BOARD_STRUCTURE_ADMIN_ENABLED}={}){
  boardId(id);
  if(enabled!==true)return {status:'LOCKED',revision:0,
   primaryLabel:'Record',tabs:[],columnLabels:{}};
  if(typeof this.api?.rpc!=='function')
   throw new ApiError('Signed board configuration API unavailable.',403);
  const raw=await this.api.rpc('wm_board_ui_read',{p_board_id:id});
  return normalizeBoardUi(raw,id);
 }
 async save(detail,settings,{enabled=BOARD_STRUCTURE_ADMIN_ENABLED}={}){
  const id=boardId(detail?.board?.id);
  if(enabled!==true)throw new ApiError('Board configuration activation is pending.',403);
  await hasManage(this.api,id);
  if(settings?.status!=='VERIFIED_READ'||settings.boardId!==id||
   !Number.isSafeInteger(settings.revision)||settings.revision<0)
   fail('Stale or invalid configuration revision.');
  const primary=validName(settings.primaryLabel);
  const tabs=settings.tabs;
  if(!Array.isArray(tabs)||tabs.length<1||tabs.length>4||
    !tabs.some(t=>t?.key==='items'&&t.visible===true)||
    new Set(tabs.map(t=>t.key)).size!==tabs.length||
    tabs.some(t=>!TAB_KEYS.has(t?.key)||typeof t.visible!=='boolean'||
      !nameOf(t.label)||nameOf(t.label).length>60))
   fail('Invalid board view configuration.');
  const allowedIds=new Set((detail.columns||[]).map(c=>c.id));
  const labels=settings.columnLabels||{};
  if(Object.entries(labels).some(([id,label])=>!allowedIds.has(id)||
    !validUuid(id)||!nameOf(label)||nameOf(label).length>80))
   fail('Foreign or invalid column label.');
  const response=await this.api.rpc('wm_board_ui_save',{
   p_board_id:id,p_expected_revision:settings.revision,
   p_primary_label:primary,p_tabs:tabs,p_column_labels:labels
  });
  return normalizeBoardUi(response,id);
 }
 async mutate(detail,{action,columnId=null,name='',type='text',
   config={},visible=true,confirmation=''}={},
   {enabled=BOARD_STRUCTURE_ADMIN_ENABLED}={}){
  const id=boardId(detail?.board?.id);
  if(enabled!==true)throw new ApiError('Board structure activation is pending.',403);
  await hasManage(this.api,id);
  if(!['create','update','delete'].includes(action))fail('Unsupported column action.');
  if(!TYPES.has(type))fail('Unsupported column type.');
  const columns=describeBoardColumns(detail);
  const column=action==='create'?null:columns.find(c=>c.id===columnId);
  if(action!=='create'&&(!column||!column.deletable))
   throw new ApiError('Primary and application-owned columns cannot be altered or deleted.',403);
  if(action==='delete'&&confirmation!=='DELETE '+column.name)
   fail('Enter the exact column deletion confirmation.');
  if(action!=='delete')name=validName(name);
  if(config===null||typeof config!=='object'||Array.isArray(config))
   fail('Invalid column configuration.');
  const updated=detail.board.updated_at;
  if(typeof updated!=='string'||!Number.isFinite(Date.parse(updated)))
   fail('Board structure version is missing; refresh.');
  const result=await this.api.rpc('wm_board_schema_mutate',{
   p_board_id:id,p_expected_updated_at:updated,p_action:action,
   p_column_id:columnId,p_name:action==='delete'?null:name,
   p_data_type:action==='delete'?null:type,
   p_config:config,p_visible:visible===true,
   p_confirm_delete:action==='delete'
  });
  if(!result||result.board_id!==id||result.action!==action||
    !validUuid(result.column_id)||typeof result.updated_at!=='string')
   throw new ApiError('Board mutation receipt verification failed.');
  return result;
 }
}
export function renderBoardStructureAdmin(detail,settings,{canManage=false,availableTabs=[]}={}){
 const ready=BOARD_STRUCTURE_ADMIN_ENABLED&&canManage&&settings?.status==='VERIFIED_READ';
 const disabled=ready?'':' disabled';
 const cols=describeBoardColumns(detail);
 const primary=displayColumnLabel(settings,cols[0]);
 const labels=settings?.columnLabels||{};
 const tabPreferences=new Map((settings?.tabs||[]).map(x=>[x.key,x]));
 const tabs=availableTabs.map((t,index)=>({key:t.key,
  label:tabPreferences.get(t.key)?.label||t.title||t.key,
  order:settings?.status==='VERIFIED_READ'&&tabPreferences.has(t.key)?
   settings.tabs.findIndex(x=>x.key===t.key)+1:index+1,
  visible:t.key==='items'||tabPreferences.get(t.key)?.visible!==false}));
 const notice=ready?'Authorized board configuration. Changes are saved to PostgreSQL.':
  'Board structure management is staged but not activated. Current board and item operations remain available.';
 return '<div class="board-structure-admin">'+
  '<p role="status" class="muted">'+esc(notice)+'</p>'+
  '<section class="panel panel-body"><h3>Primary column — permanently protected</h3>'+
  '<p class="muted">Display name only. Item IDs, titles, type and primary designation are immutable.</p>'+
  '<form data-structure-form="settings">'+
  '<div class="field"><label for="structure-primary">Primary display name</label>'+
  '<input id="structure-primary" name="primaryLabel" maxlength="80" value="'+esc(primary)+'"'+disabled+' required /></div>'+
  '<h3>Board views</h3><p class="muted">Names, visibility and order for supported views. Items cannot be hidden.</p>'+
  tabs.map((t,i)=>
   '<div class="field board-structure-tab"><label for="structure-tab-label-'+i+'">'+esc(t.key)+'</label>'+
   '<input id="structure-tab-label-'+i+'" name="label:'+esc(t.key)+'" maxlength="60" value="'+esc(t.label)+'"'+disabled+' />'+
   '<label for="structure-tab-order-'+i+'">Order</label>'+
   '<input id="structure-tab-order-'+i+'" type="number" min="1" max="4" name="order:'+esc(t.key)+
   '" value="'+t.order+'"'+disabled+' />'+
   '<label><input type="checkbox" name="visible:'+esc(t.key)+'"'+
    (t.visible?' checked':'')+(t.key==='items'?' disabled':disabled)+' /> Visible</label></div>').join('')+
  '<h3>Column display names</h3>'+
  cols.slice(1).map(c=>
   '<div class="field"><label for="structure-label-'+esc(c.id)+'">'+esc(c.name)+
   (c.immutable?' (application schema)':' (custom column)')+'</label>'+
   '<input id="structure-label-'+esc(c.id)+'" maxlength="80" name="columnLabel:'+esc(c.id)+
   '" value="'+esc(labels[c.id]||c.name)+'"'+disabled+' /></div>').join('')+
  '<div class="modal-actions"><button class="primary" type="submit"'+disabled+'>Save board display settings</button></div></form></section>'+
  '<section class="panel panel-body"><h3>Additional columns</h3>'+
  '<p class="muted">Application-defined columns are dependency-protected. Custom columns may be updated and deleted only after server approval and data validation.</p>'+
  '<form data-structure-form="create"><div class="field"><label for="structure-new-name">Column name</label>'+
  '<input id="structure-new-name" name="name" maxlength="80" required'+disabled+' /></div>'+
  '<div class="field"><label for="structure-new-type">Column type</label>'+
  '<select id="structure-new-type" name="type"'+disabled+'>'+
  BOARD_STRUCTURE_TYPES.map(t=>'<option value="'+t+'">'+esc(t)+'</option>').join('')+'</select></div>'+
  '<button class="primary" type="submit"'+disabled+'>Add column</button></form>'+
  '<div class="board-member-list">'+cols.slice(1).map(c=>
   '<div class="board-member"><strong>'+esc(c.name)+'</strong>'+
   '<small>'+esc(c.type)+' · '+(c.immutable?'Application-owned':'Custom')+'</small>'+
   (c.deletable?'<button class="secondary" type="button" data-structure-edit="'+esc(c.id)+'"'+
     disabled+'>Edit</button><button class="secondary" type="button" data-structure-delete="'+esc(c.id)+'"'+
     disabled+'>Delete</button>':
    '<small>Protected from deletion and type changes</small>')+'</div>').join('')+
  '</div></section></div>';
}
