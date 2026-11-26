// Browser storage is for unsaved drafts only, never committed activity records.
import {validDate} from './activity-model.js';

function draftKey(scope) {
  const {workspaceId, userId, personId, date, activityId = ''} = scope || {};
  if (![workspaceId, userId, personId].every(value => typeof value === 'string' && value.trim()) ||
      !validDate(date) || typeof activityId !== 'string') {
    throw new Error('A complete draft scope is required.');
  }
  return 'aps.dda.draft.v1:' + JSON.stringify([workspaceId, userId, personId, date, activityId]);
}

function normalizeDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid activity draft.');
  const fields = {};
  for (const key of ['title', 'details', 'status', 'categoryId']) {
    if (input[key] != null && typeof input[key] !== 'string') throw new Error('Invalid activity draft.');
    fields[key] = input[key] ?? '';
  }
  return fields;
}

export function writeActivityDraft(storage, scope, input) {
  storage.setItem(draftKey(scope), JSON.stringify(normalizeDraft(input)));
}

export function readActivityDraft(storage, scope) {
  const raw = storage.getItem(draftKey(scope));
  if (raw === null) return null;
  return normalizeDraft(JSON.parse(raw));
}

// Call only after a confirmed save or explicit discard.
export function clearActivityDraft(storage, scope) {
  storage.removeItem(draftKey(scope));
}
