import {saveActivity, saveCategory, deleteActivity, filterActivities, statuses, validDate} from './activity-model.js';
import {readActivityDraft, writeActivityDraft, clearActivityDraft} from './activity-drafts.js';

function uniqueRows(rows, name) {
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.id !== 'string' || !row.id) ||
      new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Invalid DDA ' + name);
}

export function validateSnapshot(value, workspaceId) {
  if (!value || value.workspaceId !== workspaceId || !Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new Error('Invalid DDA workspace snapshot');
  }
  const {directory, categories, records} = value;
  uniqueRows(directory?.departments, 'departments');
  uniqueRows(directory?.people, 'personnel');
  uniqueRows(categories, 'categories');
  uniqueRows(records, 'records');
  const departmentIds = new Set(directory.departments.map(row => row.id));
  const personIds = new Set(directory.people.map(row => row.id));
  const categoryIds = new Set(categories.map(row => row.id));
  if (directory.departments.some(row => typeof row.name !== 'string') ||
      directory.people.some(row => typeof row.name !== 'string' || !departmentIds.has(row.departmentId)) ||
      categories.some(row => typeof row.name !== 'string' || !row.name.trim()) ||
      records.some(row => !personIds.has(row.personId) || !departmentIds.has(row.departmentId) ||
        !validDate(row.date) || !statuses.includes(row.status) || typeof row.title !== 'string' ||
        typeof row.details !== 'string' || (row.categoryId != null && !categoryIds.has(row.categoryId)))) {
    throw new Error('Invalid DDA snapshot relationships');
  }
  return structuredClone(value);
}

// Transport contract: load(workspaceId) and mutate(command) return an authoritative
// snapshot. Mutation must atomically compare expectedRevision and acknowledge the
// requested change. Neither implementation nor credentials are supplied here.
export function createActivityController({repository, workspaceId, userId, draftStorage, makeId = () => crypto.randomUUID()}) {
  if (!workspaceId || !userId || typeof repository?.load !== 'function' || typeof repository?.mutate !== 'function') {
    throw new Error('DDA requires a workspace, signed account and activity repository');
  }
  let snapshot = null;
  let busy = false;
  let disposed = false;
  let requiresReload = false;

  function checkActive() {
    if (disposed) throw new Error('DDA controller disposed');
  }

  async function run(work) {
    checkActive();
    if (busy) throw new Error('DDA operation already in progress');
    busy = true;
    try { return await work(); }
    finally { busy = false; }
  }

  function current() {
    checkActive();
    if (!snapshot) throw new Error('Load DDA before editing');
    return snapshot;
  }

  function scope(input) {
    return {workspaceId, userId, personId:input.personId, date:input.date, activityId:input.activityId || ''};
  }

  async function load() {
    return run(async () => {
      const next = validateSnapshot(await repository.load(workspaceId), workspaceId);
      checkActive();
      if (snapshot && next.revision < snapshot.revision) throw new Error('Stale DDA snapshot');
      snapshot = next;
      requiresReload = false;
      return structuredClone(snapshot);
    });
  }

  async function commit(action, record, verify, draftScope) {
    if (requiresReload) throw new Error('Reload DDA before retrying an uncertain change');
    const previous = current();
    let next;
    try {
      next = validateSnapshot(await repository.mutate({
        workspaceId, expectedRevision:previous.revision, requestId:makeId(), action, record
      }, {draftScope}), workspaceId);
      checkActive();
      if (next.revision <= previous.revision || !verify(next)) throw new Error('DDA change was not acknowledged');
    } catch (error) {
      requiresReload = true;
      throw error;
    }
    snapshot = next;
    let draftWarning = next.draftWarning || null;
    if (draftScope && draftStorage && !repository.managesDraftRecovery) {
      try { clearActivityDraft(draftStorage, draftScope); }
      catch { draftWarning = 'Saved on server; local draft could not be cleared.'; }
    }
    return {snapshot:structuredClone(snapshot), draftWarning};
  }

  function save(input, id = '') {
    return run(async () => {
      const {records, directory, categories} = current();
      const recordId = id || makeId();
      const next = saveActivity(records, directory, categories, input, id, () => recordId);
      const record = next.find(item => item.id === recordId);
      return commit('save-activity', record, value => value.records.some(item =>
        Object.keys(record).every(key => (item[key] ?? null) === (record[key] ?? null))
      ), scope({...input, activityId:id}));
    });
  }

  function remove(id) {
    return run(async () => {
      deleteActivity(current().records, id);
      return commit('delete-activity', {id}, value => !value.records.some(item => item.id === id));
    });
  }

  function saveActivityCategory(input, id = '') {
    return run(async () => {
      const categoryId = id || makeId();
      const category = saveCategory(current().categories, input, id, () => categoryId).find(item => item.id === categoryId);
      return commit('save-category', category, value => value.categories.some(item => item.id === category.id && item.name === category.name));
    });
  }

  return {
    load, save, remove, saveCategory:saveActivityCategory,
    getSnapshot:() => structuredClone(current()),
    getRecords:filters => structuredClone(filterActivities(current().records, filters)),
    get busy() { return busy; },
    get requiresReload() { return requiresReload; },
    recoverDraft(input) { checkActive(); return draftStorage ? readActivityDraft(draftStorage, scope(input)) : null; },
    storeDraft(input, fields) { checkActive(); if (draftStorage) writeActivityDraft(draftStorage, scope(input), fields); },
    discardDraft(input) { checkActive(); if (draftStorage) clearActivityDraft(draftStorage, scope(input)); },
    dispose() { disposed = true; snapshot = null; }
  };
}
