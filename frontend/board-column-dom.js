/** Patch one ordinary-board column in place after its authoritative readback.
 * Unaffected rows, columns, inputs and scroll containers retain their identity.
 */
export function patchBoardColumnDom(root,{
 key,title,visible=true,renderCell=()=>null
}={}){
 if(!root?.querySelectorAll||typeof key!=='string'||
    !(/^(?:record|col:[0-9a-f-]{36})$/i.test(key)))return {status:'invalid',tables:0,cells:0};
 const tables=[...root.querySelectorAll('table[data-group-id]')];
 if(!tables.length)return {status:'missing',tables:0,cells:0};
 const headers=tables.map(table=>table.querySelector('thead th[data-column-key="'+key+'"]'));
 if(visible&&headers.some(header=>!header))
  return {status:'missing',tables:tables.length,cells:0};
 if(!visible){
  if(tables.some(table=>table.dataset.boardVirtual==='true'))
   return {status:'rebuild',tables:tables.length,cells:0};
  const cells=tables.map(table=>[...table.querySelectorAll('td[data-board-cell-key="'+key+'"]')]);
  if(cells.some(group=>group.some(cell=>cell.querySelector('[data-inline-cell-form]'))))
   return {status:'pending',tables:tables.length,cells:0};
  let removed=0;
  tables.forEach((table,index)=>{
   const col=table.querySelector('colgroup col[data-column-key="'+key+'"]');
   const width=Number(col?.getAttribute('width'))||0;
   headers[index]?.remove();col?.remove();
   for(const cell of cells[index]){cell.remove();removed++;}
   table.querySelector('td[data-board-summary-key="'+key+'"]')?.remove();
   for(const spanning of table.querySelectorAll('td[colspan]')){
    const span=Number(spanning.getAttribute('colspan'))||1;
    spanning.setAttribute('colspan',String(Math.max(1,span-1)));
   }
   if(width){
    const current=Number(table.getAttribute('width'));
    if(Number.isFinite(current))table.setAttribute('width',String(Math.max(0,current-width)));
   }
  });
  return {status:'patched',tables:tables.length,cells:removed};
 }
 let patched=0,pending=false;
 headers.forEach(header=>{
  const label=header.querySelector('.board-heading-label');
  if(label){
   const selectAll=label.querySelector('.board-select-all');
   if(selectAll)label.replaceChildren(selectAll,root.ownerDocument.createTextNode(String(title??'')));
   else label.textContent=String(title??'');
  }
  const more=header.querySelector('.board-column-more');
  if(more)more.setAttribute('aria-label','Column options for '+String(title??''));
  const resize=header.querySelector('.board-column-resize');
  if(resize)resize.setAttribute('aria-label','Resize '+String(title??'')+' column');
 });
 tables.forEach(table=>{
  for(const cell of table.querySelectorAll('td[data-board-cell-key="'+key+'"]')){
   if(cell.querySelector('[data-inline-cell-form]')){pending=true;continue;}
   const itemId=cell.dataset.boardCellItemId;
   const content=renderCell(itemId);
   if(content){
    const trigger=cell.querySelector('.board-inline-cell-trigger');
    if(trigger)trigger.replaceWith(content);
    else cell.replaceChildren(content);
    patched++;
   }
  }
  const summary=table.querySelector('td[data-board-summary-key="'+key+'"]');
  if(summary)summary.setAttribute('aria-label',String(title??key)+' summary');
 });
 return {status:pending?'partial':'patched',tables:tables.length,cells:patched};
}
