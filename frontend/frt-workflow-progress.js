/** Explain the existing, signed FRT lifecycle; never authorize a mutation. */
const validStatuses=new Set(['PENDING_APPROVAL','IN_PROGRESS','DONE','BLOCKED','CLOSED','REJECTED']);
const validLiquidation=new Set(['NOT_SUBMITTED','SUBMITTED','UNDER_REVIEW','APPROVED','RETURNED']);
const step=(title,state,detail)=>Object.freeze({title,state,detail});
export function projectFRTWorkflowProgress(detail){
 if(!detail||!validStatuses.has(detail.status)||!validLiquidation.has(detail.liquidationStatus)||
    typeof detail.financeApproved!=='boolean'||
    typeof detail.transferConfirmed!=='boolean'||typeof detail.closed!=='boolean')
  return null;
 const stopped=detail.status==='REJECTED',blocked=detail.status==='BLOCKED';
 const finance=detail.financeApproved?step('Finance approval','complete','Finance approval recorded'):
  stopped?step('Finance approval','stopped','Request rejected'):
  blocked?step('Finance approval','attention','Request blocked for review'):
  step('Finance approval','pending','Awaiting finance decision');
 const gm=detail.transferConfirmed?step('General Manager verification','complete',
  'GM verification recorded; this is not proof of bank transfer'):
  step('General Manager verification',stopped?'not-applicable':'pending',
   stopped?'Not applicable after rejection':'Verification not recorded');
 const liquidation=detail.liquidationStatus==='APPROVED'?
  step('Liquidation','complete','Liquidation approved'):
  detail.liquidationStatus==='UNDER_REVIEW'?
   step('Liquidation','in-progress','Submitted liquidation under review'):
  detail.liquidationStatus==='SUBMITTED'?
   step('Liquidation','in-progress','Submitted; awaiting review'):
  detail.liquidationStatus==='RETURNED'?
   step('Liquidation','attention','Returned for correction'):
   step('Liquidation',stopped?'not-applicable':'pending',
    stopped?'Not applicable after rejection':'Not submitted');
 const closing=detail.closed?step('Close request','complete','Request closed'):
  step('Close request',stopped?'not-applicable':'pending',
   stopped?'Rejected request':'Not closed');
 return Object.freeze([
  step('Request registered','complete','Signed fund request exists'),
  finance,gm,liquidation,closing
 ]);
}
