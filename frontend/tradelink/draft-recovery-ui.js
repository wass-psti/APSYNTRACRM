import {validateRecoverySnapshot} from './draft-recovery-state.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function renderRecoveryChoices(rows){
 const valid=rows.filter(row=>{try{validateRecoverySnapshot(row);return true;}catch{return false;}});
 if(!valid.length)return '';
 return '<section aria-label="Unfinished documents" class="tl-draft-panel"><h3>Unfinished documents on this device</h3>'+
 '<p>Resume a document or continue creating a new one. These inputs have not been verified as official saved documents.</p>'+
 valid.map(row=>'<div class="tl-draft-feedback"><strong>'+escape(row.fields.customerName||'Untitled document')+'</strong> · '+
 escape(new Date(row.updatedAt).toLocaleString())+' · '+row.lines.length+' rows '+
 '<button type="button" data-action="tradelink-recovery-resume" data-id="'+escape(row.instanceId)+'">'+(row.pendingSave?'Resume Save':'Resume Document')+'</button> '+
 (row.pendingSave?'<span>Original Save requires reconciliation.</span>':'<button type="button" data-action="tradelink-recovery-remove" data-id="'+escape(row.instanceId)+'">Discard</button>')+'</div>').join('')+'</section>';
}
