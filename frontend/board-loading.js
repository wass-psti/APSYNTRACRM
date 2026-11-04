/** APSYNTRA CRM board-only loading presentation.
 * The existing signed board loader controls mount/unmount; no artificial delay,
 * progress percentage, third-party renderer, or persistent animation loop.
 */
const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

export function renderBoardLoading({hidden=false,lowPower=false}={}){
 return `<div class="page-head aps-board-loading-head">
  <div><span class="label-top">Workspace / Board</span>
   <h1>Loading board…</h1>
   <p>Preparing your authorized board workspace.</p></div>
 </div>
 <section class="panel aps-board-loading" aria-label="Board initialization"
  data-paused="${hidden?'true':'false'}" data-quality="${lowPower?'low':'full'}">
  <div class="aps-board-loading-stage">
   <div class="aps-board-loading-visual" aria-hidden="true">
    <span class="aps-board-loading-halo"></span>
    <span class="aps-board-loading-orbit aps-board-loading-orbit-outer"></span>
    <span class="aps-board-loading-orbit aps-board-loading-orbit-inner"></span>
    <span class="aps-board-loading-core"><span class="aps-board-loading-glyph">A</span></span>
    <span class="aps-board-loading-satellite aps-board-loading-satellite-a"></span>
    <span class="aps-board-loading-satellite aps-board-loading-satellite-b"></span>
   </div>
   <div class="aps-board-loading-copy" role="status" aria-live="polite" aria-atomic="true">
    <span class="aps-board-loading-eyebrow">APSYNTRA / SECURE BOARD</span>
    <h2>Preparing your board</h2>
    <p class="aps-board-loading-message">Retrieving authorized board details…</p>
    <div class="aps-board-loading-progress" aria-hidden="true">
     <span class="aps-board-loading-progress-beam"></span>
    </div>
    <p class="aps-board-loading-caption">Loading the latest permitted board data. No changes are being made.</p>
   </div>
  </div>
  <div class="aps-board-loading-preview" aria-hidden="true">
   <div class="aps-board-loading-preview-header">
    <span class="aps-board-loading-preview-chip"></span>
    <span class="aps-board-loading-preview-chip aps-board-loading-preview-chip-short"></span>
    <span class="aps-board-loading-preview-chip aps-board-loading-preview-chip-short"></span>
   </div>
   <div class="aps-board-loading-preview-row">
    <span class="aps-board-loading-preview-bar aps-board-loading-preview-bar-long"></span>
    <span class="aps-board-loading-preview-bar"></span>
    <span class="aps-board-loading-preview-bar aps-board-loading-preview-bar-short"></span>
   </div>
   <div class="aps-board-loading-preview-row">
    <span class="aps-board-loading-preview-bar aps-board-loading-preview-bar-medium"></span>
    <span class="aps-board-loading-preview-bar aps-board-loading-preview-bar-short"></span>
    <span class="aps-board-loading-preview-bar"></span>
   </div>
  </div>
 </section>`;
}

export function renderBoardLoadingError(message){
 return `<section class="panel aps-board-loading-error" role="alert" aria-live="assertive">
  <span class="aps-board-loading-error-symbol" aria-hidden="true">!</span>
  <div><h2>Board unavailable</h2>
   <p>${escapeText(message||'Unable to access this board.')}</p>
   <a class="secondary" href="#/boards">Back to boards</a></div>
 </section>`;
}

/** A single already-existing document visibility handler owns this toggle.
 * Detached loading markup has no event listeners or GPU resources to dispose.
 */
export function setBoardLoadingVisibility(root,hidden=false){
 const panel=root?.querySelector?.('.aps-board-loading');
 if(panel)panel.dataset.paused=hidden?'true':'false';
}
