// Partial native conversion of src/generated/components/CreateTicketTab.jsx.
// The original has five form stages. Native conversion now has batch stations,
// saved drafts, creation evidence and historical station suggestions. Rich text,
// authoritative personnel and server-allocated FTS numbering remain incomplete.
import {validateTicketForm,createTicketRecord} from './ticket-domain.js';
import {SYSTEM_TYPES} from './queue-filters15.js';
export {SYSTEM_TYPES};
export const IMPACTS=Object.freeze(['Informational','Minor Degradation','Partial Service Interruption','Major Service Interruption','Complete Station Outage']);
export const CHANNELS=Object.freeze(['Phone Call','Email or Message','Client Portal','Internal Monitoring','Walk-in Report']);
export const SOURCE_CREATE_STEPS=Object.freeze(['Client & Location','Classification','Issue Details','Contact','Review']);
const optional=(value,max,label)=>{const v=String(value??'').trim();if(v.length>max)throw Error(`${label} is too long.`);return v;};
function boundedCount(raw,max,label,{whole=false,positive=false}={}){
 const value=String(raw??'').trim();if(!value)return null;
 if(!/^\d+(?:\.\d+)?$/.test(value))throw Error(`${label} must be numeric.`);
 const n=Number(value);
 if(!Number.isFinite(n)||n>max||n<0||(positive&&n<=0)||(whole&&!Number.isInteger(n)))throw Error(`Invalid ${label.toLowerCase()}.`);
 return n;
}
export function validateSourceTicketDraft(form,member){
 const raw=form??{};
 const core=validateTicketForm({client:raw.client,title:raw.title,description:raw.description,priority:raw.priority,stationId:raw.stationId,stationName:raw.stationName,systemType:raw.systemType,impactLevel:raw.impactLevel,reportingChannel:raw.reportingChannel},member);
 if(core.name.length<5)throw Error('Ticket title requires at least 5 characters.');
 if(core.details.length<20)throw Error('Issue details require at least 20 characters.');
 if(core.stationId.length<3||core.stationName.length<3)throw Error('Station ID and station name require at least 3 characters each.');
 if(!SYSTEM_TYPES.includes(core.systemType))throw Error('Choose a source-defined system type.');
 if(!IMPACTS.includes(core.impactLevel))throw Error('Choose a source-defined impact level.');
 if(!CHANNELS.includes(core.reportingChannel))throw Error('Choose a source-defined reporting channel.');
 const downtimeMinutes=boundedCount(raw.downtimeMinutes,525600,'Downtime');
 const affectedTerminals=boundedCount(raw.affectedTerminals,10000,'Affected terminals',{whole:true});
 const errorCode=optional(raw.errorCode,50,'Error code');
 const contactName=optional(raw.contactName,120,'Contact name');
 const contactPhone=optional(raw.contactPhone,50,'Contact phone');
 const escalationJustification=optional(raw.escalationJustification,500,'Escalation justification');
 const affectedTransactions=boundedCount(raw.affectedTransactions,100000000,'Affected transactions',{whole:true,positive:true});
 if(core.priority==='Critical'&&(escalationJustification.length<10||affectedTransactions===null))throw Error('Critical priority requires justification (10+ characters) and affected transactions greater than zero.');
 const handoverFlag=raw.handoverFlag===true||raw.handoverFlag==='on';
 return Object.freeze({...core,downtimeMinutes,affectedTerminals,errorCode,contactName,contactPhone,escalationJustification:core.priority==='Critical'?escalationJustification:'',affectedTransactions:core.priority==='Critical'?affectedTransactions:null,handoverFlag});
}
// Intentionally calculates in the user's local browser timezone, like source getAutoInfo.
// Never substitutes this metadata for server-side SLA enforcement.
export function sourceOperationalInfo(date=new Date()){
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))throw Error('Invalid creation timestamp.');
 const hour=date.getHours(),minute=date.getMinutes();
 const opDate=new Date(date.getTime());if(hour<6)opDate.setDate(opDate.getDate()-1);
 const nearBoundary=(hour*60+minute>=300&&hour*60+minute<=420)||(hour*60+minute>=1020&&hour*60+minute<=1140);
 return Object.freeze({shift:hour>=6&&hour<18?'Shift A':'Shift B',operationalDate:opDate.toISOString(),nearBoundary});
}
export function buildSourceTicketRecord(valid,member,user,meta){
 if(!meta||typeof meta.now!=='string'||!Number.isFinite(Date.parse(meta.now)))throw Error('Missing valid creation time.');
 const row=createTicketRecord(valid,member,user,meta);
 const p={...row.payload};
 const info=sourceOperationalInfo(new Date(meta.now));
 p.reportingShift=info.shift;p.operationalDate=info.operationalDate;
 p.handoverFlag=valid.handoverFlag;p.handoverFlaggedAt=valid.handoverFlag?meta.now:null;
 p.downtimeMinutes=valid.downtimeMinutes;
 // Preserve source's human-readable metadata in ticket issue details; avoid executable markup.
 const metadata=[];
 if(valid.contactName||valid.contactPhone)metadata.push(`--- Reporter Contact ---\nName: ${valid.contactName||'N/A'}\nPhone: ${valid.contactPhone||'N/A'}`);
 if(valid.affectedTerminals!==null)metadata.push(`Affected Terminals/Lanes: ${valid.affectedTerminals}`);
 if(valid.errorCode)metadata.push(`Error Code/Reference: ${valid.errorCode}`);
 if(valid.priority==='Critical')metadata.push(`--- Critical Escalation ---\nJustification: ${valid.escalationJustification}\nEst. Affected Transactions: ${valid.affectedTransactions}`);
 if(metadata.length)p.issueDetails=`${valid.details}\n\n${metadata.join('\n')}`;
 return {...row,payload:p};
}
