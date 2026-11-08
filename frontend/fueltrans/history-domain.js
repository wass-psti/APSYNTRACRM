// Read-only projection of PostgreSQL-generated audit snapshots. Never infers missing events.
const FIELDS=Object.freeze([['status','Status'],['assigned_l1','L1 assignee'],['assigned_l2','L2 assignee'],['archived','Archived']]);
function readable(value){if(value===null||value===undefined)return '—';if(typeof value==='boolean')return value?'Yes':'No';return String(value);}
export function auditFieldChanges(event){
 if(!event||typeof event!=='object')return [];
 const a=event.before_state&&typeof event.before_state==='object'&&!Array.isArray(event.before_state)?event.before_state:{};
 const b=event.after_state&&typeof event.after_state==='object'&&!Array.isArray(event.after_state)?event.after_state:{};
 return FIELDS.filter(([k])=>(Object.hasOwn(a,k)||Object.hasOwn(b,k))&&readable(a[k])!==readable(b[k]))
  .map(([field,label])=>({field:label,before:readable(a[field]),after:readable(b[field])}));
}
export function auditActorLabel(event){const id=event?.actor_user_id;return typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)?id:'Unattributed privileged operation';}
