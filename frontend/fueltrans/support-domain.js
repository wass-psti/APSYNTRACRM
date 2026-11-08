// Ported standalone issue-report contract: source utils/bugSupportStore.js.
// The temporary backend contract is PRIVATE per-user state, NOT shared IT delivery.
export const BUG_STATE_KEY='standalone_bug_reports_v1';
export const BUG_STATUSES=Object.freeze(['New','Investigating','Under Fix','Resolved']);
export const BUG_SEVERITIES=Object.freeze(['low','medium','high','critical']);
export function validateBugDraft(input){
 const title=String(input?.title||'').trim();
 const description=String(input?.description||'').trim();
 const severity=String(input?.severity||'medium').trim();
 const steps=String(input?.steps||'').trim();
 if(title.length<5||title.length>160)throw Error('Bug title must contain 5–160 characters.');
 if(description.length<10||description.length>6000)throw Error('Bug description must contain 10–6,000 characters.');
 if(steps.length>4000)throw Error('Steps to reproduce are too long.');
 if(!BUG_SEVERITIES.includes(severity))throw Error('Invalid bug severity.');
 return {title,description,severity,steps};
}
export function normalizeBugState(row){
 const items=Array.isArray(row?.value?.items)?row.value.items:[];
 return {revision:row?Number(row.revision):0,items:items.filter(item=>typeof item?.id==='string'&&typeof item?.title==='string')};
}
export function makeBugDraft(valid,user,now,id){
 if(!user?.id||!/^[a-f0-9-]{36}$/i.test(id)||Number.isNaN(Date.parse(now)))throw Error('Invalid identity or draft reference.');
 return {id,...valid,createdBy:user.id,createdAt:now,updatedAt:now,status:'New',messages:[],delivery:'private_draft'};
}
export function replaceBug(items,updated){return items.map(item=>item.id===updated.id?updated:item);}
export function findBug(items,id){return items.find(item=>item.id===id)||null;}
// Labels are from the original LogoFilesView.jsx catalog, with URLs unchanged.
export const LOGO_CATALOG=Object.freeze([
 {name:'UNIOIL',file:'unioil.png',category:'Client',url:'https://files-public.monday.com/use1/cc2b4903-5656-4569-9cc6-014b2400f268/unioil.png'},
 {name:'ARAMCO',file:'aramco.png',category:'Client',url:'https://files-public.monday.com/use1/fbd5ded4-329c-4a44-83df-3ea606d77ba9/aramco.png'},
 {name:'PETRON',file:'petron.png',category:'Client',url:'https://files-public.monday.com/use1/df56ea2a-fbf3-4090-8745-7a9393379042/petron.png'},
 {name:'REPHIL',file:'rephil.png',category:'Client',url:'https://files-public.monday.com/use1/e44389cf-3fe2-4d0e-9e9a-ff8730ff8b78/rephil.png'},
 {name:'Fueltrans',file:'FueltransLogo.png',category:'Internal',url:'https://files-public.monday.com/use1/07c6a098-3745-4d1e-8c75-8d02e60a35ee/FueltransLogo.png'},
 {name:'Watchdog Automation',file:'WALogoRed copy 3.png',category:'Internal',url:'https://files-public.monday.com/use1/9ad53c47-7a26-4852-9137-52e42466c5cd/WALogoRed copy 3.png'},
 {name:'WASS',file:'waass.png',category:'Internal',url:'https://files-public.monday.com/use1/352a72da-310b-421d-bd85-5054c7b1ba33/waass.png'},
 {name:'Watchdog Automation 2',file:'wassLogo.png',category:'Internal',url:'https://files-public.monday.com/use1/2a62aca8-f43d-4dbe-8b56-c9e3727ee7ee/wassLogo.png'}
]);

// Backend schema mismatch is different from RLS denial or an ordinary request failure.
export function missingSharedIssueSchema(error){
 const message=String(error?.message||'');
 const code=String(error?.code||'');
 return code==='PGRST205' || (message.includes("fueltrans_issue_reports") && /schema cache|could not find the table/i.test(message));
}
