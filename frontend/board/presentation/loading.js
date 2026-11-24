/** APSYNTRA CRM board/application loading presentation.
 * The existing signed board loader controls mount/unmount; no artificial delay,
 * progress percentage, third-party renderer, or persistent animation loop.
 */
const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

const logoUrl=new URL('../../apsyntra-logo.webp',import.meta.url).href;

/** One brand-neutral splash for boards and embedded applications. */
export function renderBoardLoading({hidden=false,lowPower=false}={}){
 return `<div class="apx-loader" role="status" aria-live="polite" aria-atomic="true"
  data-paused="${hidden?'true':'false'}" data-quality="${lowPower?'low':'full'}">
  <div class="apx-loader__inner">
   <img class="apx-loader__logo" src="${logoUrl}" alt="" width="64" height="64">
   <div><p class="apx-loader__title">APSYNTRA <span>CRM</span></p>
    <p class="apx-loader__sub">Loading your workspace…</p></div>
   <div class="apx-loader__track" aria-hidden="true"><div class="apx-loader__bar"></div></div>
  </div>
 </div>`;
}

export function renderBoardLoadingError(message,{application='Board'}={}){
 const title=application==='TimeTracker'?'TimeTracker':'Board';
 return `<section class="panel aps-board-loading-error" role="alert" aria-live="assertive">
  <span class="aps-board-loading-error-symbol" aria-hidden="true">!</span>
  <div><h2>${title} unavailable</h2>
   <p>${escapeText(message||'Unable to access this workspace.')}</p>
   <a class="secondary" href="#/boards">Back to boards</a></div>
 </section>`;
}

/** A single already-existing document visibility handler owns this toggle.
 * Detached loading markup has no event listeners or GPU resources to dispose.
 */
export function setBoardLoadingVisibility(root,hidden=false){
 const panel=root?.querySelector?.('.apx-loader');
 if(panel)panel.dataset.paused=hidden?'true':'false';
}
