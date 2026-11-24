import {ORDER_INTAKE_STATUSES} from './order-intake-native.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const button=(action,label,disabled=false)=>'<button type="button" class="secondary" data-oi-action="'+action+'"'+(disabled?' disabled':'')+'>'+label+'</button>';
export function bulkToolbar({selected,total,page,pages,ready,busy,archived}){
 return '<div class="oi-bulk-toolbar"><span role="status">'+selected+' selected · '+total+' matching</span>'+
 button('select-page','Select page',!ready||busy||!total)+button('select-all','Select all matching',!ready||busy||!total)+button('clear-selection','Clear selection',busy||!selected)+
 button('bulk-status','Bulk status',!ready||busy||!selected||archived)+button('bulk-details','Bulk edit native details',!ready||busy||!selected||archived)+
 button(archived?'bulk-restore':'bulk-archive',archived?'Bulk restore':'Bulk archive',!ready||busy||!selected)+button('export','Export matching CSV',!ready||busy||!total)+
 '</div><div class="oi-page-controls">'+button('prev-page','Previous',page===0||busy)+'<span>Page '+(page+1)+' of '+pages+'</span>'+button('next-page','Next',page+1>=pages||busy)+'</div>';
}
export function bulkFields(action,rows){
 const counts=rows.reduce((a,r)=>(a[r.record_kind]=(a[r.record_kind]||0)+1,a),{});
 let markup='<p>'+rows.length+' selected orders ('+(counts.native||0)+' native, '+(counts.legacy||0)+' historical). Each order is saved independently. The batch stops on the first unconfirmed write; no automatic replay.</p>';
 if(action==='status')markup+='<label>New status<select name="status" required><option value="">Select status</option>'+ORDER_INTAKE_STATUSES.map(s=>'<option>'+esc(s)+'</option>').join('')+'</select></label>';
 if(action==='details')markup+='<p>Only native active orders are eligible. Blank fields remain unchanged; historical values are preserved. Expense amounts apply only to the selected currency.</p><label>Company<input name="company" maxlength="240"></label><label>Industry<input name="industry" maxlength="240"></label><label>Procurement expenses<input name="procurementExpenses" inputmode="decimal"></label><label>Expense currency<select name="currency"><option value="">Select currency if changing expenses</option><option>PHP</option><option>USD</option><option>EUR</option></select></label>';
 if(action==='archive'||action==='restore')markup+='<p>'+(action==='archive'?'Archive selected orders without deleting records or activity.':'Restore selected archived orders, retaining their existing status.')+'</p>';
 return markup+'<p role="status" data-oi-bulk-progress></p>';
}
export function bulkResults(results){
 if(!results.length)return '';
 const states=['verified','skipped','unconfirmed','not attempted'];
 return '<section class="oi-panel" aria-label="Bulk operation results"><h2>Bulk operation results</h2><p role="status">'+states.map(state=>results.filter(r=>r.state===state).length+' '+state).join(' · ')+'</p><details><summary>Per-order results</summary><ol class="oi-activity">'+results.map(r=>'<li>'+esc(r.po)+' — '+esc(r.state)+(r.reason?': '+esc(r.reason):'')+'</li>').join('')+'</ol></details></section>';
}
