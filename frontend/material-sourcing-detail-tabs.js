/** Material Request Hub — signed board-item detail tabs.
 * Activities are sourced only from a bounded signed board audit response
 * and strictly filtered by the persisted item ID. Never project event payload,
 * message, actor identity, or unrelated board records into this drawer.
 * Task RPCs in the legacy material_tracker_materials domain are not linked to
 * Work Management board IDs; no invented cross-model task association.
 */
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MATERIAL_SOURCING_DETAIL_TABS=Object.freeze(['details','tasks','activity']);
/** Render the verified, public item projection rather than generic board metadata.
 * Commercial values are intentionally excluded and loaded by the separate signed
 * protected-field RPC. No figures, foreign items, or exchange rates are inferred. */
export function renderMaterialSourcingPublicOverview(row,{groupTitle='Main group',editing=false,enabledFields=[]}={}){
 const safe=row&&typeof row==='object'?row:{};
 const val=value=>value===null||value===undefined||String(value)===''?'—':escape(value);
 const field=(name,value,{wide=false,badge=false,key='',type='text'}={})=>{
  const editable=editing&&key&&enabledFields.includes(key);
  const raw=String(value??'');
  const control=!editable?'':key==='source'?
   '<select id="mrh-public-'+key+'" data-mrh-public-field="'+key+'" aria-label="Edit '+escape(name)+'">'+
    ['','Local','Import'].map(v=>'<option value="'+v+'"'+(v===raw?' selected':'')+'>'+escape(v||'Select source')+'</option>').join('')+'</select>':
   key==='description'?'<textarea id="mrh-public-'+key+'" data-mrh-public-field="'+key+'" aria-label="Edit '+escape(name)+'" maxlength="2000" rows="2">'+escape(raw)+'</textarea>':
   '<input id="mrh-public-'+key+'" data-mrh-public-field="'+key+'" aria-label="Edit '+escape(name)+'" type="'+type+'"'+
    (type==='number'?' min="0" step="any"':' maxlength="240"')+' value="'+escape(raw)+'">';
  return '<div class="mrh-detail-field'+(wide?' mrh-detail-field-wide':'')+'">'+
   '<dt>'+escape(name)+'</dt><dd data-mrh-public-value="'+escape(key)+'">'+
   (badge&&value?'<span class="mrh-detail-source '+(value==='Local'?'local':value==='Import'?'import':'')+'">'+val(value)+'</span>':val(value))+
   '</dd>'+control+'</div>';
 };
 const section=(title,icon,fields)=>
  '<section class="mrh-detail-section"><h3><span aria-hidden="true">'+icon+'</span>'+title+'</h3>'+
  '<dl class="mrh-detail-field-grid">'+fields+'</dl></section>';
 return '<div class="mrh-detail-public" aria-label="Public Material Sourcing fields">'+
  section('Identification','◇',
   field('Part number',safe.partNumber,{key:'partNumber'})+field('Source type',safe.source,{badge:true,key:'source'})+
   field('RFQ Ref No',safe.rfq,{wide:true,key:'rfq'})+
   field('Material description',safe.description,{wide:true,key:'description'})+
   field('Brand',safe.brand,{key:'brand'})+field('Quantity',safe.quantity,{key:'quantity',type:'number'})+
   field('Created',safe.created))+
  section('Supplier & Schedule','▧',
   field('Date required',safe.due,{key:'due',type:'date'})+field('Leadtime (weeks)',safe.lead,{key:'lead',type:'number'})+
   field('Board group',groupTitle,{wide:true}))+
  '</div>';
}

export function renderMaterialSourcingDetailTabs(summaryHtml){
 return '<div class="mrh-detail-tabs" role="tablist" aria-label="Material Sourcing item sections">'+
  MATERIAL_SOURCING_DETAIL_TABS.map((tab,index)=>
   '<button type="button" role="tab" data-mrh-detail-tab="'+tab+'" id="mrh-detail-tab-'+tab+'" '+
   'aria-controls="mrh-detail-panel-'+tab+'" aria-selected="'+(index===0?'true':'false')+'" tabindex="'+(index===0?'0':'-1')+'">'+
   tab[0].toUpperCase()+tab.slice(1)+'</button>').join('')+'</div>'+
  '<section id="mrh-detail-panel-details" role="tabpanel" aria-labelledby="mrh-detail-tab-details" data-mrh-detail-panel="details">'+
   '<div data-mrh-public-host>'+summaryHtml+'</div>'+
   '<div data-mrh-private-host role="region" aria-label="Protected Material Sourcing details">'+
   '<p role="status" class="muted">Loading available material details…</p></div></section>'+
  '<section id="mrh-detail-panel-tasks" role="tabpanel" aria-labelledby="mrh-detail-tab-tasks" data-mrh-detail-panel="tasks" hidden>'+
   '<div data-mrh-board-tasks>'+renderMaterialSourcingTasksUnavailable()+'</div></section>'+
  '<section id="mrh-detail-panel-activity" role="tabpanel" aria-labelledby="mrh-detail-tab-activity" data-mrh-detail-panel="activity" hidden>'+
   '<div data-mrh-item-activity role="status" aria-live="polite">Open Activity to load the signed item audit trail.</div></section>';
}
/** Reference-aligned section structure for sessions without a protected
 * sourcing result. Do not request/guess private values or add new role gates. */
/** Meaningful display state, not an access decision; server RPCs remain authoritative. */
export function classifyMaterialSourcingDetailError(error){
 const status=Number(error?.status)||0;
 if(status===401||status===403||error?.code==='42501')
  return 'restricted';
 if(status===0||status===408||status===429||status>=500)
  return 'retry';
 return 'unavailable';
}
export function renderMaterialSourcingUnavailableDetails({reason='unavailable'}={}){

 const state=['restricted','retry','empty'].includes(reason)?reason:'unavailable';
 const placeholder=state==='restricted'?'Restricted':state==='empty'?'Not entered':'Unavailable';
 const field=(label)=>'<div class="mrh-detail-field mrh-detail-restricted-field">'+
  '<dt>'+escape(label)+'</dt><dd><span class="mrh-detail-value-unavailable">'+placeholder+'</span></dd></div>';
 const section=(title,icon,labels)=>'<section class="mrh-detail-section mrh-detail-unavailable-section">'+
  '<h3><span aria-hidden="true">'+icon+'</span>'+escape(title)+'</h3>'+
  '<dl class="mrh-detail-field-grid">'+labels.map(field).join('')+'</dl></section>';
 return '<div class="mrh-detail-unavailable" aria-label="Additional material information">'+
  section('Pricing & Cost','₱',['Buying price','Currency','Shipping cost','Shipping currency'])+
  section('Calculated Totals','▤',['Total buying','Landed cost'])+
  section('Logistics','▧',['Vendor details'])+
  '<p class="mrh-detail-availability-note" role="status">'+
  (state==='restricted'?'Additional commercial fields are restricted for this session. Public material details remain visible above.':
   state==='retry'?'Additional details could not be loaded. Refresh the item to retry; saved values have not been changed.':
   state==='empty'?'No protected values have been entered for this material.':
   'Additional material details are unavailable. Public material details remain visible above.')+
  '</p>'+
  (state==='retry'||state==='unavailable'?'<button type="button" class="secondary" data-mrh-details-retry>Retry loading details</button>':'')+
  '</div>';
}

export function renderMaterialSourcingTasksUnavailable(){
 return '<section class="mrh-item-task-status" aria-label="Material Sourcing tasks">'+
  '<h3>Tasks</h3><p role="status">Select Tasks to load this item’s current task list.</p></section>';
}
export function selectMaterialSourcingDetailTab(dialog,tab){
 if(!MATERIAL_SOURCING_DETAIL_TABS.includes(tab)||!dialog?.querySelectorAll)return false;
 const buttons=[...dialog.querySelectorAll('[data-mrh-detail-tab]')];
 const panels=[...dialog.querySelectorAll('[data-mrh-detail-panel]')];
 if(buttons.length!==3||panels.length!==3)return false;
 for(const button of buttons){
  const active=button.dataset.mrhDetailTab===tab;
  button.setAttribute('aria-selected',String(active));
  button.tabIndex=active?0:-1;
 }
 for(const panel of panels)panel.hidden=panel.dataset.mrhDetailPanel!==tab;
 return true;
}
export function materialSourcingItemAuditRows(raw,itemId){
 if(!UUID.test(itemId||'')||!Array.isArray(raw))return [];
 const seen=new Set(),events=[];
 for(const row of raw.slice(0,200)){
  if(!row||typeof row!=='object'||String(row.entity_id||'').toLowerCase()!==itemId.toLowerCase())continue;
  const key=String(row.id??'');
  if(!/^[1-9][0-9]{0,18}$/.test(key)||seen.has(key))continue;
  seen.add(key);
  const timestamp=typeof row.created_at==='string'&&Number.isFinite(Date.parse(row.created_at))?
   row.created_at:'';
  events.push(Object.freeze({
   id:key,
   type:typeof row.event_type==='string'?row.event_type.slice(0,120):'Item event',
   timestamp
  }));
 }
 return events;
}
export function renderMaterialSourcingItemActivity(rows,{limit=200}={}){
 return '<section class="mrh-item-activity-history" aria-label="Material Sourcing item activity">'+
  '<h3>Activity</h3><p class="muted">Recent signed board audit records matching this exact item. '+
  'Commercial values, actor identities and unrelated board events are excluded.</p>'+
  (rows.length?'<ol>'+rows.map(row=>
   '<li><strong>'+escape(row.type)+'</strong><time datetime="'+escape(row.timestamp)+'">'+
   escape(row.timestamp?new Date(row.timestamp).toLocaleString('en-PH'):'Time unavailable')+
   '</time></li>').join('')+'</ol>':
   '<p role="status">No matching item events were returned in the current audit window.</p>')+
  (limit>=200?'<p class="muted">Only the latest 200 board events are checked. Older item events may exist.</p>':'')+
  '</section>';
}
