import {DOCUMENT_CATEGORIES} from './order-intake-documents.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function documentUploadFields(row){
 return '<p>Attach a document to PO '+esc(row.po_number)+' · revision '+row.revision+'. Files remain linked to this revision.</p><label>Document type<select name="category" required><option value="client_po">Client PO</option><option value="uploaded_confirmation">Uploaded confirmation</option><option value="supporting">Supporting document</option></select></label><label>File (PDF, PNG, JPEG; up to 5 MiB)<input type="file" name="document" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" required></label>';
}
export function documentRegistryMarkup({row,rows=[],coverage=null,hasMore=false}){
 const refs=row?.record_kind==='legacy'?'<p>Historical source PO reference: '+esc(row.po_file_reference||'None recorded')+'</p><p>Historical confirmation reference: '+esc(row.confirmation_reference||'None recorded')+'</p><p>Source references are not stored files.</p>':'';
 const stats=coverage?'<section class="oi-panel"><h3>Storage coverage (all orders, including archived)</h3><p>'+coverage.withFiles+' / '+coverage.orders+' orders have stored files · '+coverage.withClientPO+' with client PO · '+coverage.withConfirmation+' with confirmation</p><p>'+coverage.storedFiles+' stored files · '+coverage.storedBytes.toLocaleString()+' bytes · '+coverage.auditOnly+' audit-only confirmations</p><p>Historical references: '+coverage.historicalPOReferences+' PO · '+coverage.historicalConfirmationReferences+' confirmation</p></section>':'';
 return stats+refs+'<h3>Document history</h3><p>Newest first. Each entry records the order revision, creator, time and SHA-256. Earlier audit-only confirmations have no stored bytes.</p>'+
 (rows.length?'<ol class="oi-document-list">'+rows.map(d=>'<li><strong>'+esc(d.filename)+'</strong><p>'+esc(DOCUMENT_CATEGORIES[d.category]||d.category)+' · '+esc(d.record_kind)+' · revision '+esc(d.order_revision)+'</p><p>Order ID: '+esc(d.order_id)+' · '+esc(d.created_at)+' · Actor '+esc(d.created_by)+'</p><p>'+ (d.stored?esc(d.byte_count)+' bytes':'Audit only — file unavailable')+'</p><code>'+esc(d.sha256)+'</code>'+
 (d.stored?'<div class="oi-document-actions"><button type="button" class="secondary" data-oi-document-download="'+esc(d.id)+'">Download</button>'+(d.mime_type.startsWith('image/')?'<button type="button" class="secondary" data-oi-document-preview="'+esc(d.id)+'">Thumbnail</button>':'')+'</div><div data-oi-document-thumbnail="'+esc(d.id)+'"></div>':'')+'</li>').join('')+'</ol>':'<p>No document entries.</p>')+
 (hasMore?'<button type="button" class="secondary" data-oi-document-more>Load older documents</button>':'');
}
export function downloadDocument(blob,filename){
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
