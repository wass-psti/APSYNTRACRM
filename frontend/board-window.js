/** Ephemeral board-table windows: DOM optimization, never an authorization cache.
 * Only full, already-authorized board groups are eligible. No persistence.
 */
export const BOARD_WINDOW_THRESHOLD=120;
export const BOARD_WINDOW_ROW_HEIGHT=52;
export const BOARD_WINDOW_SIZE=48;
const OVERSCAN=12;
let models=new Map();
let mounted=[];
let dispose=null;
let pendingFrame=0;
export function boardWindowSlice(total,top=0,viewport=900){
 if(!Number.isSafeInteger(total)||total<0)throw Error('Invalid board window total');
 const start=Math.min(total,Math.max(0,Math.floor(Math.max(0,top)/BOARD_WINDOW_ROW_HEIGHT)-OVERSCAN));
 const end=Math.min(total,Math.max(start+BOARD_WINDOW_SIZE,
  Math.ceil((Math.max(0,top)+Math.max(0,viewport))/BOARD_WINDOW_ROW_HEIGHT)+OVERSCAN));
 return {start,end:Math.min(total,end),above:start*BOARD_WINDOW_ROW_HEIGHT,
  below:Math.max(0,total-Math.min(total,end))*BOARD_WINDOW_ROW_HEIGHT};
}
export function registerBoardWindow(groupId,rows,renderRows,colspan){
 if(rows.length<BOARD_WINDOW_THRESHOLD)return null;
 const model={groupId,rows,filtered:rows,renderRows,colspan,start:-1,end:-1,
  lastQuery:'',rowIndex:new Map(rows.map((row,index)=>[row.itemId,index]).filter(([id])=>id)),
  searchIndex:rows.map(row=>String(row.search||'').toLocaleLowerCase())};
 models.set(groupId,model);
 return renderWindow(model,0,900);
}
function spacer(height,colspan){
 return height>0?'<tr class="board-virtual-spacer" aria-hidden="true" height="'+height+
  '"><td colspan="'+colspan+'"></td></tr>':'';
}
function renderWindow(model,top,viewport){
 if(model.filtered.length===0){
  model.start=0;model.end=0;
  return '<tr class="board-empty-row"><td colspan="'+model.colspan+'">No matching items</td></tr>';
 }
 const {start,end,above,below}=boardWindowSlice(model.filtered.length,top,viewport);
 model.start=start;model.end=end;
 return spacer(above,model.colspan)+model.renderRows(model.filtered.slice(start,end),start)+
  spacer(below,model.colspan);
}
export function resetBoardWindows(){
 dispose?.();dispose=null;
 if(pendingFrame&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(pendingFrame);
 pendingFrame=0;mounted=[];models.clear();
}
export function visibleBoardWindowIds(groupId){
 const model=models.get(groupId);
 if(!model)return null;
 return model.filtered.map(row=>row.itemId).filter(Boolean);
}
/** Update the retained row model after a confirmed local CAS write.
 * The next virtual window reuses the new cell markup instead of stale HTML.
 */
export function updateBoardWindowRow(groupId,itemId,update){
 const model=models.get(groupId),index=model?.rowIndex.get(itemId);
 if(!model||index===undefined||typeof update!=='function')return false;
 const row=model.rows[index],previousSearch=String(row.search||'').toLocaleLowerCase();
 update(row);
 const nextSearch=String(row.search||'').toLocaleLowerCase();
 model.searchIndex[index]=nextSearch;
 if(model.lastQuery){
  model.filtered=model.rows.filter((entry,entryIndex)=>
   model.searchIndex[entryIndex].includes(model.lastQuery));
 }
 if(previousSearch!==nextSearch&&model.lastQuery){
  const pair=mounted.find(entry=>entry.model===model&&entry.table.isConnected);
  if(pair)updateTable(model,pair.table,{force:true});
 }
 return true;
}
export function allBoardWindowIds(){
 return [...models.values()].flatMap(model=>model.filtered.map(row=>row.itemId).filter(Boolean));
}
const FOCUSABLE='input:not([disabled]),button:not([disabled]),a[href],select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function replaceWindow(model,tbody,top,viewport){
 const active=document.activeElement;
 const focusedRow=tbody.contains(active)?active.closest('tr[aria-rowindex]'):null;
 const focusedIndex=focusedRow?[...focusedRow.querySelectorAll(FOCUSABLE)].indexOf(active):-1;
 const index=focusedRow?.getAttribute('aria-rowindex');
 tbody.innerHTML=renderWindow(model,top,viewport);
 if(index&&focusedIndex>=0){
  const next=[...tbody.querySelectorAll('tr[aria-rowindex]')]
   .find(row=>row.getAttribute('aria-rowindex')===index);
  next?.querySelectorAll(FOCUSABLE)[focusedIndex]?.focus({preventScroll:true});
 }
}
function updateTable(model,table,{force=false,resetView=false}={}){
 const tbody=table.tBodies[0];if(!tbody)return;
 const top=resetView?0:-tbody.getBoundingClientRect().top;
 const view=boardWindowSlice(model.filtered.length,top,window.innerHeight||900);
 if(!force&&view.start===model.start&&view.end===model.end)return;
 const focus=document.activeElement;
 if(focus&&tbody.contains(focus)&&focus.matches('input:not([type="checkbox"]),textarea,select,[contenteditable="true"]'))return;
 replaceWindow(model,tbody,top,window.innerHeight||900);
}
function keyboardAdvance(event){
 if(event.key!=='Tab'||event.defaultPrevented)return;
 const table=event.target?.closest?.('table[data-board-virtual]');
 const model=table&&models.get(table.dataset.groupId);
 const tbody=table?.tBodies[0];
 const row=event.target?.closest?.('tr[aria-rowindex]');
 if(!model||!tbody||!row||!tbody.contains(row))return;
 const rows=[...tbody.querySelectorAll('tr[aria-rowindex]')];
 const last=event.shiftKey?rows[0]:rows.at(-1);
 if(row!==last)return;
 const controls=[...row.querySelectorAll(FOCUSABLE)];
 const boundary=event.shiftKey?controls[0]:controls.at(-1);
 if(event.target!==boundary)return;
 const nextIndex=event.shiftKey?model.start-1:model.end;
 if(nextIndex<0||nextIndex>=model.filtered.length)return;
 event.preventDefault();
 // Keep the next record in the center of the rendered window; normal Tab
 // navigation within each visible row remains native and unmodified.
 const start=Math.max(0,nextIndex-Math.floor(BOARD_WINDOW_SIZE/2));
 const end=Math.min(model.filtered.length,start+BOARD_WINDOW_SIZE);
 model.start=start;model.end=end;
 tbody.innerHTML=spacer(start*BOARD_WINDOW_ROW_HEIGHT,model.colspan)+
  model.renderRows(model.filtered.slice(start,end),start)+
  spacer((model.filtered.length-end)*BOARD_WINDOW_ROW_HEIGHT,model.colspan);
 const target=[...tbody.querySelectorAll('tr[aria-rowindex]')]
  .find(next=>Number(next.getAttribute('aria-rowindex'))===nextIndex+2);
 const nextControls=target?[...target.querySelectorAll(FOCUSABLE)]:[];
 (event.shiftKey?nextControls.at(-1):nextControls[0])?.focus({preventScroll:true});
 target?.scrollIntoView({block:'nearest',inline:'nearest'});
}
export function mountBoardWindows(root,onUpdate=()=>{}){
 if(models.size===0)return;
 mounted=[...root.querySelectorAll('table[data-board-virtual]')]
  .map(table=>({table,model:models.get(table.dataset.groupId)}))
  .filter(pair=>pair.model);
 const refresh=()=>{
  pendingFrame=0;
  for(const {table,model} of mounted){
   if(!table.isConnected)continue;
   updateTable(model,table);
  }
  onUpdate();
 };
 const schedule=()=>{
  if(!pendingFrame)pendingFrame=requestAnimationFrame(refresh);
 };
 window.addEventListener('scroll',schedule,{passive:true});
 root.addEventListener('keydown',keyboardAdvance);
 root.addEventListener('focusout',schedule);
 window.addEventListener('resize',schedule,{passive:true});
 dispose=()=>{
  window.removeEventListener('scroll',schedule);
  root.removeEventListener('keydown',keyboardAdvance);
  root.removeEventListener('focusout',schedule);
  window.removeEventListener('resize',schedule);
 };
 schedule();
}
export function filterBoardWindows(query=''){
 const needle=String(query).toLocaleLowerCase().trim();
 for(const {table,model} of mounted){
  // A repeated query is a no-op: preserve DOM focus/selection and avoid a
  // second full tbody reconstruction during initial board rendering.
  if(model.lastQuery===needle)continue;
  model.lastQuery=needle;
  model.filtered=needle?model.rows.filter((row,index)=>
   model.searchIndex[index].includes(needle)):model.rows;
  table.setAttribute('aria-rowcount',String(model.filtered.length+1));
  updateTable(model,table,{force:true,resetView:true});
 }
 return [...models.values()].reduce((sum,model)=>sum+model.filtered.length,0);
}
