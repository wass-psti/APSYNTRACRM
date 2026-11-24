import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderIntakeClient } from '../order-intake-native.js';
import { projectOrders, previewOrderFinancials } from '../order-intake-projections.js';

const row = { id: 'one', workspace_id: 'workspace', revision: 2, status: 'Working on it',
  currency: 'PHP', po_amount: '521603.00', procurement_expenses: '0.00', gross_profit: '465716.96' };
function fixture(rows = [row]) {
  const calls = [];
  const auth = { isSignedIn: true, userId: 'actor', authorized: async path => { calls.push(path); return rows; } };
  const api = { rpc: async (name, args) => { calls.push([name, args]); return row; } };
  return { client: new OrderIntakeClient({ auth, api, workspaceId: 'workspace' }), auth, calls };
}
test('list uses existing signed scoped table, stable order and bounded page', async () => {
  const { client, calls } = fixture([row, { ...row, id: 'two' }]);
  assert.deepEqual(await client.list({ limit: 1, fiscalYear: 2026 }), { items: [row], hasMore: true });
  const url = new URL(calls[0], 'https://example.invalid');
  assert.equal(url.pathname, '/rest/v1/order_intake_orders');
  assert.equal(url.searchParams.get('workspace_id'), 'eq.workspace');
  assert.equal(url.searchParams.get('fiscal_year'), 'eq.2026');
  assert.equal(url.searchParams.get('order'), 'date_received.desc,id.desc');
  assert.equal(url.searchParams.get('limit'), '2');
});
test('invalid workspace response is never displayed', async () => {
  const { client } = fixture([{ ...row, workspace_id: 'other' }]);
  await assert.rejects(client.list(), /Invalid Order Intake record/);
});
test('mutation names and argument contracts retain stable request and revision', async () => {
  const { client, calls } = fixture();
  await client.create({ poNumber: 'PO' }, 'stable-request');
  await client.update('one', 1, { notes: 'edited' });
  await client.updateStatus('one', 1, 'Processed');
  await client.archive('one', 1);
  await client.restore('one', 1);
  assert.deepEqual(calls, [
    ['order_intake_create_idempotent', { p_order: { poNumber: 'PO' }, p_request_id: 'stable-request' }],
    ['order_intake_update_details', { p_id: 'one', p_expected_revision: 1, p_patch: { notes: 'edited' } }],
    ['order_intake_update_status', { p_id: 'one', p_expected_revision: 1, p_status: 'Processed' }],
    ['order_intake_archive', { p_id: 'one', p_expected_revision: 1 }],
    ['order_intake_restore', { p_id: 'one', p_expected_revision: 1 }]
  ]);
});
test('session change and backend errors are propagated', async () => {
  const { client, auth } = fixture();
  auth.authorized = async () => { auth.userId = 'changed'; return [row]; };
  await assert.rejects(client.list(), /session changed/);
  auth.authorized = async () => { throw new Error('backend unavailable'); };
  await assert.rejects(client.list(), /backend unavailable/);
});
test('workflow preserves source statuses, unknown states and separate currency totals', () => {
  const result = projectOrders([row, { ...row, id: 'two', status: 'Collected', currency: 'USD', po_amount: '10.01', gross_profit: '-0.01' },
    { ...row, id: 'three', status: 'Legacy status' }, { ...row, id: 'four', archived: true }]);
  assert.equal(result.totalOrders, 3);
  assert.equal(result.workflow.reduce((sum, stage) => sum + stage.orders.length, 0), 3);
  assert.equal(result.workflow.find(stage => stage.status === 'Processed').orders.length, 0);
  assert.equal(result.workflow.find(stage => stage.status === 'Legacy status').orders.length, 1);
  assert.deepEqual(result.currencyTotals, [
    { currency: 'PHP', amount: '1043206.00', expenses: '0.00', grossProfit: '931433.92' },
    { currency: 'USD', amount: '10.01', expenses: '0.00', grossProfit: '-0.01' }
  ]);
});
test('duplicate identities and missing financial values fail instead of inflating metrics', () => {
  assert.throws(() => projectOrders([row, row]), /Duplicate/);
  assert.throws(() => projectOrders([{ ...row, gross_profit: null }]), /precision/);
});

test('VAT preview follows database rounding, including zero VAT and losses', () => {
  assert.deepEqual(previewOrderFinancials({ amount: '521603.00', vatRate: '12', expenses: '0' }),
    { vatExclusiveAmount: '465716.96', vatAmount: '55886.04', grossProfit: '465716.96' });
  assert.deepEqual(previewOrderFinancials({ amount: '100.00', vatRate: '0', expenses: '110.01' }),
    { vatExclusiveAmount: '100.00', vatAmount: '0.00', grossProfit: '-10.01' });
  assert.deepEqual(previewOrderFinancials({ amount: '0.03', vatRate: '20', expenses: '0' }),
    { vatExclusiveAmount: '0.03', vatAmount: '0.00', grossProfit: '0.03' });
  assert.throws(() => previewOrderFinancials({ amount: '0', vatRate: '12', expenses: '0' }), /Invalid/);
});
