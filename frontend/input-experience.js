/** APSYNTRA CRM — shared accessible input field presentation.
 * Progressive enhancement only. Native input/textarea elements remain in place,
 * with unchanged values, names, validation rules, event handlers and form APIs.
 * Does not replace search/selection controls or protected server-side checks.
 */
import {createLucideActionIcon} from './action-menu-experience.js';

export const FORM_FIELD_SELECTOR=
 'input:not([type="search"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([type="color"]):not([type="submit"]):not([type="reset"]):not([type="button"]):not([type="image"]),textarea';
export const FORM_FIELD_TYPES=Object.freeze([
 'text','email','password','tel','url','number','date','time',
 'datetime-local','month','week'
]);
// Native date/time pickers do not display placeholder text. Keep their
// platform controls intact while guiding every text-like field, including search.
export const PLACEHOLDER_FIELD_SELECTOR=
 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([type="color"]):not([type="submit"]):not([type="reset"]):not([type="button"]):not([type="image"]):not([type="date"]):not([type="time"]):not([type="datetime-local"]):not([type="month"]):not([type="week"]):not([readonly]),textarea:not([readonly])';
const SEARCH_LABELS=Object.freeze({
 'board-search':'boards','search-issues':'issues','search-board-items':'board items',
 'search-system-roles':'roles','search-workspace-members':'workspace members',
 'filter-role-permission-modules':'application modules','search-role-proposals':'role proposals',
 'tt-log-search':'attendance logs','tt-report-search':'attendance reports',
 'tt-team-search':'team members','tt-ot-search':'overtime requests',
 'ft3-request-search':'fuel requests','ft3-activity-search':'fuel activity',
 'ft3-signed-request-search':'fuel requests','mrh-tracker-search':'materials and RFQs',
 'tb-search-text':'issues','teams-search':'teams','teams-user-search':'team members',
 'teams-content-search':'team content','apsm-home-search':'applications',
 'tl-manual-search-input':'manual topics','board-activity-search':'board activity',
 'board-hide-search':'columns','structure-column-search':'columns',
 'tt-employees-search':'employees','tt-log-search':'attendance logs'
});
function humanizeFieldName(value){
 return String(value||'').replace(/([a-z0-9])([A-Z])/g,'$1 $2')
  .replace(/[_-]+/g,' ').replace(/\b(id|url|tin|rfq|po|php)\b/gi,m=>m.toUpperCase())
  .replace(/\s+/g,' ').trim().replace(/\s*\*+\s*$/,'')
  .replace(/\s*\([^)]*required[^)]*\)/ig,'');
}
export function describePlaceholder(control){
 if(!control||!['INPUT','TEXTAREA'].includes(control.tagName)||
    control.disabled||control.readOnly)return '';
 const type=String(control.type||'text').toLowerCase();
 const name=String(control.name||control.id||'');
 if(!['text','email','password','tel','url','number','search'].includes(type)&&control.tagName!=='TEXTAREA')return '';
 if(type==='date'||type==='time'||type==='datetime-local'||type==='month'||type==='week')return '';
 let label=String(control.getAttribute?.('aria-label')||'').trim();
 if(!label&&control.labels?.length)label=control.labels[0].textContent||'';
 if(!label)label=control.closest?.('label')?.textContent||'';
 if(!label)label=control.getAttribute?.('title')||'';
 label=humanizeFieldName(label).replace(/\s+/g,' ').trim();
 const isSearch=type==='search'||control.classList?.contains?.('search-input')||
  control.getAttribute?.('inputmode')==='search'||/^(search|filter)\b/i.test(label);
 if(isSearch){
  const subject=SEARCH_LABELS[name]||label.replace(/^search\s*/i,'').replace(/^filter\s*/i,'')||
   humanizeFieldName(name).replace(/\s*search$/i,'').replace(/^search\s*/i,'')||'records';
  const action=/^filter\b/i.test(label)?'Filter':'Search';
  return action+' '+subject.toLocaleLowerCase()+'...';
 }
 if(!label)label=humanizeFieldName(name);
 if(!label)return '';
 if(/^enter\b/i.test(label)||/^describe\b/i.test(label)||
    /^write\b/i.test(label)||/^add\b/i.test(label))return label;
 if(type==='email'&&!/email/i.test(label))return 'Enter email address';
 if(type==='tel'&&!/phone|telephone|mobile|contact number/i.test(label))return 'Enter phone number';
 if(type==='url'&&!/url|website|link/i.test(label))return 'Enter web address';
 if(type==='password')return 'Enter '+label.toLocaleLowerCase();
 return 'Enter '+label.toLocaleLowerCase();
}
function enhancePlaceholder(control){
 if(!control||control.hasAttribute?.('placeholder'))return false;
 const placeholder=describePlaceholder(control);
 if(!placeholder)return false;
 control.setAttribute('placeholder',placeholder);
 control.classList?.add?.('aps-placeholder-enhanced');
 return true;
}
let feedbackId=0;

export function isFormField(control){
 if(!control||!['INPUT','TEXTAREA'].includes(control.tagName)||
    control.disabled||control.readOnly||
    control.hasAttribute?.('data-aps-input-native')||
    control.closest?.('[data-aps-input-native]')||
    control.closest?.('.aps-search-field')||
    control.classList?.contains?.('search-input'))return false;
 if(control.tagName==='TEXTAREA')return true;
 const type=String(control.type||'text').toLowerCase();
 return FORM_FIELD_TYPES.includes(type);
}

/** Generic validation messages never repeat entered values (including secrets). */
export function describeFieldValidity(control){
 const v=control?.validity;
 if(!v||v.valid)return '';
 if(v.valueMissing)return 'This field is required.';
 if(v.typeMismatch){
  if(control.type==='email')return 'Enter a valid email address.';
  if(control.type==='url')return 'Enter a valid web address.';
  return 'Enter a valid value for this field.';
 }
 if(v.badInput)return 'Enter a valid number, date, or time.';
 if(v.patternMismatch)return 'Use the required format.';
 if(v.tooShort){
  const n=Number(control.minLength);
  return Number.isInteger(n)&&n>0?'Use at least '+n+' characters.':
   'The entry is too short.';
 }
 if(v.tooLong){
  const n=Number(control.maxLength);
  return Number.isInteger(n)&&n>0?'Use no more than '+n+' characters.':
   'The entry is too long.';
 }
 if(v.rangeUnderflow){
  const lower=String(control.min||'').slice(0,80);
  return lower?'Enter a value on or after '+lower+'.':'The value is below the allowed minimum.';
 }
 if(v.rangeOverflow){
  const upper=String(control.max||'').slice(0,80);
  return upper?'Enter a value on or before '+upper+'.':'The value exceeds the allowed maximum.';
 }
 if(v.stepMismatch)return 'Use an allowed increment.';
 if(v.customError)return 'Review the required value for this field.';
 return 'Review this field before continuing.';
}
export function appendDescriptionId(value,id){
 const names=String(value||'').trim().split(/\s+/).filter(Boolean);
 if(!names.includes(id))names.push(id);
 return names.join(' ');
}
export function removeDescriptionId(value,id){
 return String(value||'').trim().split(/\s+/).filter(Boolean)
  .filter(name=>name!==id).join(' ');
}
function showErrorAnimation(node,doc){
 const win=doc?.defaultView||globalThis.window;
 if(typeof node.animate!=='function'||
    win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
 node.animate([
  {opacity:0,transform:'translateY(-3px)'},
  {opacity:1,transform:'translateY(0)'}
 ],{duration:145,easing:'cubic-bezier(.2,.75,.3,1)'});
}
/** Mutation-aware, no polling. Every input has its own disposable listeners. */
export function startInputExperience(root=globalThis.document?.body){
 const doc=root?.ownerDocument||globalThis.document;
 if(!root?.querySelectorAll||!doc||typeof MutationObserver!=='function')
  return ()=>{};
 const controllers=new Map();
 let running=true;
 function attach(control){
  if(!running||!control.isConnected||controllers.has(control)||
     !isFormField(control))return;
  const controllerAbort=new AbortController();
  const feedback=doc.createElement('span');
  const message=doc.createElement('span');
  const icon=createLucideActionIcon('circle-alert',doc);
  const id='aps-field-validation-'+(++feedbackId);
  feedback.id=id;
  feedback.className='aps-field-feedback';
  if(control.closest?.('.board-inline-add-form,.board-inline-cell-form,.board-inline-range'))
   feedback.classList.add('aps-field-feedback-compact');
  feedback.hidden=true;
  feedback.setAttribute('role','status');
  feedback.setAttribute('aria-live','polite');
  feedback.setAttribute('aria-atomic','true');
  if(icon)feedback.append(icon);
  message.className='aps-field-message';
  feedback.append(message);
  control.insertAdjacentElement('afterend',feedback);
  const originalInvalid=control.getAttribute('aria-invalid');
  let interacted=false,shown=false,disposed=false,ownInvalid=false;
  control.classList.add('aps-field-control');
  function removeOwnDescription(){
   const updated=removeDescriptionId(control.getAttribute('aria-describedby'),id);
   if(updated)control.setAttribute('aria-describedby',updated);
   else control.removeAttribute('aria-describedby');
  }
  function restoreInvalid(){
   if(!ownInvalid)return;
   if(originalInvalid===null)control.removeAttribute('aria-invalid');
   else control.setAttribute('aria-invalid',originalInvalid);
   ownInvalid=false;
  }
  function refresh(){
   if(disposed||!control.isConnected)return;
   if(control.disabled||control.readOnly){
    feedback.hidden=true;message.textContent='';shown=false;
    removeOwnDescription();restoreInvalid();
    control.classList.remove('aps-field-invalid','aps-field-valid');
    return;
   }
   const needsCheck=interacted||ownInvalid;
   const error=needsCheck?describeFieldValidity(control):'';
   const invalid=!!error;
   control.classList.toggle('aps-field-invalid',invalid);
   control.classList.toggle('aps-field-valid',
    needsCheck&&!invalid&&String(control.value||'').length>0);
   if(!invalid){
    feedback.hidden=true;message.textContent='';shown=false;
    removeOwnDescription();restoreInvalid();return;
   }
   control.setAttribute('aria-invalid','true');ownInvalid=true;
   control.setAttribute('aria-describedby',
    appendDescriptionId(control.getAttribute('aria-describedby'),id));
   if(message.textContent!==error)message.textContent=error;
   feedback.hidden=false;
   if(!shown){shown=true;showErrorAnimation(feedback,doc);}
  }
  function onInput(){if(interacted)refresh();}
  function onChange(){if(interacted)refresh();}
  function onBlur(){interacted=true;refresh();}
  function onInvalid(){
   // Do not preventDefault: preserve native form validation and focus handling.
   interacted=true;refresh();
  }
  function reset(){
   interacted=false;shown=false;
   removeOwnDescription();restoreInvalid();
   refresh();
  }
  function destroy(){
   if(disposed)return;
   disposed=true;controllerAbort.abort();
   feedback.remove();
   control.classList.remove('aps-field-control','aps-field-invalid','aps-field-valid');
   removeOwnDescription();restoreInvalid();
   controllers.delete(control);
  }
  control.addEventListener('input',onInput,{signal:controllerAbort.signal});
  control.addEventListener('change',onChange,{signal:controllerAbort.signal});
  control.addEventListener('blur',onBlur,{signal:controllerAbort.signal});
  control.addEventListener('invalid',onInvalid,{signal:controllerAbort.signal});
  controllers.set(control,{control,destroy,reset,refresh});
 }
 function scan(node){
  if(node?.nodeType!==1)return;
  if(node.matches?.(FORM_FIELD_SELECTOR))attach(node);
  node.querySelectorAll?.(FORM_FIELD_SELECTOR).forEach(attach);
  if(node.matches?.(PLACEHOLDER_FIELD_SELECTOR))enhancePlaceholder(node);
  node.querySelectorAll?.(PLACEHOLDER_FIELD_SELECTOR).forEach(enhancePlaceholder);
 }
 const observer=new MutationObserver(records=>{
  if(!running)return;
  for(const record of records)
   if(record.type==='childList')record.addedNodes.forEach(scan);
  for(const controller of controllers.values())
   if(!controller.control.isConnected)controller.destroy();
 });
 observer.observe(root,{childList:true,subtree:true});
 const reset=event=>{
  const form=event.target;
  if(form?.tagName!=='FORM')return;
  queueMicrotask(()=>{
   for(const controller of controllers.values())
    if(form.contains?.(controller.control))controller.reset();
  });
 };
 doc.addEventListener('reset',reset,true);
 scan(root);
 return ()=>{
  if(!running)return;
  running=false;observer.disconnect();doc.removeEventListener('reset',reset,true);
  for(const controller of controllers.values())controller.destroy();
  controllers.clear();
 };
}
