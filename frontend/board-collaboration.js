/** CP-BOARD-COL01 signed item collaboration: frontend preparation, disabled until approval. */
import {ApiError} from './session.js';
import {validUuid} from './data.js';
export const BOARD_COL01_ITEM_READS_ENABLED=false;
const MAX=50;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:'';
function entries(rows,label){
 if(!Array.isArray(rows)||rows.length>MAX)throw new ApiError('Invalid signed '+label+' response.');
 return rows;
}
function itemMatch(row,itemId){
 return row&&typeof row.item_id==='string'&&row.item_id.toLowerCase()===itemId.toLowerCase();
}
function updates(rows,itemId){
 return entries(rows,'updates').map(row=>{
  if(!itemMatch(row,itemId)||!/^[1-9][0-9]{0,18}$/.test(String(row.id))||
    typeof row.body!=='string')throw new ApiError('Mismatched item update response.');
  return {id:String(row.id),body:row.body.slice(0,8000),createdAt:date(row.created_at)};
 });
}
function files(rows,itemId){
 return entries(rows,'files').map(row=>{
  const bytes=Number(row?.size_bytes);
  if(!itemMatch(row,itemId)||!validUuid(row.id)||typeof row.file_name!=='string'||
    !Number.isSafeInteger(bytes)||bytes<0)throw new ApiError('Mismatched item file response.');
  // Deliberately exclude storage_path, download URLs and internal identity keys.
  return {id:row.id,name:row.file_name.slice(0,250),bytes,
   mime:typeof row.mime_type==='string'?row.mime_type.slice(0,100):'',
   createdAt:date(row.created_at)};
 });
}
/** The caller must already have revalidated signed board VIEW access. */
export async function loadBoardCollaboration(api,itemId,
 {enabled=BOARD_COL01_ITEM_READS_ENABLED}={}){
 if(!validUuid(itemId))throw new ApiError('Invalid item identifier.');
 if(enabled!==true)return {status:'LOCKED',updates:[],files:[]};
 if(typeof api?.rpc!=='function')throw new ApiError('Signed API unavailable.',403);
 const [u,f]=await Promise.all([
  api.rpc('wm_list_board_item_updates',{p_item_id:itemId,p_limit:MAX}),
  api.rpc('wm_list_board_item_files',{p_item_id:itemId,p_limit:MAX})
 ]);
 return {status:'VERIFIED_READ',updates:updates(u,itemId),files:files(f,itemId)};
}
const when=v=>v?new Date(v).toLocaleString('en-PH'):'Time unavailable';
export function renderBoardCollaboration(result){
 if(result?.status!=='VERIFIED_READ')
  return '<section class="board-item-notes board-collaboration" aria-label="Item collaboration">'+
   '<h3>Updates &amp; files</h3><p class="muted" role="status">'+
   (result?.status==='ERROR'?'Authorized collaboration content could not be loaded.':
     'Updates and file metadata await signed collaboration security approval.')+
   '</p></section>';
 const u=Array.isArray(result.updates)?result.updates:[];
 const f=Array.isArray(result.files)?result.files:[];
 return '<section class="board-item-notes board-collaboration" aria-label="Item collaboration">'+
  '<h3>Updates</h3>'+(u.length?'<ul>'+u.map(r=>
   '<li><p>'+esc(r.body)+'</p><small>'+esc(when(r.createdAt))+'</small></li>').join('')+'</ul>':
   '<p class="muted">No authorized updates returned.</p>')+
  '<h3>Files</h3>'+(f.length?'<ul>'+f.map(r=>
   '<li><strong>'+esc(r.name)+'</strong><small> · '+esc(r.mime||'File')+
   ' · '+r.bytes+' bytes · '+esc(when(r.createdAt))+'</small></li>').join('')+'</ul>':
   '<p class="muted">No authorized file metadata returned.</p>')+
  '<p class="muted">Read-only metadata. Downloads, uploads and replies are not enabled.</p>'+
  '</section>';
}
