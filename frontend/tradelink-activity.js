/** Read-only TradeLink activity projection from the module-scoped signed application event RPC.
 * Source TradeLink's collaboration/mention notifications are NOT represented here:
 * they need a separate authorized domain API and must never be inferred from board events.
 */
import {normalizeBoardActivity} from './board/presentation/activity-ui.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const TRADELINK_ACTIVITY_LIMIT=100;
const tradeLinkActivityTimeFormatter=new Intl.DateTimeFormat('en-PH',{
 dateStyle:'medium',timeStyle:'short'
});
function formatTradeLinkActivityTime(value){
 if(!value)return 'Time unavailable';
 return tradeLinkActivityTimeFormatter.format(new Date(value));
}
function tradeLinkActivityInitials(value){
 const parts=String(value||'Recorded user').trim().split(/\s+/).filter(Boolean);
 const initials=parts.length>1?
  parts.slice(0,2).map(part=>part[0]).join(''):
  (parts[0]||'U').slice(0,2);
 return initials.toLocaleUpperCase();
}
export function renderTradeLinkActivity({events=null,busy=false,error=''}={}){
 const rows=normalizeBoardActivity(events).slice(0,TRADELINK_ACTIVITY_LIMIT);
 const timeline=rows.map(row=>{
  const entityLabel=[row.entityType,row.entityId].filter(Boolean).join(' · ');
  return '<li class="tl-activity-entry" data-event-type="'+esc(row.eventType)+'">'+
   '<span class="tl-activity-marker" aria-hidden="true"></span>'+
   '<article class="tl-activity-card">'+
    '<div class="tl-activity-card-header">'+
     '<strong class="tl-activity-type">'+esc(row.eventType)+'</strong>'+
     (row.createdAt?'<time class="tl-activity-time" datetime="'+esc(row.createdAt)+'">'+
      esc(formatTradeLinkActivityTime(row.createdAt))+'</time>':
      '<span class="tl-activity-time tl-activity-time-unavailable">Time unavailable</span>')+
    '</div>'+
    (row.message?'<p class="tl-activity-message">'+esc(row.message)+'</p>':'')+
    '<footer class="tl-activity-meta">'+
     '<span class="tl-activity-avatar" aria-hidden="true">'+esc(tradeLinkActivityInitials(row.actorName))+'</span>'+
     '<span class="tl-activity-actor"><span class="tl-activity-actor-prefix">Recorded by</span>'+
      '<strong class="tl-activity-actor-name">'+esc(row.actorName)+'</strong></span>'+
     (entityLabel?'<span class="tl-activity-entity" title="'+esc(entityLabel)+'">'+esc(entityLabel)+'</span>':'')+
    '</footer>'+
   '</article></li>';
 }).join('');
 return '<section class="tl-content-panel tl-activity" data-tl-screen="activity" aria-labelledby="tl-activity-title">'+
  '<div class="tl-panel-heading tl-activity-heading">'+
   '<div class="tl-activity-heading-copy"><p class="tl-eyebrow">Signed application audit</p>'+
    '<h2 id="tl-activity-title">Activity</h2>'+
    '<p class="tl-activity-subtitle">A clear, chronological view of recorded TradeLink application events.</p></div>'+
   '<div class="tl-activity-heading-tools">'+
    '<span class="tl-activity-source-badge"><span aria-hidden="true"></span>Signed audit feed</span>'+
    '<button type="button" class="secondary" data-action="tradelink-activity-refresh"'+
     (busy?' disabled':'')+'><span aria-hidden="true">↻</span>Refresh activity</button>'+
   '</div></div>'+
  '<p class="tl-activity-intro muted">These are authoritative events for the current TradeLink application, not the source application’s document-comment or notification feed.</p>'+
  '<div class="tl-activity-feed-heading"><div><h3>Latest events</h3>'+
   '<p>Recent changes recorded in this application</p></div>'+
   '<span class="tl-activity-total"><strong>'+rows.length+'</strong> events shown</span></div>'+
  (busy?'<p class="tl-activity-state tl-activity-loading" role="status" aria-live="polite">Loading authorized application activity…</p>':'')+
  (error?'<p class="tl-activity-state tl-activity-error" role="alert">'+esc(error)+'</p>':'')+
  (!busy&&!error&&rows.length===0?
   '<div class="tl-activity-state tl-activity-empty" role="status"><span class="tl-activity-empty-icon" aria-hidden="true">↗</span>'+
    '<div><strong>No events to display</strong><p>No authorized application events were returned.</p></div></div>':'')+
  (!error&&rows.length?
   '<ol class="tl-activity-list tl-activity-timeline" aria-label="Latest TradeLink application events">'+timeline+'</ol>':'')+
  '<p class="tl-activity-count">Latest '+rows.length+' authorized application event'+
   (rows.length===1?'':'s')+' · Up to 100 recent records are shown. Workflow audit and notifications are separate integration milestones.</p></section>';
}
