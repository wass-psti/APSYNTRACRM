import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOrderIntakeRoute, orderIntakeHref, ORDER_INTAKE_BOARD_ID } from '../order-intake-route.js';
import { createOrderIntakeReadState, filterOrderIntakeRows } from '../order-intake-read-state.js';
import { renderOrderIntake } from '../order-intake-ui.js';
import { workspaceApplicationsForNavigation } from '../workspace-application-routing.js';
import { WORK_MANAGEMENT_WORKSPACE_ID } from '../workspace-identity.js';
import { sidebarActiveRoute } from '../sidebar-active-route.js';

const row = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', po_number: 'PO-001', client_name: 'Pump & Co',
  account_manager: 'Sales', company: 'Example', industry: 'Water', date_received: '2026-11-20',
  fiscal_year: 2026, status: 'Working on it', currency: 'PHP', po_amount: '100.00',
  procurement_expenses: '5.00', gross_profit: '84.29' };
const another = { ...row, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', po_number: 'PO-002',
  status: 'Collected', fiscal_year: 2025, currency: 'USD' };
const route = section => parseOrderIntakeRoute(orderIntakeHref(section));

test('native sidebar link retains existing board visibility and active navigation', () => {
  const nav = workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID, [{ id: ORDER_INTAKE_BOARD_ID }]);
  assert.equal(nav.find(app => app.id === 'orders').href, '#/order-intake');
  assert.equal(sidebarActiveRoute('#/order-intake/workflow'), 'order-intake');
  assert.equal(workspaceApplicationsForNavigation(WORK_MANAGEMENT_WORKSPACE_ID, []).some(app => app.id === 'orders'), false);
});
test('four view routes preserve filters and record deep links', () => {
  for (const section of ['dashboard','workflow','search','all-orders']) {
    const href = orderIntakeHref(section, { q: 'A & B', year: '2026' });
    assert.equal(parseOrderIntakeRoute(href).section, section);
    assert.equal(parseOrderIntakeRoute(href).filters.q, 'A & B');
  }
  assert.equal(parseOrderIntakeRoute(orderIntakeHref('all-orders', {}, row.id)).recordId, row.id);
  assert.equal(parseOrderIntakeRoute('#/order-intake/nope?year=bad').canonicalHash, '#/order-intake');
  assert.equal(parseOrderIntakeRoute('#/overview'), null);
});
test('combined filter terms and status, fiscal year, dates, company and currency', () => {
  assert.deepEqual(filterOrderIntakeRows([row,another], { q: 'pump sales', year: '2026',
    from: '2026-11-01', to: '2026-11-30', status: 'Working on it', company: 'Example', currency: 'PHP' }), [row]);
  assert.deepEqual(filterOrderIntakeRows([{ ...row, date_received: null }], { to: '2026-11-30' }), []);
});
test('shared state loads once across tabs, appends pages, refreshes from offset zero', async () => {
  const offsets = [];
  const state = createOrderIntakeReadState({ isCurrent: () => true, onChange: () => {},
    clientFor: () => ({ list: async ({offset}) => { offsets.push(offset);
      return offset ? {items:[another],hasMore:false} : {items:[row],hasMore:true}; } }) });
  await state.open('scope'); await state.open('scope');
  await state.more('scope'); assert.equal(state.read('scope').rows.length, 2);
  assert.equal(state.read('scope').hasMore, false);
  await state.refresh('scope'); assert.equal(state.read('scope').rows.length, 1);
  assert.deepEqual(offsets,[0,1,0]); assert.equal(state.read('other'), null);
});
test('old workspace response cannot replace current state; clear invalidates pending reads', async () => {
  let active = 'a', resolveOld;
  const state = createOrderIntakeReadState({ isCurrent: scope => scope === active, onChange: () => {},
    clientFor: scope => ({list: () => scope === 'a' ? new Promise(resolve => {resolveOld=resolve;}) :
      Promise.resolve({items:[another],hasMore:false})}) });
  const pending = state.open('a'); await Promise.resolve(); active='b'; await state.open('b');
  resolveOld({items:[row],hasMore:false}); await pending;
  assert.deepEqual(state.read('b').rows,[another]); assert.equal(state.read('a'),null);
  state.clear(); assert.equal(state.read('b'),null);
});
test('duplicate page fails visibly and preserves previous records', async () => {
  const state = createOrderIntakeReadState({isCurrent:()=>true,onChange:()=>{},
    clientFor:()=>({list:async()=>({items:[row],hasMore:true})})});
  await state.open('a'); await state.more('a');
  assert.match(state.read('a').error,/Refresh/);
  assert.deepEqual(state.read('a').rows,[row]);
});
test('all views render actual records and honest partial scope; HTML is escaped', () => {
  for (const section of ['dashboard','workflow','search','all-orders']) {
    const html = renderOrderIntake({route:route(section),snapshot:{rows:[{...row,po_number:'<script>bad</script>'},another],hasMore:true}});
    assert.match(html,/2 matching of 2 loaded orders/); assert.match(html,/loaded records only/);
    assert.match(html,/Load more orders/); assert.doesNotMatch(html,/<script>bad/);
    assert.match(html,/&lt;script&gt;bad/);
  }
  const html = renderOrderIntake({route:route('dashboard'),snapshot:{rows:[row,another],hasMore:false}});
  assert.match(html,/PHP 100.00/); assert.match(html,/USD 100.00/);
  assert.match(html,/All available pages loaded/);
});
test('host wiring retains scope cleanup and uses native route without deleting board', () => {
  const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(src,/state.view='order-intake';state.boardId=null/);
  assert.match(src,/orderIntakeRead.open\(scope,nextRoute.section==='dashboard'\)/);
  assert.match(src,/clearOrderIntake\(\);\s*trashBoardSelection.clear/);
  assert.match(src,/data-oi-action/);
});
