/** Non-destructive presentation refresh of an already authorized board.
 * The caller alone decides the signed board identity, grants and fetch lifecycle.
 */
import {captureBoardGroupScroll,restoreBoardGroupScroll} from './board-scroll-state.js';

export function canRetainVisibleBoard(state,{boardId,tab,userId,signed}={}){
 return signed===true&&state?.view==='board'&&state.boardId===boardId&&
  state.tab===tab&&!state.loading&&!state.error&&
  ['items','sourcing'].includes(tab)&&state.context?.user_id===userId&&
  state.board?.board?.id===boardId&&
  state.board.board.workspace_id===state.context?.workspace_id;
}

export function replaceVisibleBoardContent(root,html,{onMounted=()=>{}}={}){
 const existing=root?.querySelector?.('[data-board-live-content]');
 if(!existing||typeof html!=='string')return false;
 const doc=existing.ownerDocument,template=doc.createElement('template');
 template.innerHTML=html;
 const replacement=template.content.querySelector('[data-board-live-content]');
 if(!replacement)return false;
 const priorScroll=captureBoardGroupScroll(existing);
 const win=doc.defaultView,top=win?.scrollY;
 existing.replaceWith(replacement);
 restoreBoardGroupScroll(replacement,priorScroll);
 if(Number.isFinite(top)&&win?.scrollY!==top)win.scrollTo(0,top);
 onMounted();
 return true;
}
