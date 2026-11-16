import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  FRT_REQUEST_DRAFT_TTL_MS,
  FRT_DUPLICATE_WINDOW_MS,
  createFRTRequestDraftStore,
  createFRTDuplicateGuard
} from '../frt-request-draft.js';
import {restoreFRTWizardDraft} from '../frt-request-wizard.js';

const workspaceId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';
const companies = [{code: 'WASS'}, {code: 'WAO'}, {code: 'PSTI'}];

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const draft = {
  companyCode: 'WASS',
  requestDate: '2026-11-17',
  dateNeeded: '2026-11-30',
  fundSource: 'WASS Operating Account',
  checkNo: 'CHK-100',
  requestName: 'November supplies',
  department: 'Operations',
  description: 'Monthly operating supplies',
  orderIntakeNo: 'OI-2026-100',
  recipientName: 'Example Supplier',
  recipientBank: 'Example Bank',
  recipientAccountName: 'Sensitive Account Holder',
  recipientAccount: '1234567890123456',
  qrFile: 'data:image/png;base64,private-content',
  items: [
    {category: 'Office supplies', amount: '180.50'},
    {category: 'Fuel', amount: '250.00'}
  ],
  step: 2
};

test('request drafts round-trip for 24 hours with only supported non-account fields', () => {
  const storage = new MemoryStorage();
  let now = 1000;
  const store = createFRTRequestDraftStore({storage, workspaceId, userId, now: () => now});
  assert.equal(store.available, true);
  assert.equal(store.save(draft), true);
  const restored = store.load();
  assert.equal(restored.companyCode, 'WASS');
  assert.equal(restored.step, 2);
  assert.deepEqual(restored.items, draft.items);
  assert.equal(restored.recipientName, 'Example Supplier');
  assert.equal(restored.recipientBank, 'Example Bank');
  assert.equal('recipientAccount' in restored, false);
  assert.equal('recipientAccountName' in restored, false);
  assert.equal('qrFile' in restored, false);
  const serialized = [...storage.values.values()].join('');
  assert.doesNotMatch(serialized, /1234567890123456|Sensitive Account Holder|private-content/);
  assert.equal(restored.expiresAt - restored.savedAt, FRT_REQUEST_DRAFT_TTL_MS);
  now += FRT_REQUEST_DRAFT_TTL_MS;
  assert.equal(store.load(), null);
  assert.equal(storage.values.size, 0);
});

test('expired, malformed and unsupported drafts are discarded without throwing', () => {
  const storage = new MemoryStorage();
  const store = createFRTRequestDraftStore({storage, workspaceId, userId});
  const key = 'apsyntra:frt:request-draft:v1:' + workspaceId + ':' + userId;
  storage.setItem(key, '{bad json');
  assert.equal(store.load(), null);
  assert.equal(storage.getItem(key), null);
  assert.equal(store.save({...draft, items: []}), false);
  assert.equal(createFRTRequestDraftStore({storage, workspaceId: 'invalid', userId}).available, false);
});

test('restoration only applies a company in the signed bootstrap roster and rebuilds expense rows', () => {
  const controls = Object.fromEntries([
    'companyCode', 'requestDate', 'dateNeeded', 'fundSource', 'checkNo', 'requestName',
    'department', 'description', 'orderIntakeNo', 'recipientName', 'recipientBank'
  ].map(name => [name, {value: ''}]));
  const form = {elements: {namedItem: name => controls[name] || null}};
  const host = {
    children: [],
    set innerHTML(markup) {
      const count = (markup.match(/data-expense-index=/g) || []).length;
      this.children = Array.from({length: count}, () => {
        const fields = {
          '[name="expenseCategory"]': {value: ''},
          '[name="expenseAmount"]': {value: ''}
        };
        return {querySelector: selector => fields[selector] || null};
      });
    }
  };
  const view = {querySelector: selector =>
    selector === '#modal-form' ? form :
      selector === '[data-frt-expenses]' ? host : null};

  assert.equal(restoreFRTWizardDraft(view, draft, {companies}), true);
  assert.equal(controls.companyCode.value, 'WASS');
  assert.equal(controls.requestDate.value, '2026-11-17');
  assert.equal(controls.requestName.value, 'November supplies');
  assert.equal(controls.recipientName.value, 'Example Supplier');
  assert.equal(host.children.length, 2);
  assert.equal(host.children[0].querySelector('[name="expenseCategory"]').value, 'Office supplies');
  assert.equal(host.children[1].querySelector('[name="expenseAmount"]').value, '250.00');
  assert.equal(restoreFRTWizardDraft(view, {...draft, companyCode: 'UNLISTED'}, {companies}), false);
});

test('duplicate warning uses exact decimal totals, company and normalized payee within ten minutes', () => {
  const storage = new MemoryStorage();
  let now = 50_000;
  const guard = createFRTDuplicateGuard({storage, workspaceId, userId, now: () => now});
  const payload = {
    companyCode: 'WASS',
    recipientName: '  Example   Supplier ',
    items: [{category: 'Office supplies', amount: '180.50'}, {category: 'Fuel', amount: '250.00'}]
  };
  assert.equal(guard.isRecentDuplicate(payload), false);
  assert.equal(guard.record(payload), true);
  assert.equal(guard.isRecentDuplicate({...payload, recipientName: 'example supplier'}), true);
  assert.equal(guard.isRecentDuplicate({...payload, companyCode: 'PSTI'}), false);
  assert.equal(guard.isRecentDuplicate({...payload, items: [{category: 'Other', amount: '430.51'}]}), false);
  assert.doesNotMatch([...storage.values.values()].join(''), /Example Supplier|example supplier/);
  now += FRT_DUPLICATE_WINDOW_MS + 1;
  assert.equal(guard.isRecentDuplicate(payload), false);
});

test('duplicate guard stores bounded fingerprints only and keeps separate user/workspace scopes', () => {
  const storage = new MemoryStorage();
  const guard = createFRTDuplicateGuard({storage, workspaceId, userId});
  const payload = {companyCode: 'WAO', recipientName: 'Supplier B', items: [{amount: '100.00'}]};
  assert.equal(guard.record(payload), true);
  const otherUser = createFRTDuplicateGuard({
    storage, workspaceId, userId: '33333333-3333-4333-8333-333333333333'
  });
  assert.equal(otherUser.isRecentDuplicate(payload), false);
  assert.equal(guard.isRecentDuplicate(payload), true);
  assert.equal(guard.clear(), true);
  assert.equal(guard.isRecentDuplicate(payload), false);
});

test('FRT wizard and application wire draft recovery and duplicate confirmation without new backend calls', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const wizard = readFileSync(new URL('../frt-request-wizard.js', import.meta.url), 'utf8');
  assert.match(app, /createFRTRequestDraftStore/);
  assert.match(app, /createFRTDuplicateGuard/);
  assert.match(app, /mountFRTRequestDraft/);
  assert.match(app, /duplicateGuard\.isRecentDuplicate\(payload\)/);
  assert.match(app, /duplicateGuard\.record\(payload\)/);
  assert.match(app, /draftController\?\.clear\(\)/);
  assert.match(app, /Potential duplicate: the same company, payee and total/);
  assert.match(wizard, /data-frt-draft-status/);
  assert.match(wizard, /restoreFRTWizardDraft/);
  assert.match(wizard, /setStep\(nextStep\)/);
  assert.doesNotMatch(app, /frt_create_request.*duplicate/i);
});
