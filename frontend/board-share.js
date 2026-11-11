/** BS01 — compact, fail-closed Share & Access experience.
 * Presentation only. This module NEVER issues links or mutates Supabase
 * records, policy flags, authentication, board memberships or permissions.
 */
import {validUuid} from './data.js';
import {resourceEmailInviteReadiness,normalizeRecipientEmail} from './resource-email-invitations.js';

export const BOARD_SHARE_LINKS_ENABLED=false;
export const BOARD_PRIVACY_MODES=Object.freeze([
 Object.freeze({value:'private',label:'Private',description:'Only separately authorized internal users. Guest invitations are disabled.'}),
 Object.freeze({value:'workspace_restricted',label:'Workspace restricted',description:'Existing signed workspace and resource permissions still apply; guest invitations are disabled.'}),
 Object.freeze({value:'guest_shareable',label:'Guest shareable',description:'Requires an approved server policy and guest-scoped authorization before a link can be issued.'})
]);
/** Conservative examples only. Server authority must separately approve each app. */
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
const labelForMode=mode=>BOARD_PRIVACY_MODES.find(m=>m.value===mode)?.label||'Unverified';

/** Signed, exact-board policy receipts only; client state never grants access. */
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

/** A count from the verified direct-member snapshot, NOT effective access. */
export function renderBoardSharePreview({board,moduleKey=null,workspaceId,manage=false,
 policy=null,assignedMemberCount=null}={}){
 const title=escapeHtml(board?.name||'Board');
 const protectedModule=SENSITIVE_MODULE_DEFAULTS.has(moduleKey);
 const signed=policy?.state==='VERIFIED_POLICY';
 const mode=signed?labelForMode(policy.externalSharing):'Not verified';
 const status=protectedModule?'Protected app':signed?mode:'Guest links off';
 const description=protectedModule?
  'This application requires separate security review before any external sharing.':
  'Only authorized users can access board data. Guest links are not active.';
 const count=Number.isSafeInteger(assignedMemberCount)&&
   assignedMemberCount>=0&&assignedMemberCount<=300?
   assignedMemberCount:null;
 const memberCaption=count===null?'View assigned board members':
  count+' assigned board member'+(count===1?'':'s');
 const emailReadiness=resourceEmailInviteReadiness({board,workspaceId,manage,moduleKey});
 const local=typeof location!=='undefined'&&
  ['127.0.0.1','localhost'].includes(location.hostname);
 return '<section class="board-share-stage" role="dialog" aria-modal="true" '+
  'aria-labelledby="board-share-stage-heading" data-board-share-preview>'+
  '<header class="board-share-stage-heading">'+
   '<div class="board-share-stage-title"><h2 id="board-share-stage-heading">Share &amp; access</h2>'+
    '<p class="board-share-stage-board">'+title+'</p></div>'+
   '<button type="button" class="board-share-stage-close" data-board-share-close aria-label="Close sharing panel">×</button>'+
  '</header>'+
  '<div class="board-share-stage-section">'+
   '<div class="board-share-stage-row">'+
    '<div class="board-share-stage-icon" aria-hidden="true">♧</div>'+
    '<div class="board-share-stage-copy"><strong>Board privacy</strong>'+
     '<p>'+escapeHtml(description)+'</p></div>'+
    '<span class="board-share-stage-pill" aria-label="Sharing policy status">'+escapeHtml(status)+'</span>'+
   '</div>'+
   (signed?'<p class="board-share-stage-caption">Signed sharing policy: '+escapeHtml(mode)+'</p>':'')+
  '</div>'+
  '<div class="board-share-stage-section">'+
   '<div class="board-share-stage-row">'+
    '<div class="board-share-stage-icon" aria-hidden="true">♙</div>'+
    '<div class="board-share-stage-copy"><strong>People with access</strong>'+
     '<p>'+escapeHtml(memberCaption)+'</p></div>'+
    '<button type="button" class="board-share-stage-secondary" data-board-share-people>View people</button>'+
   '</div>'+
   '<p class="board-share-stage-caption">Assigned members only; inherited administrator access may not appear.</p>'+
  '</div>'+
  '<div class="board-share-stage-section">'+
   '<div class="board-share-stage-row">'+
    '<div class="board-share-stage-icon" aria-hidden="true">✉</div>'+
    '<div class="board-share-stage-copy"><strong>Invite by email</strong>'+
     '<p>Only the named recipient can accept after email verification.</p></div>'+
   '</div>'+
   '<form data-board-share-email-form class="board-share-stage-form" novalidate>'+
    '<label for="board-share-recipient">Recipient email</label>'+
    '<input id="board-share-recipient" type="email" name="recipient" autocomplete="off" '+
      'inputmode="email" spellcheck="false" maxlength="254" '+
      'placeholder="client@example.com" '+(emailReadiness.allowed?'required':'disabled')+'>'+
    '<div class="board-share-stage-permission">'+
     '<span>Access level</span><strong>Viewer · '+(moduleKey?'Application':'Board')+' only</strong>'+
    '</div>'+
    '<button type="submit" class="board-share-stage-primary" '+
      (emailReadiness.allowed?'':'disabled')+'>Send invitation</button>'+
   '</form>'+
   '<p class="board-share-stage-caption" data-board-share-feedback role="status">'+
    escapeHtml(emailReadiness.reason)+'</p>'+
   '<p class="board-share-stage-caption">No public invite links. '+ 
    'Guests do not automatically join the company workspace.</p>'+
  '</div>'+
  (local?'<details class="board-share-stage-dev"><summary>Local development tools</summary>'+
    '<p>Use sample boards and simulated users. No Supabase records are shared.</p>'+
    '<button type="button" data-board-share-lab>Open invitation lab (demo)</button>'+
   '</details>':'')+
 '</section>';
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

/** DOM-only viewer: open actual People dialog via existing signed route.
 * No new RPC or copy-link endpoint is introduced.
 */
export function openBoardSharePreview(options={}){
 if(typeof document==='undefined'||!document.body)return null;
 closeBoardSharePreview();
 const priorFocus=document.activeElement;
 const overlay=document.createElement('div');
 overlay.className='board-share-stage-overlay';
 const frame=document.createElement('div');
 frame.className='board-share-stage-frame';
 frame.innerHTML=renderBoardSharePreview(options);
 overlay.append(frame);
 const form=overlay.querySelector('[data-board-share-email-form]');
 const formSubmit=event=>{
  event.preventDefault();
  const feedback=overlay.querySelector('[data-board-share-feedback]');
  if(!form||!feedback)return;
  const email=normalizeRecipientEmail(form.querySelector('[name="recipient"]')?.value);
  if(!email){feedback.textContent='Enter one valid email address.';return;}
  // No client-only invitation is ever considered sent. Server integration
  // requires independent admission, RLS, RPC and delivery approval.
  feedback.textContent='Invitations are not activated. No email was sent.';
 };
 form?.addEventListener('submit',formSubmit);
 const click=event=>{
  if(event.target.closest?.('[data-board-share-people]')){
   closeBoardSharePreview();
   document.querySelector('#app .page-head [data-action="board-members"]')?.click();
   return;
  }
  if(event.target.closest?.('[data-board-share-lab]')){
   if(typeof location!=='undefined'&&
    ['127.0.0.1','localhost'].includes(location.hostname))
    window.open('http://127.0.0.1:8765/','_blank','noopener,noreferrer');
   return;
  }
  if(event.target===overlay||event.target.closest?.('[data-board-share-close]'))
   closeBoardSharePreview();
 };
 const keyHandler=event=>{
  if(event.key==='Escape'){event.preventDefault();closeBoardSharePreview();return;}
  if(event.key!=='Tab')return;
  const elements=[...overlay.querySelectorAll(
   'button:not(:disabled),summary,a[href],input:not(:disabled)')];
  if(!elements.length){event.preventDefault();return;}
  const first=elements[0],last=elements.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 };
 overlay.addEventListener('click',click);
 document.addEventListener('keydown',keyHandler);
 document.body.append(overlay);
 activeOverlay={node:overlay,priorFocus,keyHandler};
 overlay.querySelector('[data-board-share-close]')?.focus();
 return overlay;
}
