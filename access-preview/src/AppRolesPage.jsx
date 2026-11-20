import React,{useEffect,useMemo,useState} from 'react';
import {apps,Avatar,capabilities,Layout,Menu} from './shared.jsx';

const peopleFixtures=[
 {id:'alex',name:'Alex P. Señagan',initials:'AS',tone:'lavender'},
 {id:'amalia',name:'Amalia P. Señagan',initials:'AS',tone:'pink'},
 {id:'elizabeth',name:'Ma. Elizabeth L. Cataytay',initials:'MC',tone:'blue'}
];
export function AppRolesPage({onScreen,appKey,onAppKey,toast}){
 const config=apps[appKey]||apps.fueltrans;
 const [roleName,setRoleName]=useState(appKey==='fueltrans'?'Approver':config.roles[0][0]),
  [roleList,setRoleList]=useState(config.roles),
  [selected,setSelected]=useState(config.selected),
  [description,setDescription]=useState(config.description),
  [people,setPeople]=useState(peopleFixtures),
  [dirty,setDirty]=useState(appKey==='fueltrans'?2:0);
 useEffect(()=>{
  const next=apps[appKey]||apps.fueltrans;
  setRoleName(appKey==='fueltrans'?'Approver':next.roles[0][0]);setRoleList(next.roles);
  setSelected(next.selected);setDescription(next.description);
  setPeople(peopleFixtures);setDirty(appKey==='fueltrans'?2:0);
 },[appKey]);
 const role=roleList.find(row=>row[0]===roleName)||roleList[0];
 const toggle=(feature,capability)=>{
  const key=feature+':'+capability;
  setSelected(old=>old.includes(key)?old.filter(v=>v!==key):[...old,key]);
  setDirty(v=>v+1);
 };
 const chooseRole=name=>{setRoleName(name);setDescription(name==='Approver'?config.description:
  name==='App administrator'?'Manages application roles and settings.':
  name==='Requester'?'Submits and tracks requests.':'Manages assigned application operations.');
  setDirty(0);};
 const roleActions=[
  {label:'Rename',action:()=>{const name=window.prompt('Rename role',roleName);
   if(name?.trim()){setRoleList(v=>v.map(row=>row[0]===roleName?[name.trim(),row[1]]:row));setRoleName(name.trim());setDirty(v=>v+1);}}},
  {label:'Edit description',action:()=>{const text=window.prompt('Role description',description);
   if(text!==null){setDescription(text);setDirty(v=>v+1);}}},
  {label:'Duplicate',action:()=>{const name=roleName+' (copy)';setRoleList(v=>[...v,[name,0]]);setRoleName(name);setDirty(v=>v+1);}},
  {label:'Delete',disabled:role?.[1]>0,action:()=>{if(window.confirm('Delete role?'))setRoleList(v=>v.filter(row=>row[0]!==roleName));}}
 ];
 return <Layout screen="app" onScreen={onScreen} appKey={appKey} onAppKey={onAppKey}>
  <div className="ap-app-page">
   <div className="ap-breadcrumb">{config.name}</div>
   <h1>Settings</h1>
   <nav className="ap-settings-tabs" aria-label="Application settings sections">
    {['General','Roles','Notifications','Integrations'].map(tab=><button type="button" key={tab}
     className={tab==='Roles'?'active':''} aria-current={tab==='Roles'?'page':undefined}
     onClick={()=>tab!=='Roles'&&toast(tab+' settings are outside this role preview')}>{tab}</button>)}
   </nav>
   <div className="ap-app-grid">
    <section className="ap-card ap-roles-sidebar" aria-label="Roles in this application">
     <button className="ap-secondary ap-block" type="button" onClick={()=>{
      const name=window.prompt('New role name');if(name?.trim()){setRoleList(v=>[...v,[name.trim(),0]]);setRoleName(name.trim());setDirty(v=>v+1);}
     }}>+ New role</button>
     <div className="ap-role-nav">{roleList.map(([name,count])=><button type="button" key={name}
      className={name===roleName?'active':''} onClick={()=>chooseRole(name)}>
       <span>{name}</span><span>{count}</span></button>)}</div>
     <p className="ap-role-list-footer">These roles exist only in {config.name}. Other apps have their own.</p>
    </section>
    <section className="ap-card ap-role-detail" aria-label="Role details">
     <div className="ap-role-head"><div><h2>{roleName}</h2><p>{description}</p></div>
      <Menu label="Role actions" items={roleActions}/></div>
     <div className="ap-table-viewport"><table className="ap-table ap-capability-table">
      <thead><tr><th scope="col">What this role can do</th>
       {capabilities.map(cap=><th key={cap} scope="col">{cap}</th>)}</tr></thead>
      <tbody>{config.features.map(([feature,available])=><tr key={feature}><th scope="row">{feature}</th>
       {capabilities.map(cap=><td key={cap}>{available.split(' ').includes(cap)?
        <label className="ap-check-label"><span className="ap-sr">{feature}: {cap}</span>
         <input type="checkbox" checked={selected.includes(feature+':'+cap)} onChange={()=>toggle(feature,cap)}/></label>:
        <span className="ap-disabled-dash" aria-label="Not applicable">–</span>}</td>)}</tr>)}</tbody>
     </table></div>
     <section className="ap-assigned-people"><div className="ap-assigned-heading"><h3>People with this role · {people.length}</h3>
      <button type="button" className="ap-secondary" onClick={()=>{const name=window.prompt('Person name');
       if(name?.trim()){setPeople(v=>[...v,{id:'new-'+Date.now(),name:name.trim(),initials:name.slice(0,2).toUpperCase(),tone:'blue'}]);setDirty(v=>v+1);}}}>+ Assign people</button></div>
      <div className="ap-people-chips">{people.map(person=><button type="button" className="ap-person-chip"
       title={'Remove '+person.name+' from this role'} aria-label={'Remove '+person.name+' from role'}
       key={person.id} onClick={()=>{if(window.confirm('Remove '+person.name+' from this role?')){
        setPeople(v=>v.filter(p=>p.id!==person.id));setDirty(v=>v+1);}}}>
       <Avatar initials={person.initials} tone={person.tone} size="chip"/><span>{person.name}</span></button>)}</div>
     </section>
     {dirty>0&&<footer className="ap-save-footer">
      <span>Changes apply to {config.name} only. {dirty} unsaved {dirty===1?'change':'changes'}.</span>
      <div><button type="button" className="ap-secondary" onClick={()=>{
       setSelected(config.selected);setPeople(peopleFixtures);setDirty(0);}}>Discard</button>
       <button type="button" className="ap-primary" onClick={()=>{setDirty(0);toast('Preview saved locally — live roles unchanged');}}>Save changes</button></div>
     </footer>}
    </section>
   </div>
  </div>
 </Layout>;
}
