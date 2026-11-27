import {MATERIAL_SOURCING_BOARD_ID as boardId,MATERIAL_SOURCING_GROUP as group,
 MATERIAL_SOURCING_EXISTING,MATERIAL_SOURCING_ADDITIONS} from '../../frontend/material-sourcing-schema-plan.js';
export {boardId,group};
export const id=n=>'33333333-3333-4333-8333-'+String(n).padStart(12,'0');
export const workspaceId=id(900),userId=id(901);
export function fixture(){
 const fields=[...MATERIAL_SOURCING_EXISTING,...MATERIAL_SOURCING_ADDITIONS.filter(f=>f.exposure==='ordinary')];
 const columns=fields.map((f,i)=>({id:id(i+1),name:f.name,data_type:f.type,visible:true,system_key:null,column_key:i<8?'col_'+i:'custom:'+id(100+i)}));
 const items=['SYNTHETIC-B','SYNTHETIC-A','SYNTHETIC-C'].map((title,i)=>({id:id(200+i),board_id:boardId,group_id:group.id,title,created_at:'2026-01-0'+(i+1)+'T00:00:00Z',updated_at:'2026-01-01T01:00:00Z'}));
 const value=(i,name,value)=>({item_id:items[i].id,column_id:columns.find(c=>c.name===name).id,value});
 return {board:{id:boardId,name:'Material Request Hub',status:'active',workspace_id:workspaceId},groups:[group],columns,items,
 values:[value(0,'Quantity',0),value(1,'Quantity',2.5),value(0,'Source Type','Local'),value(1,'Source Type','Import'),value(0,'Date required','2026-01-01'),value(1,'Brand','Synthetic Brand'),value(0,'Material description','Synthetic description')]};
}
