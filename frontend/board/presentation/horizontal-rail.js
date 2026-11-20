/** Persistent, viewport-adjacent horizontal scrollbar for ordinary Board tables.
 * Presentation only. Scroll positions are synchronized by the existing app-level
 * board scroll handler; no record data or preferences are changed.
 */
const SCROLLERS='.aps-board-shell .board-group-scroll,.aps-board-shell .board-collapsed-rollup-scroll';
let observer=null;

export function boardHorizontalMetrics(scrollers,viewportWidth){
 const contentWidth=Math.ceil(Math.max(0,...Array.from(scrollers||[],node=>
  Number.isFinite(Number(node?.scrollWidth))?Number(node.scrollWidth):0)));
 const viewport=Math.max(0,Number(viewportWidth)||0);
 return {contentWidth,overflow:viewport>0&&contentWidth>viewport+1};
}

/** Reattach after a full render or an incremental Board-content replacement.
 * At most one ResizeObserver stays active across navigation and redraws.
 */
export function mountBoardHorizontalRail(root){
 observer?.disconnect();
 observer=null;
 const slot=root?.querySelector?.('[data-board-horizontal-rail-slot]');
 if(!slot)return;
 const rail=slot.querySelector('[data-board-horizontal-rail]');
 const spacer=slot.querySelector('[data-board-horizontal-rail-spacer]');
 if(!rail||!spacer)return;
 const update=()=>{
  if(!slot.isConnected)return;
  const scrollers=[...root.querySelectorAll(SCROLLERS)].filter(node=>node.isConnected);
  const viewport=slot.getBoundingClientRect().width||
   slot.parentElement?.getBoundingClientRect().width||0;
  const {contentWidth,overflow}=boardHorizontalMetrics(scrollers,viewport);
  spacer.style.width=contentWidth+'px';
  slot.classList.toggle('is-scrollable',overflow);
  const active=scrollers.find(node=>node.scrollLeft>0)||scrollers[0];
  if(active&&Math.abs(rail.scrollLeft-active.scrollLeft)>1)
   rail.scrollLeft=active.scrollLeft;
 };
 update();
 if(typeof ResizeObserver!=='undefined'){
  observer=new ResizeObserver(update);
  if(slot.parentElement)observer.observe(slot.parentElement);
  const first=root.querySelector(SCROLLERS);
  if(first)observer.observe(first.querySelector('table')||first);
 }
}
