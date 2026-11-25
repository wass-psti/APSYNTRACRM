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
export function renderTradeLinkActivity({events=null,busy=false,error=''}={}){
 const rows=normalizeBoardActivity(events).slice(0,TRADELINK_ACTIVITY_LIMIT);
 return '<section class="tl-content-panel tl-activity" data-tl-screen="activity" aria-labelledby="tl-activity-title">'+
  '<div class="tl-panel-heading tl-activity-heading"><div><p class="tl-eyebrow">Signed application audit</p>'+
   '<h2 id="tl-activity-title">Activity</h2></div>'+
   '<button type="button" class="secondary" data-action="tradelink-activity-refresh"'+
    (busy?' disabled':'')+'>Refresh activity</button></div>'+
  '<p class="tl-activity-intro muted">These are authoritative events for the current TradeLink application, not the source application’s document-comment or notification feed.</p>'+
  (busy?'<p class="tl-activity-state tl-activity-loading" role="status" aria-live="polite">Loading authorized application activity…</p>':'')+
  (error?'<p class="tl-activity-state tl-activity-error" role="alert">'+esc(error)+'</p>':'')+
  (!busy&&!error&&rows.length===0?'<p class="tl-activity-state tl-activity-empty" role="status">No authorized application events were returned.</p>':'')+
  (!error?'<ol class="tl-activity-list tl-activity-timeline" aria-label="Latest TradeLink application events">'+rows.map(row=>'<li class="tl-activity-entry" data-event-type="'+esc(row.eventType)+'">'+
   '<span class="tl-activity-marker" aria-hidden="true"></span>'+
   '<article class="tl-activity-card"><div class="tl-activity-line"><strong class="tl-activity-type">'+esc(row.eventType)+'</strong>'+
   (row.createdAt?'<time datetime="'+esc(row.createdAt)+'">'+
     esc(formatTradeLinkActivityTime(row.createdAt))+'</time>':'<span class="tl-activity-time-unavailable">Time unavailable</span>')+'</div>'+
   (row.message?'<p class="tl-activity-message">'+esc(row.message)+'</p>':'')+
   '<small class="tl-activity-actor">Recorded by '+esc(row.actorName)+'</small></article></li>').join('')+'</ol>':'')+
  '<p class="tl-activity-count">Latest '+rows.length+' authorized application event'+
   (rows.length===1?'':'s')+' · workflow audit and notifications are separate integration milestones.</p></section>';
}
