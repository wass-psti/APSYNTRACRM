/** Shared read state; bounded pages and stale-response protection. */
export function createOrderIntakeReadState({ clientFor, isCurrent, onChange }) {
  let generation = 0;
  let snapshot = null;
  const emit = next => { snapshot = next; onChange(); };
  const current = (scope, run) => generation === run && isCurrent(scope);
  const same = scope => snapshot?.scope === scope;
  async function load(scope, { more = false, refresh = false } = {}) {
    if (!isCurrent(scope)) return;
    if (same(scope) && !refresh && !more) return;
    if (more && (!same(scope) || snapshot.busy || !snapshot.hasMore)) return;
    const previous = same(scope) ? snapshot : null;
    const run = ++generation;
    const rows = more ? previous.rows : [];
    emit({ scope, rows: previous?.rows || [], busy: true, hasMore: previous?.hasMore ?? true, error: '' });
    try {
      const page = await clientFor(scope).list({ offset: rows.length, limit: 100 });
      if (!current(scope, run)) return;
      const combined = [...rows, ...page.items];
      if (new Set(combined.map(row => row.id)).size !== combined.length) {
        throw new Error('Orders changed while paging. Refresh to reconcile.');
      }
      emit({ scope, rows: combined, busy: false, hasMore: page.hasMore, error: '' });
    } catch (error) {
      if (current(scope, run)) emit({ scope, rows: previous?.rows || [], busy: false,
        hasMore: previous?.hasMore ?? true, error: error?.message || 'Order retrieval failed' });
    }
  }
  return {
    open: scope => load(scope),
    refresh: scope => load(scope, { refresh: true }),
    more: scope => load(scope, { more: true }),
    read: scope => same(scope) ? snapshot : null,
    clear() { generation++; snapshot = null; }
  };
}

export function filterOrderIntakeRows(rows, filters = {}) {
  const words = String(filters.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(row => {
    const haystack = [row.po_number, row.client_name, row.account_manager, row.company, row.industry]
      .map(value => String(value ?? '').toLowerCase());
    return words.every(word => haystack.some(value => value.includes(word))) &&
      (!filters.year || String(row.fiscal_year) === filters.year) &&
      (!filters.status || row.status === filters.status) &&
      (!filters.company || row.company === filters.company) &&
      (!filters.industry || row.industry === filters.industry) &&
      (!filters.currency || (filters.currency==='Unknown currency' ? row.record_kind==='legacy'&&!row.currency : row.currency === filters.currency)) &&
      (!filters.from || (row.date_received && row.date_received >= filters.from)) &&
      (!filters.to || (row.date_received && row.date_received <= filters.to));
  });
}
