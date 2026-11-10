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
export function renderMaterialSourcingDetailTabs(summaryHtml){
 return '<div class="mrh-detail-tabs" role="tablist" aria-label="Material Sourcing item sections">'+
  MATERIAL_SOURCING_DETAIL_TABS.map((tab,index)=>
   '<button type="button" role="tab" data-mrh-detail-tab="'+tab+'" id="mrh-detail-tab-'+tab+'" '+
   'aria-controls="mrh-detail-panel-'+tab+'" aria-selected="'+(index===0?'true':'false')+'" tabindex="'+(index===0?'0':'-1')+'">'+
   tab[0].toUpperCase()+tab.slice(1)+'</button>').join('')+'</div>'+
  '<section id="mrh-detail-panel-details" role="tabpanel" aria-labelledby="mrh-detail-tab-details" data-mrh-detail-panel="details">'+
   summaryHtml+
   '<div data-mrh-private-host role="region" aria-label="Protected Material Sourcing details">'+
   '<p role="status" class="muted">Checking restricted sourcing access…</p></div></section>'+
  '<section id="mrh-detail-panel-tasks" role="tabpanel" aria-labelledby="mrh-detail-tab-tasks" data-mrh-detail-panel="tasks" hidden>'+
   '<div data-mrh-board-tasks>'+renderMaterialSourcingTasksUnavailable()+'</div></section>'+
  '<section id="mrh-detail-panel-activity" role="tabpanel" aria-labelledby="mrh-detail-tab-activity" data-mrh-detail-panel="activity" hidden>'+
   '<div data-mrh-item-activity role="status" aria-live="polite">Open Activity to load the signed item audit trail.</div></section>';
}
export function renderMaterialSourcingTasksUnavailable(){
 return '<section class="mrh-item-task-status" aria-label="Material Sourcing tasks">'+
  '<h3>Tasks</h3><p role="status">Board-item task integration is not activated.</p>'+
  '<p class="muted">The existing Material Tracker task service belongs to a separate material record model. '+
  'No verified mapping to APSYNTRA board items exists, so tasks cannot safely be read or created here. '+
  'Nothing has been saved.</p></section>';
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
