import {id,workspaceId} from './cp-ms-crm-03-fixture.mjs';
import {SUPPLIER_PO_BOARD_ID as boardId} from '../../frontend/apps/MaterialSourcing/procurement-reference.js';

export function procurementFixture(){
 const fields=['Supplier Name','Supplier PO Date','Client Purchase Orders','link to Material Sourcing Requests'];
 const columns=fields.map((name,i)=>({id:id(600+i),name,data_type:i===1?'date':'text'}));
 const items=['PO-TEST-001','PO-TEST-002','PO-TEST-003','PO-ARCHIVED'].map((title,i)=>({
  id:id(650+i),board_id:boardId,title,archived_at:i===3?'2026-11-28T00:00:00Z':null
 }));
 const value=(i,j,value)=>({item_id:items[i].id,column_id:columns[j].id,value});
 return {board:{id:boardId,name:'Supplier PO Procurement',workspace_id:workspaceId,status:'active'},
  pagination:{loaded:true,has_more:false},columns,items,
  values:[value(0,0,'Synthetic Supplier'),value(1,0,' synthetic supplier '),value(3,0,'Archived Supplier'),
   value(0,1,'2026-12-01'),value(0,2,'CLIENT-123'),value(1,3,'<unverified legacy reference>')]};
}
