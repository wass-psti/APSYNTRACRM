/** Render-local horizontal scroll restoration for independent board groups.
 * No persistent data, animation loop, or access to authorization state.
 * The caller decides whether the signed board and tab are unchanged.
 */
export function captureBoardGroupScroll(container){
 const positions=new Map();
 if(!container)return positions;
 for(const scroller of container.querySelectorAll('.board-group-scroll')){
  const id=scroller.querySelector('table[data-group-id]')?.dataset.groupId;
  if(id&&Number.isFinite(scroller.scrollLeft))positions.set(id,scroller.scrollLeft);
 }
 return positions;
}
export function restoreBoardGroupScroll(container,positions){
 if(!container||!positions?.size)return;
 for(const scroller of container.querySelectorAll('.board-group-scroll')){
  const id=scroller.querySelector('table[data-group-id]')?.dataset.groupId;
  if(id&&positions.has(id))scroller.scrollLeft=positions.get(id);
 }
}
