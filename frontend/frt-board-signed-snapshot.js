/** Visible FRT board summary mirrors the signed domain snapshot, never fake board rows. */
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderFRTBoardSignedSnapshot(result,{busy=false,boardId}={}){
 const href='#/boards/'+encodeURIComponent(String(boardId||''))+'/finance';
 let out='<section class="panel" aria-label="Authoritative FRT request synchronization">'+
  '<div class="panel-header"><h3>Signed FRT requests</h3><a href="'+esc(href)+'">Open FRT Finance</a></div>'+
  '<div class="panel-body"><p class="muted">These are authoritative financial requests, separate from board-mirror items. '+
  'Edits use the existing signed FRT Finance controls; no duplicate board records are created.</p>';
 if(busy||result===null)return out+'<p role="status">Loading signed FRT requests…</p></div></section>';
 if(result.status!=='PASS')return out+'<p role="status">Signed FRT requests are unavailable for this session. '+
  'The CRM board items below remain independent.</p></div></section>';
 if(!result.companies?.length)return out+'<p>No FRT companies configured for this workspace.</p></div></section>';
 const rows=Array.isArray(result.requests)?result.requests:[];
 out+='<p role="status">'+esc(result.companyCode)+' · '+rows.length+
  ' recent signed request'+(rows.length===1?'':'s')+' displayed'+
  (result.summary?.total_requests>rows.length?' (more exist in the domain)':'')+'</p>';
 out+='<div class="table-scroll"><table class="board-table"><thead><tr><th>Request</th><th>Voucher</th><th>Status</th><th>Date needed</th></tr></thead><tbody>';
 out+=rows.map(r=>'<tr><td>'+esc(r.title)+'</td><td>'+esc(r.voucher)+'</td><td>'+esc(r.status)+
  '</td><td>'+esc(r.dateNeeded)+'</td></tr>').join('')||
  '<tr><td colspan="4" class="muted">No signed FRT requests exist for this company.</td></tr>';
 return out+'</tbody></table></div></div></section>';
}
