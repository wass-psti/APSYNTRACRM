import React,{useMemo,useState} from 'react';
import {Avatar,Badge,Icon,Layout,Menu,RoleSelect,Search,boards as boardFixtures,persons as peopleFixtures,teams as teamFixtures} from './shared.jsx';

export function WorkspacePage({onScreen,appKey,onAppKey,toast}){
 const [teamList,setTeamList]=useState(teamFixtures),[selected,setSelected]=useState('it'),
  [search,setSearch]=useState(''),[userSearch,setUserSearch]=useState(''),[boardSearch,setBoardSearch]=useState(''),
  [tab,setTab]=useState('users'),[people,setPeople]=useState(peopleFixtures),
  [boardList,setBoardList]=useState(boardFixtures),[addOpen,setAddOpen]=useState(false),
  [addName,setAddName]=useState('');
 const team=teamList.find(t=>t.id===selected);
 const currentPeople=selected==='it'?people:selected==='general'?
  [{id:'gm',name:'General Manager',email:'gm@example.com',title:'General administration',initials:'GM',owner:true,system:true}]:[];
 const members=currentPeople.filter(p=>(p.name+' '+p.email).toLowerCase().includes(userSearch.toLowerCase()));
 const teamBoards=selected==='it'?boardList:[];
 const shownBoards=teamBoards.filter(b=>b.name.toLowerCase().includes(boardSearch.toLowerCase()));
 const memberCount=team?.id==='it'?people.length:team?.count||0;
 const boardCount=team?.id==='it'?4:0; // mock header counts follow reference screenshot exactly
 const visibleTeams=teamList.filter(t=>t.name.toLowerCase().includes(search.toLowerCase()));
 const rename=()=>{if(!team)return;const name=window.prompt('Rename team',team.name);
  if(name?.trim())setTeamList(rows=>rows.map(t=>t.id===team.id?{...t,name:name.trim()}:t));};
 const addMember=()=>{const name=addName.trim();if(!name)return;
  setPeople(rows=>[...rows,{id:'new-'+Date.now(),name,email:'new.member@example.com',title:'',initials:name.slice(0,2).toUpperCase(),owner:rows.length===0}]);
  setAddOpen(false);setAddName('');toast('Preview: team member added locally');};
 const menuFor=p=>[
  {label:p.owner?'Remove team owner':'Make team owner',disabled:p.owner&&currentPeople.filter(v=>v.owner).length===1,
   action:()=>{if(selected==='it'){setPeople(rows=>rows.map(v=>v.id===p.id?{...v,owner:!v.owner}:v));toast('Preview team ownership updated');}}},
  {label:'Move to another team',action:()=>toast('Preview: use the signed server workflow to move membership')},
  {label:'Add to another team',action:()=>toast('Preview: a person may belong to multiple teams')},
  {label:'Remove from this team',disabled:p.owner&&currentPeople.length===1,
   action:()=>{if(window.confirm('Remove member from the team?'))setPeople(rows=>rows.filter(v=>v.id!==p.id));}},
  {label:p.system?'Revoke System Admin (inherited)':'Grant System Admin',disabled:p.system,
   action:()=>{if(window.confirm(p.name+' will get full control of the entire app. Continue?'))toast('Preview: production System Admin was not modified');}},
  {label:'View profile',action:()=>toast(p.name+' · '+p.title)}
 ];
 const boardSection=(query=false)=><div className="ap-board-access-list" aria-label="Team board access">
  {shownBoards.map(board=><div className="ap-board-access-row" key={board.id}>
   <span>{board.name}</span><RoleSelect role={board.role} onChange={role=>{
    setBoardList(rows=>rows.map(b=>b.id===board.id?{...b,role}:b));toast('Preview board access updated locally');}}/></div>)}
  {shownBoards.length===0&&<div className="ap-empty-board">No boards assigned.</div>}
 </div>;
 return <Layout screen="workspace" onScreen={onScreen} appKey={appKey} onAppKey={onAppKey}>
  <div className="ap-workspace-page">
   <header className="ap-workspace-title"><h1>User Role Management</h1>
    <p>Organize people into teams and set workspace-level roles. Board access is set on each board; app roles are set inside each app.</p>
   </header>
   <div className="ap-workspace-grid">
    <section className="ap-card ap-team-side" aria-label="Teams">
     <button type="button" className="ap-secondary ap-block" onClick={()=>{
      const name=window.prompt('New team name');if(!name?.trim())return;
      const id='team-'+Date.now();setTeamList(v=>[...v,{id,name:name.trim(),count:0}]);setSelected(id);
     }}>+ New team</button>
     <Search id="ap-search-teams" value={search} onChange={setSearch} placeholder="Search teams"/>
     <div className="ap-team-nav">
      <button type="button" onClick={()=>setSelected(null)} className={selected===null?'active':''}>
       <span>All teams</span><span>{teamList.length}</span></button>
      {visibleTeams.map(t=><button type="button" key={t.id} onClick={()=>{setSelected(t.id);setTab('users');setUserSearch('');}}
       className={selected===t.id?'active':''}><span>{t.name}</span><span>{t.id==='it'?people.length:t.count}</span></button>)}
     </div>
    </section>
    <section className="ap-card ap-team-detail" aria-label="Selected team">
     <div className="ap-team-cover"/>
     <div className="ap-team-heading"><div className="ap-team-avatar">{team?.id==='it'?'IT':(team?.name||'AT').slice(0,2).toUpperCase()}</div>
      <div className="ap-team-title"><h2>{team?.name||'All teams'}</h2>
       <p>{memberCount} members · {boardCount} boards</p></div>
      {team&&<Menu label="Team actions" items={[
       {label:'Rename team',action:rename},
       {label:'Change avatar and cover',action:()=>toast('Preview: image upload needs authorized Storage')},
       {label:'Duplicate team',action:()=>{const id='copy-'+Date.now();
        setTeamList(v=>[...v,{...team,id,name:team.name+' (copy)',count:0}]);setSelected(id);}},
       {label:'Delete team',disabled:team.isSystem,action:()=>{if(window.confirm('Delete team?')){
        setTeamList(v=>v.filter(t=>t.id!==team.id));setSelected(null);}}}
      ]}/>}
     </div>
     <div className="ap-team-tabs" role="tablist" aria-label="Team details">
      <button role="tab" aria-selected={tab==='users'} type="button" className={tab==='users'?'active':''}
       onClick={()=>setTab('users')}>Users · {memberCount}</button>
      <button role="tab" aria-selected={tab==='boards'} type="button" className={tab==='boards'?'active':''}
       onClick={()=>setTab('boards')}>Board access · {boardCount}</button>
     </div>
     {tab==='users'&&<div className="ap-team-content">
      <div className="ap-team-toolbar">
       <Search value={userSearch} onChange={setUserSearch} id="ap-user-search" placeholder="Search by name or email"/>
       <button className="ap-primary" type="button" onClick={()=>setAddOpen(v=>!v)}>+ Add users</button>
      </div>
      {addOpen&&<div className="ap-inline-form"><label htmlFor="ap-user-add">Search workspace people</label>
       <input id="ap-user-add" value={addName} placeholder="Name or email" onChange={e=>setAddName(e.target.value)}/>
       <button type="button" className="ap-secondary" onClick={addMember}>Add user</button></div>}
      {team?.isSystem&&<p className="ap-inherited-info"><Icon type="shield" size={16}/> Members of this team are System Admins automatically.</p>}
      <div className="ap-table-viewport"><table className="ap-table ap-members-table">
       <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Title</th><th scope="col">Workspace role</th><th scope="col"><span className="ap-sr">Actions</span></th></tr></thead>
       <tbody>{members.map(p=><tr key={p.id}><td><div className="ap-member-name">
        <Avatar initials={p.initials} tone={p.id==='lucky'?'pink':'lavender'}/><span title={p.name} className="ap-truncate">{p.name}</span></div></td>
        <td title={p.email}><span className="ap-truncate">{p.email}</span></td>
        <td title={p.title}><span className="ap-truncate">{p.title}</span></td>
        <td><Badge kind={p.system?'admin':p.owner?'team-owner':'member'}>{p.system?'System Admin':p.owner?'Team owner':'Member'}</Badge></td>
        <td><Menu label={'Actions for '+p.name} items={menuFor(p)}/></td></tr>)}</tbody>
      </table>{members.length===0&&<div className="ap-empty"><p>No users in this team yet</p><button className="ap-primary"
       onClick={()=>setAddOpen(true)} type="button">+ Add users</button></div>}</div>
      <section className="ap-board-section"><div className="ap-board-section-header"><h3>Board access for this team</h3>
       <span>Every member gets this level on the board</span></div>
       {boardSection()}
       <button type="button" className="ap-link ap-give-access" onClick={()=>{
        const name=window.prompt('Board name');if(name?.trim())setBoardList(v=>[...v,{id:'b'+Date.now(),name:name.trim(),role:'viewer'}]);
       }}>+ Give team access to a board</button>
      </section>
      <aside className="ap-quiet-note">App roles such as Approver or Dispatcher are no longer set here. Open the app and go to <strong>Settings › Roles.</strong></aside>
     </div>}
     {tab==='boards'&&<div className="ap-team-content"><div className="ap-team-toolbar">
      <Search id="ap-board-search" value={boardSearch} onChange={setBoardSearch} placeholder="Search boards"/>
      <button type="button" className="ap-primary" onClick={()=>{
       const name=window.prompt('Board name');if(name?.trim())setBoardList(v=>[...v,{id:'b'+Date.now(),name:name.trim(),role:'viewer'}]);
      }}>+ Give team access to a board</button></div>{boardSection(true)}</div>}
    </section>
   </div>
   <button type="button" className="ap-help-link" onClick={()=>onScreen('overview')}>How access works</button>
  </div>
 </Layout>;
}
