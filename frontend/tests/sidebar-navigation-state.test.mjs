import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSidebarActiveHref} from '../sidebar-navigation-state.js';

const recentBoards = ['recent-board-1', 'recent-board-2'];

test('all TradeLink document and application routes select only the TradeLink sidebar item', () => {
 const routes = [
  '#/tradelink',
  '#/tradelink/drafts/quotation',
  '#/tradelink/drafts/esi',
  '#/tradelink/drafts/po',
  '#/tradelink/drafts/delivery',
  '#/tradelink/drafts/packing',
  '#/tradelink/drafts/payment',
  '#/tradelink/documents',
  '#/tradelink/documents/record/123',
  '#/tradelink/activity',
  '#/tradelink/analytics'
 ];
 for (const route of routes) {
  assert.equal(resolveSidebarActiveHref(route, recentBoards), '#/tradelink', route);
 }
});

test('direct routes and hash-history transitions always resolve to one current destination', () => {
 const transitions = [
  ['#/overview', '#/overview'],
  ['#/tradelink/drafts/quotation', '#/tradelink'],
  ['#/settings/profile', '#/settings'],
  ['#/tradelink/analytics', '#/tradelink'],
  ['#/fm1/ticket/123', '#/fm1'],
  ['#/boards/recent-board-1', '#/boards/recent-board-1']
 ];
 for (const [route, expected] of transitions) {
  const activeHref = resolveSidebarActiveHref(route, recentBoards);
  assert.equal(activeHref, expected, route);
  const renderedLinks = [
   '#/overview', '#/boards', '#/fm1', '#/time-tracker',
   '#/fund-tracker', '#/fueltrack', '#/tradelink', '#/settings',
   '#/boards/recent-board-1', '#/boards/recent-board-2'
  ];
  const active = renderedLinks.filter(href => href === activeHref);
  assert.deepEqual(active, [expected], route + ' must select exactly one rendered item');
 }
});

test('board details select their recent item or fall back to My boards when not in Recent boards', () => {
 assert.equal(resolveSidebarActiveHref('#/boards/recent-board-2', recentBoards), '#/boards/recent-board-2');
 assert.equal(resolveSidebarActiveHref('#/boards/older-board', recentBoards), '#/boards');
 assert.equal(resolveSidebarActiveHref('#/boards', recentBoards), '#/boards');
});

test('query strings do not change the route-derived active destination', () => {
 assert.equal(resolveSidebarActiveHref('#/tradelink/drafts/quotation?source=search', recentBoards), '#/tradelink');
 assert.equal(resolveSidebarActiveHref('#/settings?tab=profile', recentBoards), '#/settings');
});

test('unknown routes do not leave a stale navigation item selected', () => {
 assert.equal(resolveSidebarActiveHref('#/unknown/module', recentBoards), null);
});
