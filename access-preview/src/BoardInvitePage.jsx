import React,{useEffect,useRef,useState} from 'react';
import {Avatar,Icon,Layout,RoleSelect,teams} from './shared.jsx';

const existing=[
 {id:'owner',name:'Alex P. Señagan',title:'Board owner',initials:'AS',role:'owner'},
 {id:'lex',name:'Lex Mariun B. Señagan',title:'IT Support Specialist I',initials:'LS',role:'editor'},
 {id:'lucky',name:'Lucky Ampalayohan',title:'OJT - IT Specialists',initials:'LA',role:'viewer'}
];
const candidates=[
 {id:'jerome',name:'Jerome L. Nunez',title:'Engineering Specialist',email:'jerome@example.com',initials:'JN'},
 {id:'lex',name:'Lex Mariun B. Señagan',title:'IT Support Specialist I',email:'lmsenagan@watchdogautomation.com.ph',initials:'LS'},
 {id:'lucky',name:'Lucky Ampalayohan',title:'OJT - IT Specialists',email:'lampalayohan@watchdogautomation.com.ph',initials:'LA'},
 {id:'amalia',name:'Amalia P. Señagan',title:'Finance Manager',email:'amalia@example.com',initials:'AS'}
];
export function BoardInvitePage({onScreen,appKey,onAppKey,toast}){
 const [open,setOpen]=useState(true),[tab,setTab]=useState('people'),
  [query,setQuery]=useState('jerome'),[selectedIndex,setSelectedIndex]=useState(0),
  [invited,setInvited]=useState(existing),[teamInvites,setTeamInvites]=useState([]),
  [privateBoard,setPrivateBoard]=useState(false);
 const searchRef=useRef(null);
 useEffect(()=>{if(open)searchRef.current?.focus();},[open]);
 useEffect(()=>{
  const key=e=>{if(e.key==='Escape'&&open){e.preventDefault();setOpen(false);}};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[open]);
 const matchingPeople=candidates.filter(p=>(p.name+' '+p.email).toLowerCase().includes(query.toLowerCase()));
 const matchingTeams=teams.filter(t=>t.name.toLowerCase().includes(query.toLowerCase()));
 const matching=tab==='people'?matchingPeople:matchingTeams;
 const addPerson=p=>{if(invited.some(v=>v.id===p.id))return;setInvited(v=>[{...p,role:'viewer',highlight:true},...v]);
  setQuery('');toast(p.name+' can now view this board');};
 const addTeam=team=>{if(teamInvites.includes(team.id))return;setTeamInvites(v=>[team.id,...v]);setQuery('');
  toast(team.name+' can now view this board as a team');};
 const onKeyboard=e=>{
  if(e.key==='ArrowDown'){e.preventDefault();setSelectedIndex(v=>Math.min(v+1,matching.length-1));}
  if(e.key==='ArrowUp'){e.preventDefault();setSelectedIndex(v=>Math.max(0,v-1));}
  if(e.key==='Enter'&&query){e.preventDefault();const selected=matching[selectedIndex];
   if(selected)tab==='people'?addPerson(selected):addTeam(selected);}
 };
 return <Layout screen="board" onScreen={onScreen} appKey={appKey} onAppKey={onAppKey}>
  <div className="ap-board-page">
   <div className="ap-board-preview-header"><div><p>Workspace / Board</p><h1>I.T - Daily Activities</h1></div>
    <div className="ap-split-invite"><button type="button" onClick={()=>setOpen(true)}>Invite / {invited.length}</button>
     <button type="button" title="Copy board link" aria-label="Copy board link" onClick={()=>{
      navigator.clipboard?.writeText(window.location.href);toast('Link copied');}}><Icon type="link"/></button></div>
   </div>
   {open&&<div className="ap-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
    <section className="ap-invite-modal" role="dialog" aria-modal="true" aria-labelledby="ap-invite-title">
     <div className="ap-invite-head"><h2 id="ap-invite-title">Invite to this board</h2>
      <button type="button" aria-label="Close invitation dialog" className="ap-icon-button" onClick={()=>setOpen(false)}><Icon type="close"/></button></div>
     <div className="ap-invite-search-zone">
      <label className="ap-invite-search"><Icon type="search"/><span className="ap-sr">Search by name, team or email</span>
       <input ref={searchRef} role="combobox" aria-autocomplete="list" aria-expanded={Boolean(query.trim())} aria-controls="ap-search-suggestions"
        placeholder="Search by name, team or email" autoComplete="off" value={query}
        onChange={e=>{setQuery(e.target.value);setSelectedIndex(0);}} onKeyDown={onKeyboard}/></label>
      {query.trim()&&<div className="ap-suggestions" role="listbox" id="ap-search-suggestions">
       <div className="ap-group-caption">{tab==='people'?'People':'Teams'}</div>
       {matching.length?matching.map((item,i)=>{
        const already=tab==='people'?invited.some(p=>p.id===item.id):teamInvites.includes(item.id);
        return <button type="button" role="option" aria-selected={selectedIndex===i} disabled={already}
         key={item.id} className={selectedIndex===i?'focused':''} onClick={()=>tab==='people'?addPerson(item):addTeam(item)}>
         {tab==='people'?<Avatar initials={item.initials} tone="blue" size="big"/>:
          <span className="ap-result-team-avatar"><Icon type="people"/></span>}
         <span className="ap-suggestion-copy"><strong>{item.name}</strong><small>{tab==='people'?item.title:item.count+' members'}</small></span>
         <span className="ap-suggestion-action">{already?'Already invited':tab==='people'?'Press Enter to add as Viewer':'Invite as Viewer'}</span>
        </button>;
       }):<p className="ap-no-results">No matching {tab==='people'?'people':'teams'}</p>}
       <button type="button" className="ap-secondary ap-block ap-request-invite" onClick={()=>
        toast('New workspace invitation requests use the separately authorized membership flow.')}>
        Request to invite a new member by email</button>
      </div>}
     </div>
     <div className="ap-invite-scroll">
      <nav className="ap-invite-tabs" aria-label="Invite people or teams">
       <button type="button" className={tab==='people'?'active':''} aria-current={tab==='people'?'page':undefined}
        onClick={()=>{setTab('people');setQuery('');}}>People</button>
       <button type="button" className={tab==='teams'?'active':''} aria-current={tab==='teams'?'page':undefined}
        onClick={()=>{setTab('teams');setQuery('');}}>Teams</button></nav>
      <button type="button" className="ap-board-policy" onClick={()=>setPrivateBoard(v=>!v)}
       aria-pressed={!privateBoard}><Icon type="building" size={20}/>
       <span>{privateBoard?'Only invited people can access this board':'Anyone at APSGroup of Companies can view this board'}</span>
       <Icon type="chevron" size={13}/></button>
      <div className="ap-member-section-title"><h3>{tab==='people'?'People invited to this board':'Teams invited to this board'}</h3>
       <span>{tab==='people'?invited.length:teamInvites.length} assigned</span></div>
      {tab==='people'?(invited.length?invited.map(person=><div className={'ap-board-member '+(person.highlight?'ap-highlight':'')} key={person.id}>
       <Avatar initials={person.initials} tone={person.id==='lucky'?'pink':'lavender'} size="big"/>
       <div className="ap-board-member-copy"><strong>{person.name}</strong><small>{person.title}</small></div>
       <RoleSelect role={person.role} onChange={role=>{setInvited(v=>v.map(p=>p.id===person.id?{...p,role}:p));toast('Board role updated');}}/>
       {person.role==='owner'?<span className="ap-remove-space"/>:<button type="button" className="ap-remove" aria-label={'Remove '+person.name}
        onClick={()=>{if(window.confirm('Remove '+person.name+' from this board?'))setInvited(v=>v.filter(p=>p.id!==person.id));}}>
        <Icon type="close" size={15}/></button>}
      </div>):<div className="ap-empty">Invite teammates to view this board.</div>):
       (teamInvites.length?teamInvites.map(id=>{const team=teams.find(t=>t.id===id);
        return <div className="ap-board-member" key={id}><span className="ap-result-team-avatar"><Icon type="people"/></span>
         <div className="ap-board-member-copy"><strong>{team.name}</strong><small>{team.count} members</small></div>
         <RoleSelect role="viewer" onChange={()=>toast('Preview-only team role change')}/>
         <button type="button" className="ap-remove" aria-label={'Remove '+team.name}
          onClick={()=>{if(window.confirm('Remove team access?'))setTeamInvites(v=>v.filter(n=>n!==id));}}><Icon type="close" size={15}/></button>
        </div>;}):<div className="ap-empty">Invite a whole team to give every member Viewer access.</div>)}
     </div>
     <footer className="ap-board-legend"><p><strong>Viewer</strong> can see every item but cannot change anything.</p>
      <p><strong>Editor</strong> can add and edit items, columns and groups.</p></footer>
    </section>
   </div>}
  </div>
 </Layout>;
}
