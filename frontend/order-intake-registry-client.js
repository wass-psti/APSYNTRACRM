import { OrderIntakeClient } from './order-intake-native.js';

// Candidate read contract; deploy only after the matching SQL candidate is activated.
// Native mutation RPCs and revision validation remain inherited and unchanged.
export class OrderIntakeRegistryClient extends OrderIntakeClient {
  validateReadRow(row) {
    if (!row || row.workspace_id !== this.workspaceId || !row.id) throw new Error('Invalid Order Intake registry record');
    if (row.record_kind === 'native') return this.validateRow(row);
    if (row.record_kind !== 'legacy' || !row.source_key || row.revision !== null ||
        ![true,false,null].includes(row.archived)) throw new Error('Invalid historical order record');
    return row;
  }
  async read(params) {
    const rows = await this.request(() => this.auth.authorized('/rest/v1/order_intake_registry?' + params, {retryableRead:true}));
    if (!Array.isArray(rows)) throw new Error('Invalid Order Intake registry response');
    rows.forEach(row => this.validateReadRow(row));
    return rows;
  }
  async list({offset=0,limit=50,fiscalYear=null,archived=false}={}) {
    if (!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100||
        (fiscalYear!==null&&!Number.isInteger(fiscalYear))||typeof archived!=='boolean') throw new TypeError('Invalid Order Intake page');
    const params=new URLSearchParams({workspace_id:'eq.'+this.workspaceId,
      order:'date_received.desc.nullslast,id.desc,record_kind.asc',offset:String(offset),limit:String(limit+1)});
    if (archived) params.set('archived','eq.true');
    else params.set('or','(archived.eq.false,archived.is.null)');
    if (fiscalYear!==null) params.set('fiscal_year','eq.'+fiscalYear);
    const rows=await this.read(params);
    if (rows.length>limit+1) throw new Error('Invalid Order Intake registry page');
    return {items:rows.slice(0,limit),hasMore:rows.length>limit};
  }
  async detail(id) {
    const rows=await this.read(new URLSearchParams({workspace_id:'eq.'+this.workspaceId,id:'eq.'+id,limit:'2',
      or:'(archived.eq.false,archived.is.null)'}));
    if (rows.length!==1||rows[0].id!==id) throw new Error('Order record unavailable.');
    return rows[0];
  }
}
