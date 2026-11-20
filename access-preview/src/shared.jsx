import React,{useEffect,useRef,useState} from 'react';

export const teams=[
 ['engineering','Engineering',16],['finance','Finance',3],['general','General administration',1],
 ['hr','HR/Admin',3],['it','Information Technology (IT)',2],
 ['materials','Materials & logistics',5],['sales','Sales & marketing',3]
].map(([id,name,count])=>({id,name,count,isSystem:id==='general'}));

export const persons=[
 {id:'lex',name:'Lex Mariun B. Señagan',email:'lmsenagan@watchdogautomation.com.ph',
  title:'IT Support Specialist I',initials:'LS',owner:true},
 {id:'lucky',name:'Lucky Ampalayohan',email:'lampalayohan@watchdogautomation.com.ph',
  title:'OJT - IT Specialists',initials:'LA',owner:false}
];
export const boards=[
 {id:'daily',name:'I.T - Daily Activities',role:'editor'},
 {id:'requests',name:'Work Requests',role:'editor'},
 {id:'files',name:'Files',role:'viewer'}
];

export const apps={
 fueltrans:{name:'FuelTrans Standalone',roles:[['Requester',14],['Approver',3],['Dispatcher',4],['Auditor',2],['App administrator',1]],
  features:[['Fuel requests','view create edit delete approve export'],
  ['Fuel deliveries','view create edit delete approve export'],
  ['Station directory','view create edit delete export'],['Reports','view export']],
  selected:['Fuel requests:view','Fuel requests:edit','Fuel requests:approve','Fuel requests:export',
   'Fuel deliveries:view','Fuel deliveries:approve','Fuel deliveries:export','Station directory:view',
   'Reports:view','Reports:export'],
  description:'Reviews and signs off fuel requests raised by requesters.'},
 traceability:{name:'Tool Traceability',roles:[['User',12],['Logistics',5],['Auditor',2],['App administrator',1]],
  features:[['Tool inventory','view create edit export'],['Tool transfers','view create edit approve export'],['Reports','view export']],
  selected:['Tool inventory:view','Tool transfers:view','Reports:view','Reports:export'],
  description:'Manages tool inventory and transfers.'},
 intake:{name:'Order Intake',roles:[['Requester',8],['Dispatcher',4],['Auditor',2],['App administrator',1]],
  features:[['Orders','view create edit delete export'],['Dispatch','view edit approve export'],['Reports','view export']],
  selected:['Orders:view','Dispatch:view','Dispatch:edit','Reports:view'],description:'Coordinates the fulfillment of order requests.'},
 timetracker:{name:'TimeTracker',roles:[['Employee',20],['Supervisor',4],['HR',2],['App administrator',1]],
  features:[['Clock sessions','view create edit approve export'],['Attendance reports','view export'],
  ['Employee directory','view edit export']],
  selected:['Clock sessions:view','Attendance reports:view','Attendance reports:export','Employee directory:view'],
  description:'Manages attendance records and reviews clock sessions.'}
};
export const capabilities=['view','create','edit','delete','approve','export'];
export const classNames=(...x)=>x.filter(Boolean).join(' ');
export function Icon({type,size=18}){
 const paths={
  search:<><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></>,
  close:<path d="M18 6 6 18M6 6l12 12"/>,
  more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  people:<><circle cx="9" cy="8" r="4"/><path d="M1.5 21v-2a7.5 7.5 0 0 1 15 0v2M18 4a4 4 0 0 1 0 8m1 4a5 5 0 0 1 3 5"/></>,
  board:<><rect x="2.5" y="3" width="19" height="18" rx="2"/><path d="M9 3v18m6-18v18"/></>,
  app:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  shield:<><path d="M12 2 20 6v6c0 5-3 7.5-8 10-5-2.5-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
  chevron:<path d="m6 9 6 6 6-6"/>,
  link:<><path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></>,
  building:<><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 8h2m3 0h2M9 12h2m3 0h2M10 21v-5h4v5"/></>
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]}</svg>;
}
export function Avatar({initials='A',tone='indigo',size='small'}){
 return <span className={classNames('ap-avatar','ap-avatar-'+tone,'ap-avatar-'+size)} aria-hidden="true">{initials}</span>;
}
export function Badge({kind='member',children}){
 return <span className={'ap-badge ap-badge-'+kind}>{children}</span>;
}
export function Search({value,onChange,placeholder,id}){
 return <label className="ap-search"><Icon type="search" size={16}/><span className="ap-sr">{placeholder}</span>
  <input type="text" id={id} value={value} onChange={e=>onChange(e.target.value)}
  autoComplete="off" placeholder={placeholder}/></label>;
}
export function Menu({items,label='More options'}){
 const [open,setOpen]=useState(false),ref=useRef(null);
 useEffect(()=>{const close=e=>{if(!ref.current?.contains(e.target))setOpen(false);};
  document.addEventListener('pointerdown',close);
  return()=>document.removeEventListener('pointerdown',close);},[]);
 return <div className="ap-menu" ref={ref}><button type="button" className="ap-icon-button ap-more"
  onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-label={label}><Icon type="more"/></button>
  {open&&<div className="ap-menu-items" role="group" aria-label={label}>{items.map((item,i)=>
   <button type="button" key={i} disabled={item.disabled} onClick={()=>{setOpen(false);item.action?.();}}>{item.label}</button>)}</div>}
 </div>;
}
export function RoleSelect({role='viewer',onChange,disabled=false}){
 const [open,setOpen]=useState(false),ref=useRef(null);
 useEffect(()=>{const fn=e=>{if(!ref.current?.contains(e.target))setOpen(false);};
  document.addEventListener('pointerdown',fn);return()=>document.removeEventListener('pointerdown',fn);},[]);
 if(role==='owner')return <Badge kind="admin">Owner</Badge>;
 return <span className="ap-role-select" ref={ref}>
  <button type="button" disabled={disabled} className={'ap-role-pill '+role}
   aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{role==='editor'?'Editor':'Viewer'} <Icon type="chevron" size={12}/></button>
  {open&&<span className="ap-role-choices">{['viewer','editor'].map(value=>
   <button key={value} type="button" aria-pressed={role===value} onClick={()=>{onChange(value);setOpen(false);}}>
    {value==='viewer'?'Viewer':'Editor'}</button>)}</span>}
 </span>;
}
export function Sidebar({screen,onScreen,appKey='fueltrans',onAppKey}){
 const appScreen=screen==='app';
 const groups=appScreen?[
  ['Applications',[['FuelTrans Standalone','fueltrans'],['Tool Traceability','traceability'],['Order Intake','intake'],['TimeTracker','timetracker']]],
  ['Administration',[['User Role Management','workspace']]]
 ]:[
  ['Workspace',[['Dashboard','overview'],['My boards','board']]],
  ['Administration',[['User Role Management','workspace'],['Workspace settings','none']]],
  ['Applications',[['FuelTrans Standalone','fueltrans'],['Tool Traceability','traceability'],['Order Intake','intake'],['TimeTracker','timetracker']]]
 ];
 return <aside className="ap-sidebar" aria-label="Main navigation">
  <div className="ap-brand"><span className="ap-brand-square">A</span><strong>APSYNTRA CRM</strong></div>
  {groups.map(([heading,items])=><div className="ap-nav-group" key={heading}>
   <p>{heading}</p><nav aria-label={heading}>{items.map(([name,key])=><button type="button" key={key}
    className={classNames('ap-nav-item',((appScreen&&key===appKey)||
     (!appScreen&&key==='workspace'&&screen==='workspace'))&&'active')}
    onClick={()=>{if(Object.hasOwn(apps,key)){onAppKey(key);onScreen('app');}
     else if(key!=='none')onScreen(key);}}>{name}</button>)}</nav>
  </div>)}
 </aside>;
}
export function Layout({screen,onScreen,appKey,onAppKey,children}){
 return <div className="ap-layout"><Sidebar screen={screen} onScreen={onScreen} appKey={appKey} onAppKey={onAppKey}/>
  <main className="ap-main">{children}</main></div>;
}
