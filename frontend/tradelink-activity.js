/** Read-only TradeLink activity projection from the existing signed board event RPC.
 * Source TradeLink's collaboration/mention notifications are NOT represented here:
 * they need a separate authorized domain API and must never be inferred from board events.
 */
import {normalizeBoardActivity} from './board-activity-ui.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const TRADELINK_ACTIVITY_LIMIT=100;
export function renderTradeLinkActivity({events=null,busy=false,error=''}={}){
 const rows=normalizeBoardActivity(events).slice(0,TRADELINK_ACTIVITY_LIMIT);
 return '<section class="tl-content-panel" aria-labelledby="tl-activity-title">'+
  '<div class="tl-panel-heading"><div><p class="tl-eyebrow">Signed board audit</p>'+
   '<h2 id="tl-activity-title">Activity</h2></div>'+
   '<button type="button" class="secondary" data-action="tradelink-activity-refresh"'+
    (busy?' disabled':'')+'>Refresh activity</button></div>'+
  '<p class="muted">These are authoritative events for the current TradeLink board, not the source application’s document-comment or notification feed.</p>'+
  (busy?'<p class="muted" role="status" aria-live="polite">Loading authorized board activity…</p>':'')+
  (error?'<p class="error-banner" role="alert">'+esc(error)+'</p>':'')+
  (!busy&&!error&&rows.length===0?'<p class="muted" role="status">No authorized board events were returned.</p>':'')+
  (!error?'<ol class="tl-activity-list">'+rows.map(row=>'<li class="tl-activity-entry">'+
   '<div class="tl-activity-line"><strong>'+esc(row.eventType)+'</strong>'+
   (row.createdAt?'<time datetime="'+esc(row.createdAt)+'">'+
     esc(row.createdAt.slice(0,19).replace('T',' '))+'</time>':'')+'</div>'+
   (row.message?'<p>'+esc(row.message)+'</p>':'')+
   '<small>'+esc(row.actorName)+'</small></li>').join('')+'</ol>':'')+
  '<p class="tl-search-count">Latest '+rows.length+' authorized board event'+
   (rows.length===1?'':'s')+' · workflow audit and notifications are separate integration milestones.</p></section>';
}
