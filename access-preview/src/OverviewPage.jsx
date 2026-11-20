import React from 'react';
import {Badge,Icon,Layout} from './shared.jsx';
const layers=[
 {id:1,name:'Workspace',type:'people',body:'People belong to teams. Workspace roles control team membership and administration.',examples:['Member','Team owner','System Admin'],where:'User Role Management'},
 {id:2,name:'Board',type:'board',body:'A person gets Viewer or Editor access to an individual board, directly or through a team.',examples:['Viewer','Editor'],where:'Board Invite / N'},
 {id:3,name:'Application',type:'app',body:'Each app defines the roles and capabilities that apply only inside that application.',examples:['Requester','Approver','Dispatcher'],where:'Application Settings > Roles'}
];
export function OverviewPage({onScreen,appKey,onAppKey}){
 return <Layout screen="overview" onScreen={onScreen} appKey={appKey} onAppKey={onAppKey}>
  <div className="ap-overview">
   <button type="button" className="ap-text-back" onClick={()=>onScreen('workspace')}>← User Role Management</button>
   <div className="ap-overview-eyebrow">HOW ACCESS WORKS</div>
   <h1>Three layers of access, each managed where it belongs</h1>
   <p className="ap-overview-subtitle">Workspace roles organize people, board access determines collaboration, and application roles control what users can do inside each app.</p>
   <div className="ap-layer-grid">{layers.map(layer=><article key={layer.id}
    className={'ap-card ap-layer-card '+(layer.id===2?'highlight':'')}>
    <div className="ap-layer-icon"><Icon type={layer.type} size={24}/></div>
    <p className="ap-layer-label">Layer {layer.id}</p>
    <h2>{layer.name}</h2><p>{layer.body}</p>
    <div className="ap-layer-tags">{layer.examples.map(tag=>
     <Badge key={tag} kind={tag==='System Admin'?'admin':tag==='Editor'||tag==='Team owner'?'team-owner':'member'}>{tag}</Badge>)}</div>
    <footer>Managed in <strong>{layer.where}</strong></footer>
   </article>)}</div>
   <section className="ap-card ap-combine-card">
    <h2>HOW THEY COMBINE</h2>
    <p>A person's access to a board is their highest direct or inherited board role. Their app-specific role determines which operations they can perform inside that app. System Admin overrides both through verified server-side authorization.</p>
   </section>
  </div>
 </Layout>;
}
