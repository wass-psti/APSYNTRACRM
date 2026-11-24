/** Native Order Intake adapter: existing signed transport and authoritative records. */
export const ORDER_INTAKE_STATUSES = Object.freeze([
  'Working on it', 'Processed', 'PO Issued to Supplier', 'PO Acknowledged',
  'Waiting for Delivery', 'In Transit', 'Customs Clearance', 'Delayed',
  'Arrived', 'Receiving Report', 'Delivered', 'Collected', 'Closed', 'Cancelled'
]);
const columns = 'id,workspace_id,po_number,client_name,po_date,date_received,delivery_date,currency,po_amount,vat_rate,vat_exclusive_amount,vat_amount,procurement_expenses,gross_profit,status,company,industry,account_manager,buyer_in_charge,end_user_in_charge,notes,fiscal_year,archived,revision,status_updated_at,updated_at';
const validRevision = value => Number.isSafeInteger(value) && value > 0;

export class OrderIntakeClient {
  constructor({ auth, api, workspaceId }) {
    if (!auth || !api || !workspaceId) throw new TypeError('Order Intake context required');
    Object.assign(this, { auth, api, workspaceId });
  }

  async request(operation) {
    if (!this.auth.isSignedIn) throw new Error('Signed session required');
    const userId = this.auth.userId;
    const result = await operation();
    if (!this.auth.isSignedIn || this.auth.userId !== userId) {
      throw new Error('Order Intake session changed during request');
    }
    return result;
  }

  validateRow(row) {
    if (!row || row.workspace_id !== this.workspaceId || !row.id ||
        !validRevision(row.revision)) throw new Error('Invalid Order Intake record');
    return row;
  }

  async list({ offset = 0, limit = 50, fiscalYear = null, archived = false } = {}) {
    if (!Number.isSafeInteger(offset) || offset < 0 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
        (fiscalYear !== null && !Number.isInteger(fiscalYear))) {
      throw new TypeError('Invalid Order Intake page');
    }
    const params = new URLSearchParams({
      select: columns, workspace_id: 'eq.' + this.workspaceId,
      archived: 'eq.' + archived, order: 'date_received.desc,id.desc',
      offset: String(offset), limit: String(limit + 1)
    });
    if (fiscalYear !== null) params.set('fiscal_year', 'eq.' + fiscalYear);
    const rows = await this.request(() => this.auth.authorized('/rest/v1/order_intake_orders?' + params, { retryableRead: true }));
    if (!Array.isArray(rows) || rows.length > limit + 1) throw new Error('Invalid Order Intake page response');
    rows.forEach(row => this.validateRow(row));
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  }

  async mutate(name, args, id = null) {
    const row = this.validateRow(await this.request(() => this.api.rpc(name, args)));
    if (id !== null && row.id !== id) throw new Error('Unexpected Order Intake mutation record');
    return row;
  }

  create(order, requestId) {
    if (!requestId) throw new TypeError('Stable request ID required');
    return this.mutate('order_intake_create_idempotent', { p_order: order, p_request_id: requestId });
  }

  update(id, revision, patch) {
    return this.change('order_intake_update_details', id, revision, { p_patch: patch });
  }

  updateStatus(id, revision, status) {
    return this.change('order_intake_update_status', id, revision, { p_status: status });
  }

  archive(id, revision) {
    return this.change('order_intake_archive', id, revision);
  }

  restore(id, revision) {
    return this.change('order_intake_restore', id, revision);
  }

  change(name, id, revision, extra = {}) {
    if (!id || !validRevision(revision)) throw new TypeError('Order ID and revision required');
    return this.mutate(name, { p_id: id, p_expected_revision: revision, ...extra }, id);
  }
}
