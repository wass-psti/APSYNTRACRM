import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveApplicationLoadingState} from '../application-loading.js';

const app = readFileSync('frontend/app.js', 'utf8');

const signedShell = {
 pending: true,
 hasRenderedShell: true,
 isSignedIn: true,
 userId: 'user-1',
 workspaceId: 'workspace-1',
 renderedScope: 'user-1|workspace-1'
};

test('ready state does not retain a stale shell', () => {
 assert.equal(resolveApplicationLoadingState({ ...signedShell, pending: false }), 'ready');
});

test('cold startup keeps the existing blocking loader', () => {
 assert.equal(resolveApplicationLoadingState({
  pending: true,
  hasRenderedShell: false,
  isSignedIn: true,
  userId: 'user-1',
  workspaceId: 'workspace-1'
 }), 'show-loader');
});

test('same signed identity and workspace retain the mounted shell during reads', () => {
 assert.equal(resolveApplicationLoadingState(signedShell), 'retain-shell');
});

test('signed-out, identity changes, workspace changes, and workspace transitions never retain prior content', () => {
 assert.equal(resolveApplicationLoadingState({ ...signedShell, isSignedIn: false }), 'show-loader');
 assert.equal(resolveApplicationLoadingState({ ...signedShell, userId: 'user-2' }), 'show-loader');
 assert.equal(resolveApplicationLoadingState({ ...signedShell, workspaceId: 'workspace-2' }), 'show-loader');
 assert.equal(resolveApplicationLoadingState({ ...signedShell, workspaceTransitionPending: true }), 'show-loader');
});

test('missing scope values cannot retain a mounted shell', () => {
 assert.equal(resolveApplicationLoadingState({ ...signedShell, userId: '' }), 'show-loader');
 assert.equal(resolveApplicationLoadingState({ ...signedShell, workspaceId: null }), 'show-loader');
});

test('central read inventory covers the previously blocking application gates', () => {
 const pending = app.match(/function applicationReadPending\(\)\{([\s\S]*?)\n\}/)?.[1] || '';
 for (const source of [
  'initialAccountRoleReadPending',
  'applicationRouteRead',
  'state.loading',
  'state.nativeInitialRead',
  'state.ttReadLoading',
  'state.frtFinanceBusy',
  'state.fuelTrackBackendBusy',
  'talkBoxState.busy',
  'state.tradeLinkActivityBusy',
  'state.tradeLinkAnalyticsBusy',
  'state.tradeLinkDraft?.busy'
 ]) assert.ok(pending.includes(source), 'missing loading source: ' + source);
});

test('same-scope retention is resolved before render tears down existing board UI', () => {
 assert.match(app, /import \{resolveApplicationLoadingState,isCurrentApplicationRouteRead\} from '\.\/application-loading\.js';/);
 const renderStart = app.indexOf('function render(){');
 const retainGuard = app.indexOf("if(loadingState==='retain-shell')return;", renderStart);
 const dispose = app.indexOf('disposeBoardPagination?.()', renderStart);
 const reset = app.indexOf('resetBoardWindows()', renderStart);
 assert.ok(renderStart >= 0);
 assert.ok(retainGuard > renderStart);
 assert.ok(dispose > retainGuard);
 assert.ok(reset > retainGuard);
});
