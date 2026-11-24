export const SOURCE_BOARD_ID = '3670228015';
export const SOURCE_COLUMNS = Object.freeze({
 poAmount:'client_po_amount', status:'delivery_to_client', company:'dropdown',
 accountManager:'sales_representative', procurementExpenses:'numeric_mkkavwa7',
 grossProfit:'formula_mkkazns6', industry:'industry_type',
 dateReceived:'client_po_date_received', deliveryDate:'date_required_by_client'
});
export function mapMondayItem(item, supplemental = {}) {
 const columns=new Map();
 for(const column of item.column_values || []) {
  if(columns.has(column.id)) throw new Error('Duplicate source column ID');
  columns.set(column.id,column.text);
 }
 const mapped={sourceItemId:item.id,sourceGroup:item.group?.title,poNumber:item.name,
  archived:item.state==='archived'?true:item.state==='active'?false:undefined};
 for(const [key,id] of Object.entries(SOURCE_COLUMNS)) mapped[key]=columns.get(id);
 // Undocumented columns require explicit source evidence rather than guesses.
 for(const key of ['clientName','poDate','currency','vatRate','vatExclusiveAmount','vatAmount',
  'buyerInCharge','endUserInCharge','notes']) {
  if(Object.hasOwn(supplemental,key)) mapped[key]=supplemental[key];
 }
 return mapped;
}
