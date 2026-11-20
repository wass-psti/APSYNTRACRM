/** Read-only, non-secret operational classification; never probes SMTP by sending. */
import {validWorkspaceSmtpConfig} from './ws02d-smtp.mjs';
const reasonCodes=Object.freeze({
 disabled:'invitation_feature_disabled',
 missing:'delivery_configuration_missing',
 ready:'ready'
});
export function invitationDeliveryReadiness(env){
 const get=k=>env?.get?.(k);
 const edge=get('APSYNTRA_INVITES_EDGE_ENABLED')==='true';
 const transport=get('APSYNTRA_INVITE_TRANSPORT')==='smtp'?'smtp':'resend';
 const from=get('APSYNTRA_INVITE_FROM');
 const callback=get('APSYNTRA_INVITE_APP_URL');
 let appValid=false;
 try{
  const url=new URL(callback);
  appValid=url.protocol==='https:'&&url.hostname.length>0&&url.username===''&&url.password===''&&
   url.hash===''&&/\/$/.test(url.pathname);
 }catch{}
 const provider=transport==='smtp'?validWorkspaceSmtpConfig({
  host:get('APSYNTRA_INVITE_SMTP_HOST'),port:get('APSYNTRA_INVITE_SMTP_PORT'),
  user:get('APSYNTRA_INVITE_SMTP_USER'),
  password:get('APSYNTRA_INVITE_SMTP_PASSWORD'),from
 }):typeof from==='string'&&from.length>0&&
  typeof get('RESEND_API_KEY')==='string'&&get('RESEND_API_KEY').length>0;
 return Object.freeze({ready:edge&&provider&&appValid,
  reason:!edge?reasonCodes.disabled:(!provider||!appValid)?reasonCodes.missing:reasonCodes.ready});
}
export function summarizeInvitationReadiness({workspaceId,authorized,sqlEnabled,delivery}){
 if(typeof workspaceId!=='string'||authorized!==true||typeof sqlEnabled!=='boolean'||
    !delivery||typeof delivery.ready!=='boolean')throw Error('Readiness not verifiable');
 const ready=sqlEnabled&&delivery.ready;
 return Object.freeze({schemaVersion:1,workspaceId,authorized:true,ready,
  reason:!sqlEnabled?reasonCodes.disabled:delivery.reason});
}
