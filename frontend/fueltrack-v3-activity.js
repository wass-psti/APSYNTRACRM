/** FuelTrack+ Activity: authorized module audit stream, not a Board-status reconstruction.
 * Only the signed Admin RPC list_module_activity may supply VERIFIED_READ rows.
 */
const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const dayFmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'});
function localDay(input){const d=new Date(input);if(!Number.isFinite(d.getTime()))return null;
 const parts=Object.fromEntries(dayFmt.formatToParts(d).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
const MATCHERS=Object.freeze({
 submitted:/(^|[ _.-])(submitted|submit)(?=$|[ _.-])/i,
 approved:/(^|[ _.-])(approved|approve)(?=$|[ _.-])/i,
 rejected:/(^|[ _.-])(rejected|reject)(?=$|[ _.-])/i,
 completed:/(^|[ _.-])(completed|complete)(?=$|[ _.-])/i
});
export const FUELTRACK_ACTIVITY_MAX=250;
export const FUELTRACK_ACTIVITY_FILTER_DEFAULTS=Object.freeze({query:'',type:'all',expandedId:null});
const types=Object.freeze(['all','submitted','approved','rejected','completed']);
export function fuelTrackActivityType(eventType){
 for(const [k,pattern] of Object.entries(MATCHERS))if(pattern.test(String(eventType??'')))return k;
 return 'other';
}
export function fuelTrackActivityModel({snapshot=null,boardId=null,workspaceId=null,filters={},now=new Date()}={}){
 if(!snapshot||snapshot.status!=='VERIFIED_READ'||snapshot.boardId!==boardId||
   snapshot.workspaceId!==workspaceId||!Array.isArray(snapshot.events)||
   snapshot.events.length>FUELTRACK_ACTIVITY_MAX||!Number.isFinite(new Date(now).getTime()))return null;
 const events=[];const seen=new Set();
 for(const row of snapshot.events){
  if(!row||typeof row.event_id!=='string'||!row.event_id.trim()||row.event_id.length>128||
    typeof row.event_type!=='string'||!row.event_type.trim()||row.event_type.length>140||
    typeof row.occurred_at!=='string'||!Number.isFinite(Date.parse(row.occurred_at))||
    (row.actor_name!=null&&typeof row.actor_name!=='string')||
    (row.title!=null&&typeof row.title!=='string')||
    (row.message!=null&&typeof row.message!=='string')||
    (row.request_id!=null&&typeof row.request_id!=='string')||
    String(row.actor_name??'').length>200||String(row.title??'').length>500||
    String(row.message??'').length>2000||String(row.request_id??'').length>128||
    seen.has(row.event_id))return null;
  seen.add(row.event_id);
  events.push(Object.freeze({id:row.event_id,type:fuelTrackActivityType(row.event_type),
    eventType:row.event_type,actor:row.actor_name||'Actor unavailable',
    title:row.title||row.event_type,message:row.message||'',
    requestId:row.request_id||'',at:row.occurred_at}));
 }
 const query=typeof filters.query==='string'?filters.query.trim().toLocaleLowerCase().slice(0,120):'';
 const type=types.includes(filters.type)?filters.type:'all';
 const expandedId=typeof filters.expandedId==='string'?filters.expandedId:null;
 const visible=events.filter(e=>(type==='all'||e.type===type)&&
  (!query||[e.actor,e.title,e.message,e.requestId,e.eventType].some(x=>x.toLocaleLowerCase().includes(query))));
 const today=localDay(now);
 const current=new Date(now);
 const weekStart=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7))-1,Number(today.slice(8))));
 weekStart.setUTCDate(weekStart.getUTCDate()-(weekStart.getUTCDay()+6)%7);
 const weekKey=weekStart.toISOString().slice(0,10);
 const groups={today:[],week:[],earlier:[]},searchGroups={today:[],week:[],earlier:[]},daily={submitted:0,approved:0,rejected:0,completed:0};
 const counts={all:events.length,submitted:0,approved:0,rejected:0,completed:0};
 const hours=Array.from({length:24},()=>0);
 for(const e of events){
  if(counts[e.type]!=null)counts[e.type]++;
  const d=localDay(e.at);
  if(d===today){if(daily[e.type]!=null)daily[e.type]++;
   const hourParts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(e.at));
   const hour=Number(hourParts.find(x=>x.type==='hour')?.value);
   if(Number.isInteger(hour)&&hour>=0&&hour<24)hours[hour]++;
  }
 }
 for(const e of visible){const d=localDay(e.at);
  groups[d===today?'today':d>=weekKey&&d<today?'week':'earlier'].push(e);
 }
 // Render the selected type's complete bounded page once. Search then toggles
 // existing rows, so clearing or broadening a query never needs a full redraw.
 for(const e of events){
  if(type!=='all'&&e.type!==type)continue;
  const d=localDay(e.at);
  searchGroups[d===today?'today':d>=weekKey&&d<today?'week':'earlier'].push(e);
 }
 return {events:Object.freeze(events),visible:Object.freeze(visible),groups,searchGroups,counts,daily,hours,
  expandedId,query,type,limit:FUELTRACK_ACTIVITY_MAX};
}
const pulse=(label,value)=>'<div class="ft3-activity-pulse-card"><span>'+label+'</span><strong>'+value+'</strong></div>';
const link=(key,label,count,active)=>'<button type="button" data-action="ft3-activity-filter" data-type="'+key+
 '" aria-pressed="'+(active===key)+'" class="'+(active===key?'is-active':'')+'">'+label+
 ' <span>'+count+'</span></button>';
function eventMarkup(e,expandedId,query=''){
 const expanded=expandedId===e.id;
 const searchText=[e.actor,e.title,e.message,e.requestId,e.eventType].join(' ').toLocaleLowerCase();
 const hidden=query&&!searchText.includes(query);
 return '<li class="ft3-activity-entry" data-search-text="'+html(searchText)+'"'+(hidden?' hidden':'')+'><button type="button" class="ft3-activity-event" data-action="ft3-activity-expand" data-id="'+html(e.id)+
 '" aria-expanded="'+expanded+'"><span class="ft3-activity-dot" aria-hidden="true">◉</span><span class="ft3-activity-summary"><strong>'+
 html(e.actor)+'</strong> <span class="ft3-activity-kind">'+html(e.type==='other'?e.eventType:e.type)+'</span>'+
 '<small>'+html(e.title)+'</small></span><time datetime="'+html(e.at)+'">'+html(fmt.format(new Date(e.at)))+'</time><span aria-hidden="true">'+(expanded?'⌃':'⌄')+'</span></button>'+
 (expanded?'<div class="ft3-activity-detail"><dl><div><dt>Actor</dt><dd>'+html(e.actor)+
 '</dd></div><div><dt>Event</dt><dd>'+html(e.eventType)+'</dd></div><div><dt>Detail</dt><dd>'+html(e.message||'—')+
 '</dd></div><div><dt>Request ID</dt><dd>'+html(e.requestId||'—')+'</dd></div>'+
 '<div><dt>Timestamp</dt><dd>'+html(e.at)+'</dd></div><div><dt>Event ID</dt><dd>'+html(e.id)+
 '</dd></div></dl></div>':'')+'</li>';
}
export function renderFuelTrackActivity({snapshot=null,boardId=null,workspaceId=null,filters={},
 busy=false,error='',now=new Date()}={}){
 const model=fuelTrackActivityModel({snapshot,boardId,workspaceId,filters,now});
 const disabled=!model||busy;
 const rows=model?model.searchGroups:null;
 const label=(title,items)=>items.length?'<section class="ft3-activity-group" data-ft3-activity-group><h3>'+title+' <small>'+items.length+
 '</small></h3><ol>'+items.map(e=>eventMarkup(e,model.expandedId,model.query)).join('')+'</ol></section>':'';
 const max=model?Math.max(...model.hours,1):1;
 return '<section class="ft3-activity" aria-labelledby="ft3-activity-title"><header class="ft3-activity-head"><div>'+
 '<h2 id="ft3-activity-title">Activity</h2><p>'+(model?model.events.length+' authorized events loaded (latest '+model.limit+' maximum)':'Activity data unavailable')+
 '</p></div><div class="ft3-activity-actions"><button type="button" data-action="ft3-activity-export"'+(disabled?' disabled':'')+
 '>Audit Export</button><button type="button" data-action="ft3-activity-refresh"'+(busy?' disabled':'')+'>↻ Refresh</button></div></header>'+
 (busy?'<p role="status">Loading authorized activity…</p>':'')+
 (error?'<p class="ft3-activity-error" role="alert">'+html(error)+'</p>':'')+
 '<div class="ft3-activity-pulse"><h3>Today’s Pulse <small>Loaded event page only</small></h3><div>'+
 pulse('Submitted',model?model.daily.submitted:'—')+pulse('Approved',model?model.daily.approved:'—')+
 pulse('Rejected',model?model.daily.rejected:'—')+pulse('Completed',model?model.daily.completed:'—')+'</div></div>'+
 '<label class="ft3-activity-search-label" for="ft3-activity-search">Search activity</label>'+
 '<input id="ft3-activity-search" type="search" placeholder="Search by person, request or detail…" maxlength="120"'+
 (model?' value="'+html(model.query)+'"':' disabled')+'>'+
 '<div class="ft3-activity-filters" aria-label="Activity type filters">'+
 link('all','All',model?model.counts.all:'—',model?.type)+
 link('submitted','Submitted',model?model.counts.submitted:'—',model?.type)+
 link('approved','Approved',model?model.counts.approved:'—',model?.type)+
 link('rejected','Rejected',model?model.counts.rejected:'—',model?.type)+
 link('completed','Completed',model?model.counts.completed:'—',model?.type)+'</div>'+
 '<div class="ft3-activity-hours"><h3>Hourly Activity <small>Today · loaded page</small></h3>'+
 '<div class="ft3-activity-hour-bars" aria-label="Events per hour today">'+
 (model?model.hours.map((value,i)=>'<span title="'+i+':00 · '+value+' event(s)" class="ft3-hour-height-'+
 Math.max(0,Math.min(10,Math.round(value/max*10)))+'"></span>').join(''):'<p>—</p>')+'</div>'+
 '<p>00 <span>06</span><span>12</span><span>18</span><span>23</span></p></div>'+
 (!model?'<p class="ft3-activity-unavailable" role="status">'+
 'A signed FuelTrack module Admin session is required to load its authoritative activity stream. No audit records or totals are inferred from Board items.</p>':
 label('TODAY',rows.today)+label('THIS WEEK',rows.week)+label('EARLIER',rows.earlier)+
 '<p class="ft3-activity-unavailable" data-ft3-activity-empty role="status"'+
  (model.visible.length?' hidden':'')+'>No matching events in the loaded authorized history.</p>')+
 '<p class="ft3-activity-footnote">Only the latest authorized event page is shown. Older events may exist. Export contains the loaded authorized records, not a complete historical audit.</p></section>';
}
const cell=v=>{const s=String(v??'');const safe=/^[\s]*[=+@\-\t\r]/.test(s)?"'"+s:s;
 return '"'+safe.replaceAll('"','""')+'"';};
export function fuelTrackActivityCsv(model){
 if(!model)return null;
 const header=['Event ID','Timestamp','Event Type','Actor','Title','Message','Request ID'];
 const lines=model.visible.map(e=>[e.id,e.at,e.eventType,e.actor,e.title,e.message,e.requestId]);
 return '\uFEFF'+[header,...lines].map(r=>r.map(cell).join(',')).join('\r\n');
}
