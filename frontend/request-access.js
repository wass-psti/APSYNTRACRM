/** FormSubmit receives access REQUESTS ONLY. No credentials or user creation. */
export const FORM_SUBMIT_RECIPIENT_ALIAS='';
export const REQUEST_RECEIVED_URL='https://wass-psti.github.io/APSYNTRACRM/?request_access=received#/register';
export function formSubmitAction(alias=FORM_SUBMIT_RECIPIENT_ALIAS){
 const recipient=String(alias||'').trim();
 return /^[a-zA-Z0-9_-]{8,128}$/.test(recipient)?'https://formsubmit.co/'+recipient:'';
}
export function validateAccessRequest({name='',email='',consent=false}={}){
 const person=String(name).trim(),address=String(email).trim();
 if(person.length<2||person.length>120||/[\x00-\x1f<>]/.test(person))
  return 'Enter a full name (2–120 characters).';
 if(address.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
  return 'Enter a valid email address.';
 if(!consent)return 'Consent to sending this request to FormSubmit is required.';
 return '';
}
