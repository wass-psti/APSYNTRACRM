/** APSYNTRA Board Share 01 — interface and permission-safe preview.
 * External sharing is NOT activated by this module.
 * Backend grants and application-specific data access are mandatory before
 * any invitation link can be generated or redeemed.
 */
import {validUuid} from './data.js';

export const BOARD_SHARE_LINKS_ENABLED=false;
export const BOARD_PRIVACY_MODES=Object.freeze([
 Object.freeze({value:'private',label:'Private',description:'Only separately authorized internal users. Guest invitations are disabled.'}),
 Object.freeze({value:'workspace_restricted',label:'Workspace restricted',description:'Existing signed workspace and resource permissions still apply; guest invitations are disabled.'}),
 Object.freeze({value:'guest_shareable',label:'Guest shareable',description:'Requires an approved server policy and guest-scoped authorization before a link can be issued.'})
]);
/** Conservative examples, not the authoritative server application policy. */
export const SENSITIVE_MODULE_DEFAULTS=Object.freeze(new Set([
 'frt','evaluation','timetracker','charter','aims'
]));
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const denyState=Object.freeze({
 state:'UNAVAILABLE',externalSharing:'unknown',guestLinksEnabled:false,
 mayIssue:false,source:'NO_VERIFIED_SERVER_POLICY'
});

/** Only a verified server receipt can describe a resource's actual sharing policy.
 * Rendering a local role badge or guessing from the module name never authorizes.
 */
export function normalizeBoardSharePolicy(raw,{boardId,workspaceId}={}){
 if(!validUuid(boardId)||!validUuid(workspaceId)||raw?.schemaVersion!==1||
    raw.boardId!==boardId||raw.workspaceId!==workspaceId||
    !BOARD_PRIVACY_MODES.some(mode=>mode.value===raw.externalSharing)||
    typeof raw.guestLinksEnabled!=='boolean'||
    typeof raw.mayIssue!=='boolean')
  return denyState;
 const permitted=raw.externalSharing==='guest_shareable'&&
    raw.guestLinksEnabled===true&&raw.mayIssue===true;
 return Object.freeze({
  state:'VERIFIED_POLICY',externalSharing:raw.externalSharing,
  guestLinksEnabled:raw.guestLinksEnabled,
  mayIssue:BOARD_SHARE_LINKS_ENABLED&&permitted,
  source:'SIGNED_SERVER_RECEIPT'
 });
}

export function boardShareReadiness({board,workspaceId,manage=false,policy=null}={}){
 if(!validUuid(board?.id)||!validUuid(board?.workspace_id)||
    !validUuid(workspaceId)||board.workspace_id!==workspaceId||
    board.status!=='active'||!!board.archived_at||!!board.trashed_at)
  return Object.freeze({allowed:false,reason:'Board is unavailable or outside the signed workspace.'});
 if(manage!==true)
  return Object.freeze({allowed:false,reason:'Only an authorized board manager can create invitation links.'});
 if(!BOARD_SHARE_LINKS_ENABLED)
  return Object.freeze({allowed:false,reason:'Board invitation links are not activated.'});
 if(policy?.state!=='VERIFIED_POLICY'||policy.mayIssue!==true)
  return Object.freeze({allowed:false,reason:'A verified, approved guest-sharing policy is required.'});
 return Object.freeze({allowed:true,reason:'Server authorization must still be rechecked on issuance.'});
}

export function renderBoardSharePreview({board,moduleKey=null,workspaceId,manage=false,policy=null}={}){
 const readiness=boardShareReadiness({board,workspaceId,manage,policy});
 const title=escapeHtml(board?.name||'Unknown board');
 const protectedModule=SENSITIVE_MODULE_DEFAULTS.has(moduleKey);
 const description=protectedModule?
  'This module may contain restricted operational or personal data. External sharing requires independent field-level approval.':
  'No app or board becomes guest-accessible merely because a link control is visible.';
 return '<section class="board-share-stage" role="dialog" aria-modal="true" '+
  'aria-labelledby="board-share-stage-heading" data-board-share-preview>'+
  '<header class="board-share-stage-heading"><h2 id="board-share-stage-heading">Share &amp; access · '+title+'</h2>'+
  '<button type="button" data-board-share-close aria-label="Close board sharing">×</button></header>'+
  '<p>'+escapeHtml(description)+'</p>'+
  '<dl><dt>External sharing</dt><dd>'+
   (policy?.state==='VERIFIED_POLICY'?escapeHtml(policy.externalSharing.replaceAll('_',' ')):
    'Not verified — sharing unavailable')+'</dd>'+
  '<dt>Link permissions</dt><dd>Viewer only (proposed)</dd>'+
  '<dt>Link lifetime</dt><dd>24 hours (proposed)</dd></dl>'+
  '<p role="status" class="board-share-stage-note">'+escapeHtml(readiness.reason)+'</p>'+
  '<p class="board-share-stage-note">Existing internal permissions are unchanged. No invitation link or guest access has been created.</p>'+
  '<button type="button" disabled>Copy guest invitation link — pending backend approval</button>'+
  '<button type="button" data-board-share-close>Close</button></section>';
}

let activeOverlay=null;
export function closeBoardSharePreview(){
 if(!activeOverlay)return;
 const {node,priorFocus,keyHandler}=activeOverlay;
 document.removeEventListener('keydown',keyHandler);
 node.remove();
 activeOverlay=null;
 if(priorFocus?.isConnected)priorFocus.focus();
}

/** DOM-only preview. No database read/write or token persistence.
 * Inject a verified policy in a later controlled increment, not client role guesses.
 */
export function openBoardSharePreview(options={}){
 if(typeof document==='undefined'||!document.body)return null;
 closeBoardSharePreview();
 const priorFocus=document.activeElement;
 const overlay=document.createElement('div');
 overlay.className='board-share-stage-overlay';
 overlay.style.cssText='position:fixed;inset:0;z-index:5000;background:rgba(17,24,39,.65);display:grid;place-items:center;padding:16px';
 overlay.innerHTML='<div style="background:#fff;color:#1d2440;max-width:580px;width:100%;max-height:90vh;overflow:auto;border-radius:16px;padding:24px;box-shadow:0 18px 45px rgba(0,0,0,.22)">'+
 renderBoardSharePreview(options)+'</div>';
 const close=event=>{
  if(event.target===overlay||event.target.closest?.('[data-board-share-close]'))closeBoardSharePreview();
 };
 const keyHandler=event=>{
  if(event.key==='Escape'){event.preventDefault();closeBoardSharePreview();return;}
  if(event.key!=='Tab')return;
  const elements=[...overlay.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled)')];
  if(elements.length===0){event.preventDefault();return;}
  const first=elements[0],last=elements.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 };
 overlay.addEventListener('click',close);
 document.addEventListener('keydown',keyHandler);
 document.body.append(overlay);
 activeOverlay={node:overlay,priorFocus,keyHandler};
 overlay.querySelector('[data-board-share-close]')?.focus();
 return overlay;
}
