/** Local-only FRT request draft recovery and duplicate-warning support. */
import {restoreFRTWizardDraft} from './frt-request-wizard.js';

export const FRT_REQUEST_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const FRT_REQUEST_DRAFT_SAVE_DELAY_MS = 10 * 1000;
export const FRT_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const companyCode = /^[A-Za-z0-9_-]{1,32}$/;
const safeFields = Object.freeze({
  companyCode: 32,
  dateNeeded: 10,
  fundSource: 180,
  checkNo: 180,
  requestName: 250,
  department: 180,
  description: 2500,
  orderIntakeNo: 180,
  recipientName: 180,
  recipientBank: 180
});

export function getFRTBrowserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function draftKey(workspaceId, userId) {
  if (!uuid.test(workspaceId || '') || !uuid.test(userId || '')) return null;
  return 'apsyntra:frt:request-draft:v1:' + workspaceId + ':' + userId;
}

function duplicateKey(workspaceId, userId) {
  if (!uuid.test(workspaceId || '') || !uuid.test(userId || '')) return null;
  return 'apsyntra:frt:duplicate-warning:v1:' + workspaceId + ':' + userId;
}

function boundedText(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function projectDraft(value) {
  if (!value || typeof value !== 'object' || !companyCode.test(value.companyCode || '') ||
      !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 100) return null;
  const fields = {};
  for (const [key, max] of Object.entries(safeFields)) {
    fields[key] = boundedText(value[key], max);
  }
  fields.companyCode = value.companyCode;
  fields.items = value.items.map(item => ({
    category: boundedText(item?.category, 180),
    amount: boundedText(item?.amount, 24)
  }));
  fields.step = Number.isInteger(value.step) && value.step >= 1 && value.step <= 3 ? value.step : 1;
  return fields;
}

export function createFRTRequestDraftStore({storage, workspaceId, userId, now = Date.now} = {}) {
  const key = draftKey(workspaceId, userId);
  const available = Boolean(key && storage &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function' &&
    typeof storage.removeItem === 'function');

  return Object.freeze({
    load() {
      if (!available) return null;
      try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const envelope = JSON.parse(raw);
        const timestamp = Number(envelope?.savedAt);
        const expiresAt = Number(envelope?.expiresAt);
        const draft = envelope?.version === 1 ? projectDraft(envelope.draft) : null;
        if (!draft || !Number.isFinite(timestamp) || !Number.isFinite(expiresAt) ||
            timestamp > now() || expiresAt <= now() || expiresAt - timestamp > FRT_REQUEST_DRAFT_TTL_MS) {
          storage.removeItem(key);
          return null;
        }
        return {...draft, savedAt: timestamp, expiresAt};
      } catch {
        try { storage.removeItem(key); } catch {}
        return null;
      }
    },
    save(value) {
      if (!available) return false;
      const draft = projectDraft(value);
      if (!draft) return false;
      const savedAt = now();
      try {
        storage.setItem(key, JSON.stringify({
          version: 1,
          savedAt,
          expiresAt: savedAt + FRT_REQUEST_DRAFT_TTL_MS,
          draft
        }));
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      if (!available) return false;
      try {
        storage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
    get available() {
      return available;
    }
  });
}

function totalCents(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) return null;
  let total = 0n;
  for (const item of items) {
    const amount = String(item?.amount ?? '').trim();
    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(amount)) return null;
    const [whole, fraction = ''] = amount.split('.');
    total += BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  }
  return total > 0n ? total.toString() : null;
}

function fingerprint(value) {
  const company = String(value?.companyCode || '');
  const payee = String(value?.recipientName || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  const amount = totalCents(value?.items);
  if (!companyCode.test(company) || payee.length < 2 || payee.length > 180 || !amount) return null;
  const source = company + '|' + payee + '|' + amount;
  let hash = 14695981039346656037n;
  for (const character of source) {
    hash ^= BigInt(character.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16).padStart(16, '0');
}

export function createFRTDuplicateGuard({storage, workspaceId, userId, now = Date.now} = {}) {
  const key = duplicateKey(workspaceId, userId);
  const available = Boolean(key && storage &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function' &&
    typeof storage.removeItem === 'function');

  const read = () => {
    if (!available) return [];
    try {
      const parsed = JSON.parse(storage.getItem(key) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(entry =>
        /^[0-9a-f]{16}$/.test(entry?.fingerprint || '') &&
        Number.isFinite(entry?.submittedAt) &&
        entry.submittedAt <= now() &&
        now() - entry.submittedAt <= FRT_DUPLICATE_WINDOW_MS
      ).slice(-20);
    } catch {
      return [];
    }
  };
  const write = entries => {
    if (!available) return false;
    try {
      storage.setItem(key, JSON.stringify(entries.slice(-20)));
      return true;
    } catch {
      return false;
    }
  };

  return Object.freeze({
    isRecentDuplicate(value) {
      const candidate = fingerprint(value);
      return Boolean(candidate && read().some(entry => entry.fingerprint === candidate));
    },
    record(value) {
      const candidate = fingerprint(value);
      if (!candidate || !available) return false;
      const entries = read().filter(entry => entry.fingerprint !== candidate);
      entries.push({fingerprint: candidate, submittedAt: now()});
      return write(entries);
    },
    clear() {
      if (!available) return false;
      try {
        storage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
    get available() {
      return available;
    }
  });
}

function formDraft(form, step) {
  const data = new FormData(form);
  return {
    companyCode: String(data.get('companyCode') || ''),
    dateNeeded: String(data.get('dateNeeded') || ''),
    fundSource: String(data.get('fundSource') || ''),
    checkNo: String(data.get('checkNo') || ''),
    requestName: String(data.get('requestName') || ''),
    department: String(data.get('department') || ''),
    description: String(data.get('description') || ''),
    orderIntakeNo: String(data.get('orderIntakeNo') || ''),
    recipientName: String(data.get('recipientName') || ''),
    recipientBank: String(data.get('recipientBank') || ''),
    items: data.getAll('expenseCategory').map((category, index) => ({
      category: String(category || ''),
      amount: String(data.getAll('expenseAmount')[index] || '')
    })),
    step
  };
}

export function mountFRTRequestDraft(view, {store, companies = [], wizard = null,
  delay = FRT_REQUEST_DRAFT_SAVE_DELAY_MS} = {}) {
  const form = view?.querySelector('#modal-form');
  const status = view?.querySelector('[data-frt-draft-status]');
  if (!form || !store) return null;

  let timer = null;
  let disposed = false;
  const pageTarget = typeof window === 'undefined' ? null : window;

  const setStatus = message => {
    if (status) status.textContent = message;
  };
  const persist = () => {
    if (disposed) return false;
    const saved = store.save(formDraft(form, wizard?.getStep?.() || 1));
    setStatus(saved
      ? 'Draft saved locally. It expires 24 hours after the latest change.'
      : 'Local draft storage is unavailable in this browser.');
    return saved;
  };
  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    return persist();
  };
  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      persist();
    }, Math.max(0, Number(delay) || 0));
  };
  const onInput = () => schedule();
  const onClose = event => {
    if (event.target === view || event.target?.closest?.('[data-dismiss]')) {
      flush();
      dispose();
    }
  };
  const onKeydown = event => {
    if (event.key === 'Escape') {
      flush();
      dispose();
    }
  };
  const onPageHide = () => flush();

  const existing = store.load();
  let restored = false;
  if (existing) {
    restored = restoreFRTWizardDraft(view, existing, {companies});
    if (restored) {
      wizard?.setStep?.(existing.step);
      setStatus('Draft restored from this browser. Bank account numbers and QR files must be entered again.');
    }
  }
  if (!restored) {
    setStatus('Draft autosaves locally every 10 seconds for 24 hours. Bank account numbers and QR files are not stored. Duplicate warnings are browser-local.');
  }

  form.addEventListener('input', onInput);
  form.addEventListener('change', onInput);
  form.addEventListener('submit', flush, true);
  view.addEventListener('click', onClose);
  view.addEventListener('keydown', onKeydown);
  pageTarget?.addEventListener('pagehide', onPageHide);

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    form.removeEventListener('input', onInput);
    form.removeEventListener('change', onInput);
    form.removeEventListener('submit', flush, true);
    view.removeEventListener('click', onClose);
    view.removeEventListener('keydown', onKeydown);
    pageTarget?.removeEventListener('pagehide', onPageHide);
  }

  return Object.freeze({
    restored,
    flush,
    clear() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      const cleared = store.clear();
      setStatus(cleared ? 'Draft cleared after successful request creation.' : 'Request created; local draft could not be cleared.');
      return cleared;
    },
    dispose
  });
}
