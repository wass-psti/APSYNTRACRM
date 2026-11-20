const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
export function boardPaginationStatus(pagination){
 if(!pagination||!Number.isSafeInteger(Number(pagination.loaded_count)))return '';
 const loaded=Math.max(0,Number(pagination.loaded_count));
 const total=Number.isSafeInteger(pagination.total_count)?pagination.total_count:null;
 if(total!==null){
  const remaining=Number.isSafeInteger(pagination.remaining_count)?
   pagination.remaining_count:Math.max(0,total-loaded);
  const active=Number.isSafeInteger(pagination.active_count)?pagination.active_count:null;
  const archived=Number.isSafeInteger(pagination.archived_count)?pagination.archived_count:null;
  const split=active!==null&&archived!==null?
   ' ('+active.toLocaleString('en-US')+' active, '+archived.toLocaleString('en-US')+' archived)':'';
  return 'Showing '+loaded.toLocaleString('en-US')+' of '+total.toLocaleString('en-US')+' items'+
   (remaining>0?' · '+remaining.toLocaleString('en-US')+' more available':'')+split;
 }
 return pagination.has_more===true?
  'Showing '+loaded.toLocaleString('en-US')+' items · More available':
  'Showing all '+loaded.toLocaleString('en-US')+' items';
}
export function renderBoardPagination(pagination,{busy=false,error=''}={}){
 if(!pagination||!Number.isSafeInteger(Number(pagination.loaded_count)))return '';
 const more=pagination.has_more===true;
 const status=boardPaginationStatus(pagination);
 return '<section class="board-pagination" aria-label="Board item pagination">'+
  '<p class="board-pagination-status" tabindex="-1" role="status" aria-live="polite">'+status+'</p>'+
  (error?'<p class="board-pagination-error" role="alert">'+escape(error)+'</p>':'')+
  (more?'<button type="button" class="secondary board-load-more" data-action="board-load-more" '+
   (busy?'disabled':'')+'>'+escape(busy?'Loading more items…':error?'Retry loading items':'Load more items')+'</button>'+
   (!error&&!busy?'<div class="board-pagination-sentinel" data-board-pagination-sentinel aria-hidden="true"></div>':''):'')+
  '</section>';
}
export function mountBoardPagination(root,onLoad){
 const sentinel=root?.querySelector?.('[data-board-pagination-sentinel]');
 if(!sentinel||typeof onLoad!=='function'||
    typeof globalThis.IntersectionObserver!=='function')return ()=>{};
 // If the sentinel is already in the initial viewport/margin (for example,
 // every loaded row is filtered out), require the explicit button instead of
 // recursively hydrating the entire board without a scroll gesture.
 const rect=sentinel.getBoundingClientRect?.();
 const viewportHeight=Number(globalThis.innerHeight)||0;
 if(rect&&rect.top<=viewportHeight+720)return ()=>{};
 let active=true,pending=false;
 const observer=new IntersectionObserver(entries=>{
  if(!active||pending||!entries.some(entry=>entry.isIntersecting))return;
  const button=root.querySelector('[data-action="board-load-more"]');
  if(!button||button.disabled)return;
  pending=true;
  Promise.resolve().then(()=>onLoad()).catch(()=>false).finally(()=>{pending=false;});
 },{rootMargin:'720px 0px',threshold:0});
 observer.observe(sentinel);
 return ()=>{active=false;observer.disconnect();};
}
